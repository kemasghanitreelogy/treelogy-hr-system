import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapOvertime } from "@/lib/data";
import { notifyApprovers, pushNotifications } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import { isValidUploadedPath } from "@/lib/storage-path";
import { applyApproval, type ApprovalAction } from "@/lib/approval";
import { contractRatePerHour, overtimePayEstimate, parseContractType } from "@/lib/overtime";
import { can, getSessionUser } from "@/lib/auth";
import type { RequestStatus } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const PROOF_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];

function parseDataUrl(dataUrl: string | undefined): { mime: string; buffer: Buffer } | null {
  if (!dataUrl) return null;
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

/** Minutes since midnight for an "HH:MM" string. */
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

interface CreatePayload {
  employeeId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  proofFile?: string;
  proofPath?: string;
}

interface UpdatePayload {
  id?: string;
  action?: ApprovalAction;
  /** Required when action === "reject": why the request is being rejected. */
  reason?: string;
}

async function auth() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase };
}

// ---- Create an overtime request ----
export async function POST(req: Request) {
  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  if (!body.date || !ISO_DATE.test(body.date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (!body.startTime || !body.endTime || !HHMM.test(body.startTime) || !HHMM.test(body.endTime)) {
    return NextResponse.json({ error: "invalid_time" }, { status: 400 });
  }
  const minutes = toMin(body.endTime) - toMin(body.startTime);
  if (minutes <= 0) return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  const hours = Math.round((minutes / 60) * 100) / 100;

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Snapshot the hourly rate + contract type from the employee. PKWT and
  // part-time are paid flat (part-time at its own hourly wage); PKWTT pays
  // 1.5× the first hour then 2× the rest.
  const { data: emp } = await supabase!
    .from("employees")
    .select("base_salary, hourly_rate, name, team, contract_type")
    .eq("id", body.employeeId)
    .maybeSingle();
  const baseSalary = Number(emp?.base_salary) || 0;
  const contractType = parseContractType(emp?.contract_type);
  const ratePerHour = contractRatePerHour(contractType, baseSalary, Number(emp?.hourly_rate) || 0);
  const amount = overtimePayEstimate(ratePerHour, hours, contractType);

  // Optional proof file. Preferred: client uploaded straight to storage and
  // sent the path. Fallback: base64 data URL uploaded here (demo / no Supabase).
  let proofPath: string | null = null;
  if (body.proofPath) {
    if (!isValidUploadedPath(body.proofPath, body.employeeId, PROOF_EXTS)) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
    proofPath = body.proofPath;
  } else if (body.proofFile) {
    const proof = parseDataUrl(body.proofFile);
    if (!proof || !PROOF_EXT[proof.mime]) {
      return NextResponse.json({ error: "invalid_proof_type" }, { status: 400 });
    }
    if (proof.buffer.length > PROOF_MAX_BYTES) {
      return NextResponse.json({ error: "proof_too_large" }, { status: 400 });
    }
    const path = `${body.employeeId}/${crypto.randomUUID()}.${PROOF_EXT[proof.mime]}`;
    const { error: upErr } = await supabase!.storage
      .from("overtime-proofs")
      .upload(path, proof.buffer, { contentType: proof.mime, upsert: false });
    if (upErr) return NextResponse.json({ error: "proof_upload_failed" }, { status: 403 });
    proofPath = path;
  }

  const row = {
    employee_id: body.employeeId,
    date: body.date,
    start_time: body.startTime,
    end_time: body.endTime,
    hours,
    reason: body.reason?.trim() || null,
    rate_per_hour: ratePerHour,
    amount,
    contract_type: contractType,
    status: "pending",
    proof_path: proofPath,
  };

  const { data, error } = await supabase!.from("overtime_requests").insert(row).select("*").single();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Notify the approvers (HR/admin + division manager).
  if (emp?.team) {
    await notifyApprovers(body.employeeId, {
      type: "overtime",
      title: `${emp.name ?? "Karyawan"} mengajukan lembur`,
      body: `${formatDate(body.date)} · ${hours} jam · perlu persetujuan Anda`,
      href: "/overtime",
    });
  }

  return NextResponse.json({ ok: true, request: mapOvertime(data) });
}

// ---- Dual approval: manager (atasan) first, then HR. RLS gates who may write. ----
export async function PATCH(req: Request) {
  let body: UpdatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (!body.action || !["approve", "reject", "reset"].includes(body.action)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (body.action === "reject" && !body.reason?.trim()) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prev } = await supabase!
    .from("overtime_requests")
    .select("status, employee_id, manager_approver, hr_approver, date, hours")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: emp } = await supabase!.from("employees").select("team").eq("id", prev.employee_id).maybeSingle();

  const isHR = can(user, "employees.manage");
  let isManager = false;
  if (!isHR) {
    const { data: mgr } = await supabase!.rpc("is_manager_of", { target_employee: prev.employee_id });
    isManager = mgr === true;
  }
  if (body.action === "reset" && !isHR) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  if (body.action !== "reset" && !isHR && !isManager) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Manager step is required only when the requester has a direct atasan
  // (manager_id) who can approve. No atasan → HR finalises directly.
  const { data: needMgr } = await supabase!.rpc("employee_requires_manager", { emp: prev.employee_id });
  const managerRequired = needMgr === true;

  const result = applyApproval({
    action: body.action,
    role: isHR ? "hr" : "manager",
    actorName: user.name,
    managerRequired,
    current: {
      status: prev.status as RequestStatus,
      managerApprover: (prev.manager_approver as string) ?? null,
      hrApprover: (prev.hr_approver as string) ?? null,
    },
    nowIso: new Date().toISOString(),
    reason: body.reason,
  });
  if (result.error || !result.update) {
    return NextResponse.json({ error: result.error ?? "forbidden_or_failed" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("overtime_requests")
    .update(result.update)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  const meta = `${formatDate(String(data.date))} · ${data.hours} jam`;
  if (result.status === "approved" || result.status === "rejected") {
    const reasonNote = result.status === "rejected" && data.rejection_reason ? ` · "${data.rejection_reason}"` : "";
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "overtime",
        tone: result.status,
        title: `Lembur ${result.status === "approved" ? "disetujui" : "ditolak"}`,
        body: `${meta}${data.approver ? ` · oleh ${data.approver}` : ""}${reasonNote}`,
        href: "/overtime",
      },
    ]);
  } else if (body.action === "approve" && !isHR) {
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "overtime",
        tone: "pending",
        title: "Lembur disetujui atasan",
        body: `${meta} · oleh ${user.name} — menunggu HR`,
        href: "/overtime",
      },
    ]);
    if (emp?.team) {
      await notifyApprovers(String(data.employee_id), {
        type: "overtime",
        title: "Lembur menunggu persetujuan HR",
        body: `${meta} · sudah disetujui atasan`,
        href: "/overtime",
      });
    }
  }

  return NextResponse.json({ ok: true, request: mapOvertime(data) });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapLeave } from "@/lib/data";
import { adjustLeaveUsage } from "@/lib/balance";
import { notifyApprovers, pushNotifications } from "@/lib/notify";
import { applyApproval, type ApprovalAction } from "@/lib/approval";
import { can, getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { isValidUploadedPath } from "@/lib/storage-path";
import type { LeaveType, RequestStatus } from "@/lib/types";

export const runtime = "nodejs";

const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: "Cuti tahunan",
  sick: "Sakit",
  unpaid: "Cuti tanpa gaji",
  "tukar-libur": "Tukar libur",
  company: "Cuti perusahaan",
};

const LEAVE_TYPES: LeaveType[] = ["annual", "sick", "unpaid", "tukar-libur", "company"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Optional proof attachment: image or PDF, up to ~5 MB.
const PROOF_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];

interface CreatePayload {
  employeeId?: string;
  type?: LeaveType;
  startDate?: string;
  endDate?: string;
  reason?: string;
  /** Optional proof, as a `data:<mime>;base64,...` URL (demo / fallback). */
  proofFile?: string;
  /** Optional proof already uploaded directly to storage — "<empId>/<uuid>.<ext>". */
  proofPath?: string;
}

/** Parse a `data:` URL into {mime, buffer}; returns null when absent/invalid. */
function parseDataUrl(dataUrl: string | undefined): { mime: string; buffer: Buffer } | null {
  if (!dataUrl) return null;
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

interface UpdatePayload {
  id?: string;
  action?: ApprovalAction;
  /** Required when action === "reject": why the request is being rejected. */
  reason?: string;
}

function dayCount(start: string, end: string): number {
  const d = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return Math.max(1, d);
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

// ---- Create a leave/permission request ----
export async function POST(req: Request) {
  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  if (!body.type || !LEAVE_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  if (!body.startDate || !body.endDate || !ISO_DATE.test(body.startDate) || !ISO_DATE.test(body.endDate)) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }
  if (body.endDate < body.startDate) {
    return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

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
      .from("leave-proofs")
      .upload(path, proof.buffer, { contentType: proof.mime, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: "proof_upload_failed" }, { status: 403 });
    }
    proofPath = path;
  }

  const row = {
    employee_id: body.employeeId,
    type: body.type,
    start_date: body.startDate,
    end_date: body.endDate,
    days: dayCount(body.startDate, body.endDate),
    reason: body.reason?.trim() || null,
    status: "pending",
    proof_path: proofPath,
  };

  const { data, error } = await supabase!.from("leave_requests").insert(row).select("*").single();
  // RLS rejects inserts for other employees (non-HR) → no row.
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Notify the approvers (HR/admin + division manager).
  const { data: emp } = await supabase!
    .from("employees")
    .select("name, team")
    .eq("id", body.employeeId)
    .maybeSingle();
  if (emp?.team) {
    await notifyApprovers(body.employeeId, String(emp.team), {
      type: "leave",
      title: `${emp.name ?? "Karyawan"} mengajukan ${LEAVE_LABEL[body.type].toLowerCase()}`,
      body: `${formatDate(body.startDate)}–${formatDate(body.endDate)} · perlu persetujuan Anda`,
      href: "/leave",
    });
  }

  return NextResponse.json({ ok: true, request: mapLeave(data) });
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

  // Prior state — balance moves only on a genuine approved↔not transition.
  const { data: prev } = await supabase!
    .from("leave_requests")
    .select("status, type, days, employee_id, manager_approver, hr_approver, start_date, end_date")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: emp } = await supabase!.from("employees").select("team").eq("id", prev.employee_id).maybeSingle();

  // Acting capacity: HR/admin fill the HR slot; otherwise a team manager (verified
  // by RLS-backed RPC) fills the manager slot. Reset is HR-only.
  const isHR = can(user, "employees.manage");
  let isManager = false;
  if (!isHR) {
    const { data: mgr } = await supabase!.rpc("is_team_manager_of", { target_employee: prev.employee_id });
    isManager = mgr === true;
  }
  if (body.action === "reset" && !isHR) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  if (body.action !== "reset" && !isHR && !isManager) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Is a manager step required? Only if the team actually has a (non-HR) manager.
  let managerRequired = false;
  if (emp?.team) {
    const { data: hasMgr } = await supabase!.rpc("team_has_manager", { req_team: emp.team, exclude_emp: prev.employee_id });
    managerRequired = hasMgr === true;
  }

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
    .from("leave_requests")
    .update(result.update)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  // Keep annual_used / sick_used in sync — only when fully approved (or undone).
  const wasApproved = prev.status === "approved";
  const nowApproved = result.status === "approved";
  const type = prev.type as LeaveType;
  const days = Number(prev.days ?? 0);
  if (!wasApproved && nowApproved) await adjustLeaveUsage(String(prev.employee_id), type, days);
  else if (wasApproved && !nowApproved) await adjustLeaveUsage(String(prev.employee_id), type, -days);

  // Notifications: final decision → requester; manager's partial approval →
  // requester + nudge HR that it's their turn.
  const label = LEAVE_LABEL[data.type as LeaveType];
  const range = `${formatDate(String(data.start_date))}–${formatDate(String(data.end_date))}`;
  if (result.status === "approved" || result.status === "rejected") {
    const reasonNote = result.status === "rejected" && data.rejection_reason ? ` · "${data.rejection_reason}"` : "";
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "leave",
        tone: result.status,
        title: `${label} ${result.status === "approved" ? "disetujui" : "ditolak"}`,
        body: `${range}${data.approver ? ` · oleh ${data.approver}` : ""}${reasonNote}`,
        href: "/leave",
      },
    ]);
  } else if (body.action === "approve" && !isHR) {
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "leave",
        tone: "pending",
        title: `${label} disetujui atasan`,
        body: `${range} · oleh ${user.name} — menunggu HR`,
        href: "/leave",
      },
    ]);
    if (emp?.team) {
      await notifyApprovers(String(data.employee_id), String(emp.team), {
        type: "leave",
        title: `${label} menunggu persetujuan HR`,
        body: `${range} · sudah disetujui atasan`,
        href: "/leave",
      });
    }
  }

  return NextResponse.json({ ok: true, request: mapLeave(data) });
}

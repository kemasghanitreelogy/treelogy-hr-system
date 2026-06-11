import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapLeave } from "@/lib/data";
import { adjustLeaveUsage } from "@/lib/balance";
import { notifyApprovers, pushNotifications } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import type { LeaveType, RequestStatus } from "@/lib/types";

export const runtime = "nodejs";

const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: "Cuti tahunan",
  sick: "Sakit",
  unpaid: "Cuti tanpa gaji",
  "tukar-libur": "Tukar libur",
};

const LEAVE_TYPES: LeaveType[] = ["annual", "sick", "unpaid", "tukar-libur"];
const STATUSES: RequestStatus[] = ["pending", "approved", "rejected"];
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

interface CreatePayload {
  employeeId?: string;
  type?: LeaveType;
  startDate?: string;
  endDate?: string;
  reason?: string;
  /** Optional proof, as a `data:<mime>;base64,...` URL. */
  proofFile?: string;
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
  status?: RequestStatus;
  approver?: string;
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

  // Optional proof file — validate type/size, then upload to the private bucket.
  let proofPath: string | null = null;
  const proof = parseDataUrl(body.proofFile);
  if (body.proofFile) {
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

// ---- Approve / reject a request (HR only via RLS) ----
export async function PATCH(req: Request) {
  let body: UpdatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (!body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Read the prior status so the balance moves only on a genuine transition.
  const { data: prev } = await supabase!
    .from("leave_requests")
    .select("status, type, days, employee_id")
    .eq("id", body.id)
    .maybeSingle();

  const update: Record<string, unknown> = { status: body.status };
  if (body.status === "approved" || body.status === "rejected") {
    update.approver = body.approver?.trim() || null;
  }

  const { data, error } = await supabase!
    .from("leave_requests")
    .update(update)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Keep the leave balance (annual_used / sick_used) in sync with approvals.
  if (prev) {
    const wasApproved = prev.status === "approved";
    const nowApproved = body.status === "approved";
    const type = prev.type as LeaveType;
    const days = Number(prev.days ?? 0);
    if (!wasApproved && nowApproved) {
      await adjustLeaveUsage(String(prev.employee_id), type, days);
    } else if (wasApproved && !nowApproved) {
      await adjustLeaveUsage(String(prev.employee_id), type, -days);
    }
  }

  // Notify the requester of the decision.
  await pushNotifications([
    {
      employeeId: String(data.employee_id),
      type: "leave",
      tone: body.status,
      title: `${LEAVE_LABEL[data.type as LeaveType]} ${body.status === "approved" ? "disetujui" : "ditolak"}`,
      body: `${formatDate(String(data.start_date))}–${formatDate(String(data.end_date))}${data.approver ? ` · oleh ${data.approver}` : ""}`,
      href: "/leave",
    },
  ]);

  return NextResponse.json({ ok: true, request: mapLeave(data) });
}

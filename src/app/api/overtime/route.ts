import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapOvertime } from "@/lib/data";
import { notifyApprovers, pushNotifications } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import type { RequestStatus } from "@/lib/types";

export const runtime = "nodejs";

const STATUSES: RequestStatus[] = ["pending", "approved", "rejected"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Hourly overtime rate = monthly base salary / 20 working days / 8 hours.
const OVERTIME_DIVISOR = 20 * 8;

const PROOF_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

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
}

interface UpdatePayload {
  id?: string;
  status?: RequestStatus;
  approver?: string;
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

  // Snapshot the hourly rate from the employee's current base salary.
  const { data: emp } = await supabase!
    .from("employees")
    .select("base_salary, name, team")
    .eq("id", body.employeeId)
    .maybeSingle();
  const ratePerHour = Math.round((Number(emp?.base_salary) || 0) / OVERTIME_DIVISOR);
  const amount = Math.round(ratePerHour * hours);

  // Optional proof file.
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
    status: "pending",
    proof_path: proofPath,
  };

  const { data, error } = await supabase!.from("overtime_requests").insert(row).select("*").single();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Notify the approvers (HR/admin + division manager).
  if (emp?.team) {
    await notifyApprovers(body.employeeId, String(emp.team), {
      type: "overtime",
      title: `${emp.name ?? "Karyawan"} mengajukan lembur`,
      body: `${formatDate(body.date)} · ${hours} jam · perlu persetujuan Anda`,
      href: "/overtime",
    });
  }

  return NextResponse.json({ ok: true, request: mapOvertime(data) });
}

// ---- Approve / reject ----
export async function PATCH(req: Request) {
  let body: UpdatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.status) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    update.status = body.status;
    update.approver = body.approver?.trim() || null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!
    .from("overtime_requests")
    .update(update)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Notify the requester of the approval decision.
  const meta = `${formatDate(String(data.date))} · ${data.hours} jam`;
  if (body.status === "approved" || body.status === "rejected") {
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "overtime",
        tone: body.status,
        title: `Lembur ${body.status === "approved" ? "disetujui" : "ditolak"}`,
        body: `${meta}${data.approver ? ` · oleh ${data.approver}` : ""}`,
        href: "/overtime",
      },
    ]);
  }

  return NextResponse.json({ ok: true, request: mapOvertime(data) });
}

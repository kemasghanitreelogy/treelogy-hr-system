import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapTabungan } from "@/lib/data";
import { adjustTabungan, readTabunganBalance } from "@/lib/balance";
import { notifyApprovers, pushNotifications } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import type { RequestStatus, TabunganKind } from "@/lib/types";

export const runtime = "nodejs";

const KINDS: TabunganKind[] = ["deposit", "withdrawal"];
const STATUSES: RequestStatus[] = ["pending", "approved", "rejected"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

interface CreatePayload {
  employeeId?: string;
  kind?: TabunganKind;
  eventDate?: string;
  days?: number;
  reason?: string;
  proofFile?: string;
}

interface UpdatePayload {
  id?: string;
  status?: RequestStatus;
  approver?: string;
  /** Required when status === "rejected": why the entry is being rejected. */
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

const KIND_LABEL: Record<TabunganKind, string> = {
  deposit: "setor tabungan libur",
  withdrawal: "pencairan tabungan libur",
};

// ---- Create a tabungan entry (employee withdrawal, or manual HR deposit) ----
export async function POST(req: Request) {
  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  if (!body.kind || !KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (!body.eventDate || !ISO_DATE.test(body.eventDate)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  const days = Math.max(1, Math.floor(Number(body.days) || 1));

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Withdrawal can't exceed the current saved balance.
  if (body.kind === "withdrawal") {
    const balance = await readTabunganBalance(body.employeeId);
    if (balance != null && days > balance) {
      return NextResponse.json({ error: "insufficient_balance", balance }, { status: 400 });
    }
  }

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
      .from("tabungan-proofs")
      .upload(path, proof.buffer, { contentType: proof.mime, upsert: false });
    if (upErr) return NextResponse.json({ error: "proof_upload_failed" }, { status: 403 });
    proofPath = path;
  }

  const row = {
    employee_id: body.employeeId,
    kind: body.kind,
    days,
    event_date: body.eventDate,
    reason: body.reason?.trim() || null,
    source: "manual",
    status: "pending",
    proof_path: proofPath,
  };

  const { data, error } = await supabase!
    .from("tabungan_libur_entries")
    .insert(row)
    .select("*")
    .single();
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
      type: "tabungan",
      title: `${emp.name ?? "Karyawan"} mengajukan ${KIND_LABEL[body.kind]}`,
      body: `${formatDate(body.eventDate)} · ${days} hari · perlu persetujuan Anda`,
      href: "/shifts",
    });
  }

  return NextResponse.json({ ok: true, request: mapTabungan(data) });
}

// ---- Approve / reject; keeps the cached balance in sync ----
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
  if (body.status === "rejected" && !body.reason?.trim()) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Read the current entry (RLS-scoped) so we know the prior status and can
  // apply the balance delta only on a genuine transition.
  const { data: prev } = await supabase!
    .from("tabungan_libur_entries")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const wasApproved = prev.status === "approved";
  const nowApproved = body.status === "approved";
  const kind = prev.kind as TabunganKind;
  const days = Number(prev.days ?? 1);
  const employeeId = String(prev.employee_id);

  // Guard: approving a withdrawal must not overdraw the bank.
  if (!wasApproved && nowApproved && kind === "withdrawal") {
    const balance = await readTabunganBalance(employeeId);
    if (balance != null && days > balance) {
      return NextResponse.json({ error: "insufficient_balance", balance }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = {
    status: body.status,
    approver: body.approver?.trim() || null,
    rejection_reason: body.status === "rejected" ? body.reason!.trim() : null,
    decided_at: body.status === "pending" ? null : new Date().toISOString(),
  };

  const { data, error } = await supabase!
    .from("tabungan_libur_entries")
    .update(update)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Apply the cached-balance delta exactly once per transition.
  const sign = kind === "deposit" ? 1 : -1;
  if (!wasApproved && nowApproved) {
    await adjustTabungan(employeeId, sign * days); // newly approved → apply
  } else if (wasApproved && !nowApproved) {
    await adjustTabungan(employeeId, -sign * days); // un-approved → reverse
  }

  // Notify the requester of the decision.
  if (body.status === "approved" || body.status === "rejected") {
    const reasonNote = body.status === "rejected" && data.rejection_reason ? ` · "${data.rejection_reason}"` : "";
    await pushNotifications([
      {
        employeeId,
        type: "tabungan",
        tone: body.status,
        title: `${kind === "deposit" ? "Setoran" : "Pencairan"} tabungan libur ${body.status === "approved" ? "disetujui" : "ditolak"}`,
        body: `${formatDate(String(data.event_date))} · ${days} hari${data.approver ? ` · oleh ${data.approver}` : ""}${reasonNote}`,
        href: "/shifts",
      },
    ]);
  }

  return NextResponse.json({ ok: true, request: mapTabungan(data) });
}

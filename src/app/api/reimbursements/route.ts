import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapTravelReimbursement } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { notifyPermissionHolders, pushNotifications } from "@/lib/notify";
import { applyApproval, type ApprovalAction } from "@/lib/approval";
import { isValidUploadedPath } from "@/lib/storage-path";
import { revisionGuard, revisionReset } from "@/lib/revision";
import { formatDate, rupiah } from "@/lib/utils";
import { MAX_RECEIPTS, RECEIPT_EXTS, REIMB_CATEGORIES } from "@/lib/reimbursement";
import type { ReimbursementCategory, RequestStatus } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RUPIAH = 1_000_000_000;
/** Batas kewarasan: satu perjalanan maksimal ~3 bulan. */
const MAX_TRIP_DAYS = 92;

interface CreatePayload {
  employeeId?: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  expenseDate?: string;
  category?: ReimbursementCategory;
  description?: string;
  receiptNumber?: string;
  amount?: number;
  receiptPaths?: string[];
  confirmed?: boolean;
}

interface DecidePayload {
  id?: string;
  action?: ApprovalAction;
  /** Wajib saat action = "reject". */
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

/**
 * Aturan isian klaim — dipakai POST (pengajuan baru) DAN PUT (revisi) supaya
 * validasinya tidak pernah bercabang. Mengembalikan kode error atau null.
 */
function validateClaim(body: CreatePayload & { employeeId?: string }): string | null {
  if (!body.employeeId) return "employee_required";
  if (!body.purpose?.trim()) return "purpose_required";
  if (!body.description?.trim()) return "description_required";
  if (!body.startDate || !ISO_DATE.test(body.startDate) || !body.endDate || !ISO_DATE.test(body.endDate)) {
    return "invalid_dates";
  }
  if (body.endDate < body.startDate) return "end_before_start";
  const days = Math.round((Date.parse(body.endDate) - Date.parse(body.startDate)) / 86_400_000) + 1;
  if (days > MAX_TRIP_DAYS) return "out_of_range";
  if (!body.expenseDate || !ISO_DATE.test(body.expenseDate)) return "invalid_date";
  if (!REIMB_CATEGORIES.includes(body.category ?? "other")) return "invalid_category";
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RUPIAH) return "amount_required";
  // Pernyataan karyawan pada form asli — diperiksa di server juga supaya tidak
  // bisa dilewati dengan memanggil API langsung.
  if (body.confirmed !== true) return "confirmation_required";

  // Klaim tanpa bukti tidak bisa diverifikasi Finance.
  const receiptPaths = (body.receiptPaths ?? []).filter(Boolean);
  if (receiptPaths.length === 0) return "receipt_required";
  if (receiptPaths.length > MAX_RECEIPTS) return "too_many_files";
  for (const path of receiptPaths) {
    if (!isValidUploadedPath(path, body.employeeId, RECEIPT_EXTS)) return "invalid_path";
  }
  return null;
}

// ---- Ajukan klaim ----
export async function POST(req: Request) {
  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const invalid = validateClaim(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const receiptPaths = (body.receiptPaths ?? []).filter(Boolean);
  const category = body.category ?? "other";

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Nama & jabatan TIDAK diketik pengaju — diambil dari data karyawan.
  const { data: emp } = await supabase!
    .from("employees")
    .select("name, position")
    .eq("id", body.employeeId)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: "unknown_employee" }, { status: 400 });

  const { data, error } = await supabase!
    .from("travel_reimbursements")
    .insert({
      employee_id: body.employeeId,
      job_title: (emp.position as string)?.trim() || "—",
      purpose: body.purpose!.trim(),
      start_date: body.startDate,
      end_date: body.endDate,
      expense_date: body.expenseDate,
      category,
      description: body.description!.trim(),
      receipt_number: body.receiptNumber?.trim() || null,
      amount: Math.round(Number(body.amount)),
      receipt_paths: receiptPaths,
      confirmed: true,
      status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  // Yang harus BERAKSI diberi tahu di HP-nya: penyetuju tahap 1 (Ops/GA).
  await notifyPermissionHolders(
    "reimbursement.approve",
    {
      type: "reimbursement",
      title: `${emp.name ?? "Karyawan"} mengajukan reimbursement perjalanan`,
      body: `${data.description} · ${rupiah(Number(data.amount))} · perlu persetujuan tahap 1 Anda`,
      href: "/reimbursements",
    },
    { excludeEmployeeId: body.employeeId },
  );

  return NextResponse.json({ ok: true, request: mapTravelReimbursement(data) });
}

// ---- Revisi oleh PENGAJU: perbaiki datanya lalu kirim ulang ----
//
// Dipakai setelah klaim DITOLAK (atau selagi masih menunggu). Statusnya
// kembali 'pending' dan tanda tangan tahap 1/2 dihapus — lihat lib/revision.ts.
export async function PUT(req: Request) {
  let body: CreatePayload & { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prev } = await supabase!
    .from("travel_reimbursements")
    .select("employee_id, status, rejection_reason, receipt_paths")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const guard = revisionGuard(prev, user.employeeId ?? null);
  if (guard) return NextResponse.json({ error: guard }, { status: guard === "already_decided" ? 400 : 403 });

  // Aturan isian sama persis dengan pengajuan baru — tidak boleh bercabang.
  const invalid = validateClaim({ ...body, employeeId: String(prev.employee_id) });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data, error } = await supabase!
    .from("travel_reimbursements")
    .update({
      purpose: body.purpose!.trim(),
      start_date: body.startDate,
      end_date: body.endDate,
      expense_date: body.expenseDate,
      category: body.category ?? "other",
      description: body.description!.trim(),
      receipt_number: body.receiptNumber?.trim() || null,
      amount: Math.round(Number(body.amount)),
      receipt_paths: (body.receiptPaths ?? []).filter(Boolean),
      confirmed: true,
      ...revisionReset(prev.rejection_reason),
    })
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  await notifyPermissionHolders(
    "reimbursement.approve",
    {
      type: "reimbursement",
      title: `${user.name} memperbaiki klaim reimbursement`,
      body: `${data.description} · ${rupiah(Number(data.amount))} · perlu ditinjau ulang`,
      href: "/reimbursements",
    },
    { excludeEmployeeId: user.employeeId },
  );

  return NextResponse.json({ ok: true, request: mapTravelReimbursement(data) });
}

// ---- Keputusan dua tahap: Ops (approve) → Finance (finalize) ----
// Tahap ditentukan STATUS baris, bukan pilihan client. Praktik four-eyes:
// tak boleh memutus klaim sendiri, dan kedua tahap harus orang berbeda.
export async function PATCH(req: Request) {
  let body: DecidePayload;
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
    .from("travel_reimbursements")
    .select("status, employee_id, manager_approver, hr_approver, description, amount, expense_date")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isOps = can(user, "reimbursement.approve");
  const isFinal = can(user, "reimbursement.finalize") || can(user, "employees.manage");
  if (!isOps && !isFinal) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  // Empat mata: tidak ada yang boleh memutus klaimnya SENDIRI.
  if (body.action !== "reset" && prev.employee_id === user.employeeId) {
    return NextResponse.json({ error: "self_approval" }, { status: 403 });
  }
  if (body.action === "reset" && !isFinal) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Belum ada tanda tangan tahap 1 → slot manager_*; sudah → slot final hr_*.
  const stage: "manager" | "hr" = prev.manager_approver ? "hr" : "manager";
  if (body.action === "approve" || body.action === "reject") {
    if (stage === "hr" && !isFinal) {
      return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
    }
    if (stage === "hr" && body.action === "approve" && prev.manager_approver === user.name) {
      return NextResponse.json({ error: "distinct_approver" }, { status: 400 });
    }
  }

  const result = applyApproval({
    action: body.action,
    role: stage,
    actorName: user.name,
    // Dua tahap wajib berurutan: final tidak bisa melompati tahap 1.
    managerRequired: true,
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
    .from("travel_reimbursements")
    .update(result.update)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  const ringkas = `${data.description} · ${rupiah(Number(data.amount))}`;

  // Tahap 1 selesai (status masih pending) → giliran Finance beraksi.
  if (body.action === "approve" && result.status === "pending") {
    await notifyPermissionHolders(
      "reimbursement.finalize",
      {
        type: "reimbursement",
        title: "Reimbursement menunggu persetujuan akhir",
        body: `${ringkas} · lolos tahap 1 (${user.name}) · perlu keputusan Anda`,
        href: "/reimbursements",
      },
      { excludeEmployeeId: user.employeeId },
    );
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "reimbursement",
        tone: "pending",
        title: "Reimbursement lolos tahap 1",
        body: `${ringkas} · disetujui ${user.name} · menunggu persetujuan Finance`,
        href: "/reimbursements",
      },
    ]);
  }

  if (result.status === "approved" || result.status === "rejected") {
    const alasan =
      result.status === "rejected" && data.rejection_reason ? ` · "${data.rejection_reason}"` : "";
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "reimbursement",
        tone: result.status,
        title: `Reimbursement ${result.status === "approved" ? "disetujui" : "ditolak"}`,
        body: `${ringkas} · ${formatDate(String(data.expense_date))}${
          data.approver ? ` · oleh ${data.approver}` : ""
        }${alasan}${result.status === "rejected" ? " · Buka untuk perbaiki & kirim ulang" : ""}`,
        href: "/reimbursements",
      },
    ]);
  }

  return NextResponse.json({ ok: true, request: mapTravelReimbursement(data) });
}

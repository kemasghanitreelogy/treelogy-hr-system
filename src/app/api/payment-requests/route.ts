import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapPaymentRequest } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";
import { notifyPermissionHolders } from "@/lib/notify";
import { isValidUploadedPath } from "@/lib/storage-path";
import { rupiah } from "@/lib/utils";
import { can } from "@/lib/auth";
import { sheetsMode } from "@/lib/sheets";
import { notifyPermissionHolders as notifyHolders } from "@/lib/notify";
import { revisionGuard, revisionReset } from "@/lib/revision";
import { DEPARTMENTS, KINDS, MAX_INVOICE_FILES, PAYMENT_FLOWS, composeInvoiceLine, eligibleForSheet } from "@/lib/payment-request";
import { salinKeSheet } from "./sheet-sync";
import type { PaymentDept, PaymentFlow, PaymentKind } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];
const MAX_RUPIAH = 10_000_000_000;

interface Payload {
  flow?: PaymentFlow;
  department?: PaymentDept;
  kind?: PaymentKind;
  kindOther?: string;
  invoiceDate?: string;
  description?: string;
  vendorName?: string;
  totalAmount?: number;
  invoicePaths?: string[];
  approvalPath?: string;
  dueDate?: string | null;
  moreDetails?: string;
}

/**
 * Aturan isian pengajuan — dipakai POST (baru) DAN PUT (revisi) supaya
 * validasinya tidak pernah bercabang antara kedua jalur.
 * Mengembalikan kode error, atau null bila sah.
 */
function validateBody(body: Payload, employeeId: string): string | null {
  if (!PAYMENT_FLOWS.includes(body.flow ?? "biasa")) return "invalid_input";
  if (!body.department || !DEPARTMENTS.includes(body.department)) return "department_required";
  if (!body.kind || !KINDS.includes(body.kind)) return "invalid_kind";
  if (body.kind === "other" && !body.kindOther?.trim()) return "invalid_kind_other";
  if (!body.description?.trim()) return "description_required";
  if (!body.invoiceDate || !ISO_DATE.test(body.invoiceDate)) return "invoice_date_required";
  if (!body.vendorName?.trim()) return "vendor_required";
  const amount = Number(body.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RUPIAH) return "amount_required";
  if (body.dueDate && !ISO_DATE.test(body.dueDate)) return "invalid_date";

  // Berkas diunggah klien langsung ke bucket privat; di sini hanya BENTUK
  // path-nya yang diperiksa (RLS storage sudah menjaga hak tulisnya).
  const invoicePaths = (body.invoicePaths ?? []).filter(Boolean);
  if (invoicePaths.length === 0) return "invoice_required";
  if (invoicePaths.length > MAX_INVOICE_FILES) return "too_many_files";
  if (!body.approvalPath) return "approval_required";
  for (const path of [...invoicePaths, body.approvalPath]) {
    if (!isValidUploadedPath(path, employeeId, FILE_EXTS)) return "invalid_path";
  }
  return null;
}

export async function POST(request: Request) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const flow: PaymentFlow = body.flow ?? "biasa";

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.employeeId) return NextResponse.json({ error: "no_employee" }, { status: 400 });

  const invalid = validateBody(body, user.employeeId);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const invoicePaths = (body.invoicePaths ?? []).filter(Boolean);

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      employee_id: user.employeeId,
      department: body.department,
      requester_name: user.name,
      email: user.email,
      kind: body.kind,
      kind_other: body.kind === "other" ? body.kindOther!.trim() : null,
      invoice_date: body.invoiceDate,
      description: body.description!.trim(),
      vendor_name: body.vendorName!.trim(),
      total_amount: Math.round(Number(body.totalAmount)),
      invoice_paths: invoicePaths,
      approval_path: body.approvalPath,
      due_date: body.dueDate || null,
      more_details: body.moreDetails?.trim() || null,
      flow,
      // Jalur biasa langsung final; jalur dinas menunggu persetujuan Ops dulu.
      approval_status: flow === "dinas" ? "waiting_ops" : "approved",
      sheet_status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  const saved = mapPaymentRequest(data);
  const ringkas = `${composeInvoiceLine(saved)} · ${rupiah(saved.totalAmount)}`;

  // Jalur DINAS: belum masuk sheet — panggil dulu penyetuju tahap 1.
  if (flow === "dinas") {
    await notifyHolders(
      "payment.approve_ops",
      {
        type: "payment",
        title: `${user.name} mengajukan reimburse dinas`,
        body: `${ringkas} · perlu persetujuan tahap 1 Anda`,
        href: "/payment-requests",
      },
      { excludeEmployeeId: user.employeeId },
    );
    return NextResponse.json({ ok: true, request: saved, sheet: { ok: true, ditunda: true } });
  }

  // Jalur BIASA: salin ke Google Sheet keuangan sekarang juga. Kegagalan di sini
  // tidak membatalkan pengajuan — barisnya aman dan bisa dikirim ulang.
  const result = await salinKeSheet(saved, new URL(request.url).origin);

  await notifyPermissionHolders(
    "payment.manage",
    {
      type: "payment",
      title: `${user.name} mengajukan pembayaran`,
      body: ringkas,
      href: "/payment-requests",
    },
    { excludeEmployeeId: user.employeeId },
  );

  return NextResponse.json({
    ok: true,
    request: {
      ...saved,
      sheetStatus: result.ok ? "synced" : "failed",
      sheetError: result.ok ? null : result.reason,
      sheetSyncedAt: result.ok ? new Date().toISOString() : null,
    },
    sheet: result.ok ? { ok: true } : { ok: false, reason: result.reason, mode: sheetsMode() },
  });
}

// ---- Revisi oleh PENGAJU setelah ditolak (jalur dinas) ----
export async function PUT(request: Request) {
  let body: Payload & { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: prev } = await supabase
    .from("payment_requests")
    .select("employee_id, approval_status, rejection_reason, flow")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // revisionGuard memakai kolom `status`; di sini statusnya `approval_status`.
  const guard = revisionGuard(
    { employee_id: prev.employee_id, status: prev.approval_status === "rejected" ? "rejected" : "approved" },
    user.employeeId ?? null,
  );
  if (guard) return NextResponse.json({ error: guard }, { status: guard === "already_decided" ? 400 : 403 });

  const invalid = validateBody(body, user.employeeId!);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const reset = revisionReset(prev.rejection_reason);
  const { data, error } = await supabase
    .from("payment_requests")
    .update({
      department: body.department,
      kind: body.kind,
      kind_other: body.kind === "other" ? body.kindOther!.trim() : null,
      invoice_date: body.invoiceDate,
      description: body.description!.trim(),
      vendor_name: body.vendorName!.trim(),
      total_amount: Math.round(Number(body.totalAmount)),
      invoice_paths: (body.invoicePaths ?? []).filter(Boolean),
      approval_path: body.approvalPath,
      due_date: body.dueDate || null,
      more_details: body.moreDetails?.trim() || null,
      // Kembali ke meja penyetuju tahap 1 dari nol.
      approval_status: "waiting_ops",
      ops_approver: null,
      ops_approved_at: null,
      finance_approver: null,
      finance_approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      revision_note: reset.revision_note,
    })
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  const saved = mapPaymentRequest(data);
  await notifyHolders(
    "payment.approve_ops",
    {
      type: "payment",
      title: `${user.name} memperbaiki pengajuan reimburse dinas`,
      body: `${composeInvoiceLine(saved)} · ${rupiah(saved.totalAmount)} · perlu ditinjau ulang`,
      href: "/payment-requests",
    },
    { excludeEmployeeId: user.employeeId },
  );
  return NextResponse.json({ ok: true, request: saved });
}

// ---- Kirim ulang baris yang gagal masuk sheet (Finance/HR) ----
export async function PATCH(request: Request) {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  // Wajib diperiksa di sini: status ditulis memakai service role, jadi RLS tidak
  // menjaga endpoint ini. Tanpa pemeriksaan, siapa pun bisa menambah baris sheet.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user, "payment.manage") && !can(user, "employees.manage")) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  const { data: row } = await supabase.from("payment_requests").select("*").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Penjaga anti-duplikat: baris yang sudah masuk sheet tidak dikirim lagi.
  if (row.sheet_status === "synced") {
    return NextResponse.json({ error: "already_synced" }, { status: 400 });
  }
  // Jalur dinas baru boleh masuk sheet setelah persetujuan akhir.
  const current = mapPaymentRequest(row);
  if (!eligibleForSheet(current)) {
    return NextResponse.json({ error: "not_ops_approved" }, { status: 400 });
  }

  const result = await salinKeSheet(current, new URL(request.url).origin);
  const { data } = await supabase.from("payment_requests").select("*").eq("id", body.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: result.ok,
    request: mapPaymentRequest(data),
    reason: result.ok ? null : result.reason,
  });
}

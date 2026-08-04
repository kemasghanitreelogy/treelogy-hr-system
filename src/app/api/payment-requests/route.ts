import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapPaymentRequest } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { isValidUploadedPath } from "@/lib/storage-path";
import { appendSheetRow, sheetsMode } from "@/lib/sheets";
import {
  DEPARTMENTS, KINDS, MAX_INVOICE_FILES, SHEET_DEPT, composeInvoiceLine,
  formatSheetTimestamp, sheetKindText,
} from "@/lib/payment-request";
import type { PaymentDept, PaymentKind, PaymentRequest } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];
const MAX_RUPIAH = 10_000_000_000;

interface Payload {
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
 * Nilai untuk satu baris sheet.
 *
 * Dikirim sebagai PEMETAAN nama-kolom → nilai, bukan urutan posisi. Apps Script
 * membaca baris header lalu menaruh tiap nilai pada kolom yang cocok, sehingga
 * salah-kolom tidak mungkin terjadi dan Finance tetap bebas menggeser kolom.
 * Array `values` hanya cadangan bila skrip di sheet masih versi lama.
 */
function sheetValues(req: PaymentRequest, origin: string) {
  const fileUrl = (path: string) =>
    `${origin}/api/payment-requests/file?path=${encodeURIComponent(path)}`;
  const stamp = formatSheetTimestamp(req.submittedAt);
  // Kunci = penggalan nama kolom di sheet; Apps Script yang mencocokkannya.
  // Urutan array hanya dipakai sebagai cadangan bila skrip masih versi lama.
  const record: Record<string, string | number> = {
    "timestamp": stamp,
    "department": SHEET_DEPT[req.department],
    "name": req.requesterName,
    "email address": req.email,
    "type of reimbursement": sheetKindText(req),
    // Tiga bagian disatukan HANYA di sini, supaya kolom sheet tetap seperti biasa.
    "invoice date": composeInvoiceLine(req),
    "total amount": req.totalAmount,        // angka polos, seperti diminta form
    "attach your invoice": req.invoicePaths.map(fileUrl).join(", "),
    "due date": req.dueDate ?? "",
    "more details": req.moreDetails ?? "",
    "attach proof": fileUrl(req.approvalPath),
  };
  return { values: Object.values(record), record };
}


/**
 * Tulis hasil penyalinan ke sheet memakai service role, BUKAN sesi pengguna.
 *
 * sheet_status adalah kolom milik sistem: pengaju (Karyawan biasa) tidak punya
 * hak UPDATE pada tabel ini, jadi menulisnya lewat sesi pengguna akan ditolak
 * RLS. Sebelumnya kegagalan itu tidak diperiksa, sehingga setiap pengajuan
 * karyawan tampak "gagal masuk sheet" padahal berhasil — dan Finance akan
 * mengirim ulang, menghasilkan BARIS GANDA di sheet keuangan.
 */
async function catatStatusSheet(
  id: string,
  result: { ok: true } | { ok: false; reason: string },
): Promise<{ tercatat: boolean; alasan?: string }> {
  const patch = result.ok
    ? { sheet_status: "synced", sheet_synced_at: new Date().toISOString(), sheet_error: null }
    : { sheet_status: "failed", sheet_error: result.reason };

  const admin = createAdminClient();
  if (!admin) return { tercatat: false, alasan: "admin_client_unavailable" };

  const { error } = await admin.from("payment_requests").update(patch).eq("id", id);
  if (error) return { tercatat: false, alasan: error.message };
  return { tercatat: true };
}

export async function POST(request: Request) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.department || !DEPARTMENTS.includes(body.department)) {
    return NextResponse.json({ error: "department_required" }, { status: 400 });
  }
  if (!body.kind || !KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (body.kind === "other" && !body.kindOther?.trim()) {
    return NextResponse.json({ error: "invalid_kind_other" }, { status: 400 });
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description_required" }, { status: 400 });
  }
  if (!body.invoiceDate || !ISO_DATE.test(body.invoiceDate)) {
    return NextResponse.json({ error: "invoice_date_required" }, { status: 400 });
  }
  if (!body.vendorName?.trim()) {
    return NextResponse.json({ error: "vendor_required" }, { status: 400 });
  }
  const amount = Number(body.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RUPIAH) {
    return NextResponse.json({ error: "amount_required" }, { status: 400 });
  }
  if (body.dueDate && !ISO_DATE.test(body.dueDate)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.employeeId) return NextResponse.json({ error: "no_employee" }, { status: 400 });

  // Berkas diunggah klien langsung ke bucket privat; di sini hanya bentuk
  // path-nya yang diperiksa (RLS storage sudah menjaga hak tulisnya).
  const invoicePaths = (body.invoicePaths ?? []).filter(Boolean);
  if (invoicePaths.length === 0) {
    return NextResponse.json({ error: "invoice_required" }, { status: 400 });
  }
  if (invoicePaths.length > MAX_INVOICE_FILES) {
    return NextResponse.json({ error: "too_many_files" }, { status: 400 });
  }
  if (!body.approvalPath) {
    return NextResponse.json({ error: "approval_required" }, { status: 400 });
  }
  for (const path of [...invoicePaths, body.approvalPath]) {
    if (!isValidUploadedPath(path, user.employeeId, FILE_EXTS)) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
  }

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
      description: body.description.trim(),
      vendor_name: body.vendorName.trim(),
      total_amount: Math.round(amount),
      invoice_paths: invoicePaths,
      approval_path: body.approvalPath,
      due_date: body.dueDate || null,
      more_details: body.moreDetails?.trim() || null,
      sheet_status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  const saved = mapPaymentRequest(data);

  // Salin ke Google Sheet. Kegagalan di sini TIDAK membatalkan pengajuan —
  // barisnya sudah aman di database dan bisa dikirim ulang.
  const origin = new URL(request.url).origin;
  const { values, record } = sheetValues(saved, origin);
  const result = await appendSheetRow(values, record);
  const catat = await catatStatusSheet(saved.id, result);

  return NextResponse.json({
    ok: true,
    request: {
      ...saved,
      sheetStatus: result.ok ? "synced" : "failed",
      sheetError: result.ok ? null : result.reason,
      sheetSyncedAt: result.ok ? new Date().toISOString() : null,
    },
    sheet: result.ok
      ? { ok: true, statusTersimpan: catat.tercatat }
      : { ok: false, reason: result.reason, mode: sheetsMode() },
  });
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

  // Wajib diperiksa di sini: sejak status ditulis memakai service role, RLS
  // tidak lagi menjaga endpoint ini. Tanpa pemeriksaan, karyawan mana pun bisa
  // memicu penambahan baris ke sheet keuangan.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user, "payment.manage") && !can(user, "employees.manage")) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  const { data: row } = await supabase.from("payment_requests").select("*").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Penjaga anti-duplikat: baris yang sudah masuk sheet tidak boleh dikirim lagi.
  // Kirim ulang hanya untuk yang benar-benar gagal.
  if (row.sheet_status === "synced") {
    return NextResponse.json({ error: "already_synced" }, { status: 400 });
  }

  const saved = mapPaymentRequest(row);
  const { values, record } = sheetValues(saved, new URL(request.url).origin);
  const result = await appendSheetRow(values, record);

  await catatStatusSheet(body.id, result);
  const { data } = await supabase.from("payment_requests").select("*").eq("id", body.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: result.ok,
    request: mapPaymentRequest(data),
    reason: result.ok ? null : result.reason,
  });
}

import { createAdminClient } from "@/lib/supabase/admin";
import { signedFileUrl } from "@/lib/file-link";
import { appendSheetRow } from "@/lib/sheets";
import {
  SHEET_DEPT, composeInvoiceLine, formatSheetTimestamp, sheetKindText,
} from "@/lib/payment-request";
import type { PaymentRequest } from "@/lib/types";

/**
 * Penyalinan satu pengajuan ke Google Sheet keuangan — dipakai dua route:
 * persetujuan tahap 1 (salinan pertama kali) dan kirim-ulang saat gagal.
 * Sejak alur dua tahap, baris BARU ditulis ke sheet setelah ops menyetujui,
 * bukan saat submit — Finance hanya melihat yang sudah lolos tahap 1.
 */

/**
 * Nilai untuk satu baris sheet.
 *
 * Dikirim sebagai PEMETAAN nama-kolom → nilai, bukan urutan posisi. Apps Script
 * membaca baris header lalu menaruh tiap nilai pada kolom yang cocok, sehingga
 * salah-kolom tidak mungkin terjadi dan Finance tetap bebas menggeser kolom.
 * Array `values` hanya cadangan bila skrip di sheet masih versi lama.
 */
export function sheetValues(req: PaymentRequest, origin: string) {
  // Bertanda tangan: baris di sheet dibaca orang yang belum tentu punya akun
  // aplikasi HR, jadi tautannya harus bisa dibuka tanpa login.
  const fileUrl = (path: string) => signedFileUrl(origin, path);
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
 * RLS. Kegagalan yang tak diperiksa membuat pengajuan tampak "gagal masuk
 * sheet" padahal berhasil — dan kirim-ulang menghasilkan BARIS GANDA.
 */
export async function catatStatusSheet(
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

/** Salin satu pengajuan ke sheet lalu catat hasilnya. */
export async function salinKeSheet(req: PaymentRequest, origin: string) {
  const { values, record } = sheetValues(req, origin);
  const result = await appendSheetRow(values, record);
  await catatStatusSheet(req.id, result);
  return result;
}

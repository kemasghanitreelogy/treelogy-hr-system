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
    ? { sheet_status: "synced", sheet_synced_at: new Date().toISOString(), sheet_error: null, sheet_claimed_at: null }
    : { sheet_status: "failed", sheet_error: result.reason, sheet_claimed_at: null };

  const admin = createAdminClient();
  if (!admin) return { tercatat: false, alasan: "admin_client_unavailable" };

  const { error } = await admin.from("payment_requests").update(patch).eq("id", id);
  if (error) return { tercatat: false, alasan: error.message };
  return { tercatat: true };
}

/** Giliran yang menggantung dilepas setelah ini (server mati di tengah kirim). */
const CLAIM_STALE_MS = 2 * 60 * 1000;

/**
 * Ambil giliran menulis satu pengajuan ke sheet — satu operasi tunggal di
 * database, bukan "baca lalu tulis".
 *
 * Ini penjaga anti-duplikat yang sebenarnya. Pemeriksaan sebelumnya (baca
 * status, lalu kirim) bisa dilewati dua permintaan yang datang bersamaan:
 * keduanya membaca "belum masuk sheet", keduanya mengirim, dan sheet keuangan
 * mendapat dua baris identik. Di sini penanda 'sending' dipasang lewat UPDATE
 * bersyarat: hanya satu permintaan yang mendapat barisnya kembali, sisanya
 * mendapat nol baris dan berhenti tanpa mengirim apa pun.
 */
export async function ambilGiliranSheet(id: string): Promise<"ok" | "sedang_dikirim" | "sudah_masuk" | "gagal"> {
  const admin = createAdminClient();
  if (!admin) return "gagal";

  const stale = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  const { data, error } = await admin
    .from("payment_requests")
    .update({ sheet_status: "sending", sheet_claimed_at: new Date().toISOString() })
    .eq("id", id)
    .neq("sheet_status", "synced")
    // Baris yang sedang dikirim orang lain hanya boleh direbut kalau
    // gilirannya sudah menggantung terlalu lama.
    .or(`sheet_status.neq.sending,sheet_claimed_at.lt.${stale}`)
    .select("id");

  if (error) return "gagal";
  if (data && data.length > 0) return "ok";

  // Tidak dapat giliran: cari tahu kenapa, supaya pesannya tepat.
  const { data: row } = await admin
    .from("payment_requests")
    .select("sheet_status")
    .eq("id", id)
    .maybeSingle();
  if (row?.sheet_status === "synced") return "sudah_masuk";
  if (row?.sheet_status === "sending") return "sedang_dikirim";
  return "gagal";
}

/** Lepaskan giliran tanpa mengirim (mis. syarat lain tidak terpenuhi). */
export async function lepasGiliranSheet(id: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("payment_requests")
    .update({ sheet_status: "pending", sheet_claimed_at: null })
    .eq("id", id)
    .eq("sheet_status", "sending");
}

/**
 * Salin satu pengajuan ke sheet lalu catat hasilnya.
 *
 * `sudahDiambil` dipakai pemanggil yang sudah memegang giliran (lihat
 * ambilGiliranSheet) supaya tidak mengambilnya dua kali.
 */
export async function salinKeSheet(
  req: PaymentRequest,
  origin: string,
  sudahDiambil = false,
) {
  if (!sudahDiambil) {
    const giliran = await ambilGiliranSheet(req.id);
    if (giliran === "sudah_masuk") return { ok: true as const };
    if (giliran !== "ok") {
      return { ok: false as const, reason: giliran === "sedang_dikirim" ? "sedang_dikirim" : "claim_failed" };
    }
  }
  const { values, record } = sheetValues(req, origin);
  const result = await appendSheetRow(values, record, req.id);
  await catatStatusSheet(req.id, result);
  return result;
}

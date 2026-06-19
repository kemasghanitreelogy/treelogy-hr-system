/**
 * Maps the API's machine error codes (`{ error: "..." }`) to precise, friendly
 * messages — so every failed add/edit/delete tells the user exactly what went
 * wrong, not just "failed". Unknown codes fall back to the raw code, and bodies
 * with no JSON (e.g. a platform 413) fall back to the HTTP status, so the cause
 * is never hidden.
 */

import type { Locale } from "@/lib/i18n";

type Msg = { id: string; en: string };

const MESSAGES: Record<string, Msg> = {
  // --- auth / permission ---
  unauthorized: { id: "Sesi berakhir. Silakan masuk lagi.", en: "Session expired. Please sign in again." },
  forbidden_or_failed: { id: "Tidak ada izin, atau data gagal disimpan.", en: "No permission, or the save failed." },
  unavailable: { id: "Layanan tidak tersedia (Supabase belum terhubung).", en: "Service unavailable (Supabase not connected)." },
  not_configured: { id: "Fitur ini belum dikonfigurasi.", en: "This feature isn't configured yet." },
  lookup_unavailable: { id: "Tidak bisa memverifikasi akun. Coba lagi.", en: "Couldn't verify the account. Try again." },

  // --- generic input ---
  invalid_json: { id: "Data yang dikirim rusak. Muat ulang halaman.", en: "The submitted data was malformed. Reload the page." },
  invalid_input: { id: "Ada isian yang tidak valid. Periksa kembali.", en: "Some input is invalid. Please check the form." },
  nothing_to_update: { id: "Tidak ada perubahan untuk disimpan.", en: "There are no changes to save." },
  not_found: { id: "Data tidak ditemukan (mungkin sudah dihapus).", en: "Record not found (it may have been deleted)." },
  id_required: { id: "Data tidak valid: ID hilang.", en: "Invalid request: missing ID." },
  out_of_range: { id: "Nilai di luar rentang yang diizinkan.", en: "Value is out of the allowed range." },

  // --- employee fields ---
  name_required: { id: "Nama wajib diisi.", en: "Name is required." },
  name_and_team_required: { id: "Nama dan tim wajib diisi.", en: "Name and team are required." },
  employee_required: { id: "Karyawan wajib dipilih.", en: "An employee must be selected." },
  employee_and_role_required: { id: "Karyawan dan peran wajib dipilih.", en: "Employee and role are required." },
  location_required: { id: "Lokasi wajib diisi.", en: "Location is required." },
  religion_required: { id: "Agama wajib dipilih.", en: "Religion is required." },
  invalid_email: { id: "Format email tidak valid.", en: "Email format is invalid." },
  invalid_code: { id: "Kode karyawan tidak valid.", en: "Employee code is invalid." },
  weak_password: { id: "Kata sandi terlalu lemah (min. 6 karakter).", en: "Password is too weak (min. 6 characters)." },
  no_account: { id: "Karyawan ini belum punya akun login.", en: "This employee has no login account yet." },
  no_employee: { id: "Akun ini belum terhubung ke data karyawan.", en: "This account isn't linked to an employee record." },
  unknown_role: { id: "Peran tidak dikenal.", en: "Unknown role." },

  // --- dates / time / period ---
  invalid_date: { id: "Tanggal tidak valid.", en: "The date is invalid." },
  invalid_dates: { id: "Tanggal mulai/selesai tidak valid.", en: "Start/end dates are invalid." },
  invalid_time: { id: "Jam mulai/selesai tidak valid.", en: "Start/end times are invalid." },
  invalid_period: { id: "Periode tidak valid.", en: "The period is invalid." },
  invalid_days: { id: "Jumlah hari tidak valid.", en: "The number of days is invalid." },
  end_before_start: { id: "Waktu selesai tidak boleh sebelum waktu mulai.", en: "End cannot be before start." },

  // --- type / status / kind ---
  invalid_type: { id: "Jenis tidak valid.", en: "The selected type is invalid." },
  invalid_kind: { id: "Jenis transaksi tidak valid.", en: "The transaction kind is invalid." },
  invalid_status: { id: "Status tidak valid.", en: "The status is invalid." },
  awaiting_manager: { id: "Menunggu persetujuan atasan dulu sebelum HR.", en: "Waiting for the manager's approval before HR." },
  already_decided: { id: "Pengajuan ini sudah diputuskan.", en: "This request has already been decided." },

  // --- tabungan ---
  insufficient_balance: { id: "Saldo tabungan tidak mencukupi.", en: "Insufficient savings balance." },

  // --- file uploads (KTP / proof / contract doc) ---
  invalid_ktp_type: { id: "Foto KTP harus JPG, PNG, atau WebP.", en: "KTP photo must be JPG, PNG, or WebP." },
  ktp_too_large: { id: "Foto KTP terlalu besar (maks 5MB).", en: "KTP photo is too large (max 5MB)." },
  ktp_upload_failed: { id: "Gagal mengunggah foto KTP. Coba lagi.", en: "Failed to upload the KTP photo. Try again." },
  photo_required: { id: "Foto wajib dilampirkan.", en: "A photo is required." },
  invalid_proof_type: { id: "Bukti harus berupa gambar atau PDF.", en: "Proof must be an image or PDF." },
  proof_too_large: { id: "File bukti terlalu besar (maks 5MB).", en: "Proof file is too large (max 5MB)." },
  proof_upload_failed: { id: "Gagal mengunggah bukti. Coba lagi.", en: "Failed to upload the proof. Try again." },
  invalid_doc_type: { id: "Dokumen harus PDF atau gambar.", en: "Document must be a PDF or image." },
  doc_too_large: { id: "Dokumen terlalu besar (maks 10MB).", en: "Document is too large (max 10MB)." },
  doc_upload_failed: { id: "Gagal mengunggah dokumen. Coba lagi.", en: "Failed to upload the document. Try again." },
  invalid_path: { id: "Path file tidak valid.", en: "The file path is invalid." },

  // --- client-side direct upload (lib/upload.ts) ---
  file_too_large: { id: "File terlalu besar (maks 25MB).", en: "File is too large (max 25MB)." },
  upload_failed: { id: "Gagal mengunggah file. Coba lagi.", en: "Failed to upload the file. Try again." },

  // --- attendance / push / misc server ---
  attendance_write_failed: { id: "Gagal menyimpan absensi. Coba lagi.", en: "Failed to save attendance. Try again." },
  not_clocked_in: { id: "Belum ada clock-in hari ini untuk di-clock-out.", en: "No clock-in today to clock out from." },
  push_not_configured: { id: "Notifikasi push belum dikonfigurasi (VAPID key kosong).", en: "Push notifications aren't configured (VAPID key missing)." },
  missing_subscription: { id: "Data langganan notifikasi hilang.", en: "Notification subscription data is missing." },
  missing_endpoint: { id: "Endpoint notifikasi hilang.", en: "Notification endpoint is missing." },
  missing_path: { id: "Path file hilang.", en: "File path is missing." },
  template_not_found: { id: "Template tidak ditemukan.", en: "Template not found." },
  send_failed: { id: "Gagal mengirim. Coba lagi.", en: "Failed to send. Try again." },
  save_failed: { id: "Gagal menyimpan. Pastikan Anda HR/admin.", en: "Failed to save. Make sure you're HR/admin." },
  remove_failed: { id: "Gagal menghapus. Coba lagi.", en: "Failed to delete. Try again." },
  list_failed: { id: "Gagal memuat data.", en: "Failed to load data." },
  query_failed: { id: "Gagal mengambil data.", en: "Failed to query data." },
  request_failed: { id: "Permintaan gagal. Coba lagi.", en: "The request failed. Try again." },
  server_error: { id: "Terjadi kesalahan di server. Coba lagi.", en: "A server error occurred. Try again." },
};

/** Translate an error code (+ optional HTTP status) into a precise message. */
export function apiErrorMessage(
  code: string | null | undefined,
  locale: Locale,
  status?: number,
): string {
  if (code && MESSAGES[code]) return MESSAGES[code][locale];

  // No mapped code — fall back to the HTTP status so the cause is still clear.
  if (status === 413) {
    return locale === "en"
      ? "The file is too large to upload. Use a smaller file."
      : "File terlalu besar untuk diunggah. Gunakan file lebih kecil.";
  }
  if (status === 401 || status === 403) {
    return locale === "en"
      ? "You don't have permission for this action."
      : "Anda tidak punya izin untuk tindakan ini.";
  }
  if (status === 404) {
    return locale === "en" ? "Not found (it may have been deleted)." : "Tidak ditemukan (mungkin sudah dihapus).";
  }
  if (status && status >= 500) {
    return locale === "en" ? "Server error. Try again shortly." : "Kesalahan server. Coba lagi sebentar.";
  }
  // Last resort: surface the raw code/status rather than hiding it.
  if (code) return locale === "en" ? `Failed: ${code}` : `Gagal: ${code}`;
  if (status) return locale === "en" ? `Request failed (${status}).` : `Permintaan gagal (${status}).`;
  return locale === "en" ? "Something went wrong. Try again." : "Terjadi kesalahan. Coba lagi.";
}

/**
 * Read a failed fetch Response and return a precise, localized message.
 * Safe when the body isn't JSON (e.g. a platform 413 with an empty body).
 */
export async function readApiError(res: Response, locale: Locale): Promise<string> {
  let code: string | undefined;
  try {
    const data = await res.clone().json();
    if (data && typeof data.error === "string") code = data.error;
  } catch {
    /* non-JSON body — fall through to status-based message */
  }
  return apiErrorMessage(code, locale, res.status);
}

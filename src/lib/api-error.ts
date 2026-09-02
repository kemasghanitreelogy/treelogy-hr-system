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
  recipient_required: { id: "Tujuan surat wajib diisi.", en: "The recipient is required." },
  subject_required: { id: "Perihal wajib diisi.", en: "The subject is required." },
  sent_date_required: { id: "Tanggal kirim wajib diisi untuk surat terkirim.", en: "A sent date is required for sent letters." },
  name_and_team_required: { id: "Nama dan tim wajib diisi.", en: "Name and team are required." },
  employee_required: { id: "Karyawan wajib dipilih.", en: "An employee must be selected." },
  employee_and_role_required: { id: "Karyawan dan peran wajib dipilih.", en: "Employee and role are required." },
  location_required: { id: "Lokasi wajib diisi.", en: "Location is required." },
  religion_required: { id: "Agama wajib dipilih.", en: "Religion is required." },
  invalid_email: { id: "Format email tidak valid.", en: "Email format is invalid." },
  email_exists: { id: "Email ini sudah dipakai karyawan lain.", en: "This email is already used by another employee." },
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
  not_ops_approved: { id: "Reimburse dinas belum disetujui — belum waktunya masuk sheet.", en: "The business-trip claim is not approved yet — not due in the sheet." },
  already_decided: { id: "Pengajuan ini sudah diputuskan.", en: "This request has already been decided." },
  self_approval: { id: "Tidak bisa memutus pengajuan milik sendiri — minta penyetuju lain.", en: "You can't decide your own request — ask another approver." },
  distinct_approver: { id: "Persetujuan akhir harus oleh orang yang berbeda dari tahap 1.", en: "The final approval must come from a different person than step 1." },
  reason_required: { id: "Alasan penolakan wajib diisi.", en: "A rejection reason is required." },

  // --- pengajuan pembayaran ---
  sedang_dikirim: { id: "Baris ini sedang dikirim ke sheet — tunggu sebentar.", en: "This row is being written to the sheet — hold on." },
  claim_failed: { id: "Tidak bisa mengunci baris ini untuk dikirim. Coba lagi.", en: "Couldn't lock this row for sending. Try again." },
  already_synced: { id: "Pengajuan ini sudah masuk Google Sheet — tidak dikirim ulang agar tidak dobel.", en: "Already written to the Google Sheet — not resent, to avoid a duplicate row." },
  department_required: { id: "Departemen wajib dipilih.", en: "Department is required." },
  description_required: { id: "Deskripsi wajib diisi.", en: "Description is required." },
  invoice_date_required: { id: "Tanggal invoice wajib diisi.", en: "Invoice date is required." },
  vendor_required: { id: "Nama vendor wajib diisi.", en: "Vendor name is required." },
  amount_required: { id: "Total nominal wajib diisi dan lebih dari 0.", en: "Total amount is required and must be above 0." },
  invoice_required: { id: "Lampirkan minimal satu faktur.", en: "Attach at least one invoice." },
  approval_required: { id: "Lampirkan bukti persetujuan atasan.", en: "Attach your dept. head's approval." },
  too_many_files: { id: "Faktur maksimal 10 berkas.", en: "At most 10 invoice files." },
  invalid_kind_other: { id: "Sebutkan jenis pengeluarannya.", en: "Specify the expense type." },

  // --- perjalanan dinas ---
  purpose_required: { id: "Tujuan/keperluan perjalanan wajib diisi.", en: "The purpose of travel is required." },
  destination_required: { id: "Kota/lokasi tujuan wajib diisi.", en: "The destination is required." },
  invalid_transport: { id: "Moda transportasi tidak valid.", en: "The mode of transportation is invalid." },
  confirmation_required: { id: "Centang pernyataan konfirmasi sebelum mengirim.", en: "Tick the confirmation statement before submitting." },
  invalid_amount: { id: "Nominal biaya tidak valid.", en: "The cost amount is invalid." },
  advance_amount_required: { id: "Isi nominal uang muka yang diminta.", en: "Enter the requested advance amount." },
  advance_exceeds_total: { id: "Uang muka tidak boleh melebihi total estimasi biaya.", en: "The advance cannot exceed the total estimated cost." },

  // --- inventaris ---
  invalid_category: { id: "Kategori barang tidak valid.", en: "The item category is invalid." },
  invalid_condition: { id: "Kondisi barang tidak valid.", en: "The item condition is invalid." },
  invalid_quantity: { id: "Jumlah harus 0 atau lebih.", en: "Quantity must be 0 or more." },
  invalid_price: { id: "Harga beli tidak valid.", en: "The purchase price is invalid." },
  unknown_employee: { id: "Penanggung jawab tidak ditemukan.", en: "The assigned employee was not found." },
  code_conflict: { id: "Kode barang bentrok. Coba simpan sekali lagi.", en: "Item code collided. Try saving once more." },

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

  // --- receipt sales (resi → kurir/AWB/HP) ---
  server_413: { id: "Berkas terlalu besar untuk dikirim langsung — dicoba lewat penyimpanan sementara.", en: "File too large to send directly — retried via temporary storage." },
  pdf_unreadable: { id: "PDF ini tidak bisa dibuka — mungkin rusak atau terkunci kata sandi.", en: "This PDF can't be opened — it may be damaged or password-protected." },
  pdf_no_pages: { id: "PDF ini tidak berisi halaman apa pun.", en: "This PDF has no pages." },
  needs_ocr: { id: "Halaman berkas ini berupa gambar. Pembacaannya perlu perangkat yang lebih baru — coba dari komputer.", en: "This file's pages are images. Reading them needs a newer device — try from a computer." },
  local_pdf_unreadable: { id: "Perangkat ini tidak bisa membaca PDF tersebut.", en: "This device couldn't read that PDF." },
  too_many_pages: { id: "Terlalu banyak halaman sekaligus. Pecah berkasnya.", en: "Too many pages at once. Split the file." },
  invalid_awb: { id: "Bentuk nomor resinya tidak wajar — periksa dulu di panel periksa sebelum dikirim ke Shopify.", en: "The tracking number doesn\u2019t look valid — check it in the review panel before sending to Shopify." },
  duplicate_awb: { id: "Nomor resi ini kembar dengan halaman lain — salah satunya pasti salah baca. Perbaiki dulu.", en: "This tracking number is duplicated on another page — one of them must be misread. Fix it first." },
  duplicate_order: { id: "Order ini tercocokkan ke lebih dari satu halaman — pencocokannya meleset di salah satunya.", en: "This order matched more than one page — the match is wrong on one of them." },
  verify_missing: { id: "Shopify menjawab sukses tapi saat diperiksa ulang nomor resinya TIDAK terpasang. Tekan tombolnya lagi — aman, yang sudah terpasang tidak akan dobel.", en: "Shopify answered success but on re-check the tracking number is NOT attached. Press the button again — it\u2019s safe, anything already attached won\u2019t double." },
  out_of_time: { id: "Waktu proses habis sebelum baris ini sempat dikirim. Tekan lagi untuk melanjutkan sisanya.", en: "Ran out of time before this row was sent. Press again to continue the rest." },
  unknown_courier: { id: "Kurirnya tidak dikenali — fulfill otomatis hanya untuk J&T, Lion Parcel, dan JNE.", en: "Courier not recognised — auto-fulfill supports J&T, Lion Parcel, and JNE only." },
  missing_awb: { id: "Nomor resi kosong — tidak ada yang bisa dikirim ke Shopify.", en: "Tracking number is empty — nothing to send to Shopify." },
  missing_order: { id: "Halaman ini belum tercocokkan ke order Shopify.", en: "This page isn't matched to a Shopify order yet." },
  order_not_found: { id: "Order tidak ditemukan di Shopify (mungkin sudah dihapus).", en: "Order not found in Shopify (it may have been deleted)." },
  already_fulfilled: { id: "Order ini sudah pernah ditandai terkirim.", en: "This order was already marked as fulfilled." },
  nothing_to_fulfill: { id: "Tidak ada barang tersisa untuk dikirim pada order ini.", en: "Nothing left to fulfill on this order." },
  shopify_rejected: { id: "Shopify menolak permintaannya.", en: "Shopify rejected the request." },
  shopify_error: { id: "Gagal menghubungi Shopify. Coba lagi.", en: "Couldn\u2019t reach Shopify. Try again." },
  shopify_not_configured: { id: "Kredensial Shopify (STORE_NAME / ADMIN_API_KEY) kosong di server. Pencocokan tidak bisa jalan — ini BUKAN berarti ordernya tidak ada.", en: "Shopify credentials (STORE_NAME / ADMIN_API_KEY) are empty on the server. Matching can't run — this does NOT mean the orders are missing." },
  shopify_forbidden: { id: "Token Shopify tidak punya izin baca order (read_orders). Pencocokan tidak bisa jalan sampai izinnya ditambahkan — ini BUKAN berarti ordernya tidak ada.", en: "The Shopify token lacks order read access (read_orders). Matching can't run until that scope is granted — this does NOT mean the orders are missing." },
  shopify_failed: { id: "Gagal menghubungi Shopify. Coba lagi.", en: "Couldn't reach Shopify. Try again." },
  jubelio_login_failed: { id: "Gagal masuk ke Jubelio — periksa kredensial API-nya.", en: "Jubelio login failed — check the API credentials." },

  // --- review tokopedia → judge.me ---
  cooldown: { id: "Belum waktunya menarik lagi — penarikan dijaga jarang supaya jejaknya tetap sekecil satu pengunjung biasa.", en: "Too soon to pull again — pulls are kept rare so the footprint stays as small as a single visitor's." },
  cooldown_rejected: { id: "Tokopedia menolak penarikan terakhir. Tunggu sehari penuh sebelum mencoba lagi — jangan diulang hari ini.", en: "Tokopedia rejected the last pull. Wait a full day before trying again — don't retry today." },
  already_running: { id: "Penarikan lain sedang berjalan. Tunggu sampai selesai.", en: "Another pull is already running. Wait for it to finish." },
  no_products: { id: "Belum ada produk Tokopedia di peta. Tambahkan dulu minimal satu.", en: "No Tokopedia products mapped yet. Add at least one first." },
  run_start_failed: { id: "Tidak bisa memulai penarikan. Coba lagi.", en: "Couldn't start the pull. Try again." },
  invalid_product_id: { id: "ID produk Tokopedia harus berupa angka (ambil dari URL produknya).", en: "The Tokopedia product ID must be numeric (copy it from the product URL)." },
  invalid_handle: { id: "Handle Shopify hanya boleh huruf kecil, angka, dan tanda hubung.", en: "A Shopify handle may only contain lowercase letters, numbers, and hyphens." },
  has_reviews: { id: "Produk ini sudah punya review di ledger — nonaktifkan saja, jangan dihapus, agar review lama tidak tertarik ulang dan masuk dobel.", en: "This product already has reviews in the ledger — deactivate it instead of deleting, so old reviews aren't re-pulled and imported twice." },

  // --- attendance / push / misc server ---
  attendance_write_failed: { id: "Gagal menyimpan absensi. Coba lagi.", en: "Failed to save attendance. Try again." },
  clock_out_before_in: { id: "Jam pulang lebih awal dari jam masuk — kemungkinan ketukan lama yang baru terkirim. Tidak dicatat.", en: "Clock-out is earlier than clock-in — likely a late-arriving old tap. Not recorded." },
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

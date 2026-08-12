import "server-only";

/* ============================================================
   Revisi setelah penolakan — aturan bersama semua modul berpersetujuan
   (cuti, lembur, perjalanan dinas, reimbursement).

   Penolakan bukan jalan buntu: penolak wajib menulis alasan, lalu PENGAJU
   memperbaiki datanya dan mengirim ulang. Pengiriman ulang mengembalikan
   pengajuan ke meja penyetuju dari nol — seluruh tanda tangan sebelumnya
   dihapus supaya tidak ada persetujuan yang "terbawa" atas data lama.
   ============================================================ */

export interface RevisableRow {
  employee_id?: unknown;
  status?: unknown;
  rejection_reason?: unknown;
}

/**
 * Boleh direvisi? Hanya oleh PEMILIK pengajuan, dan hanya selama belum
 * disetujui — yakni masih 'pending' (perbaikan sebelum diputuskan) atau
 * sudah 'rejected' (perbaikan setelah ditolak). Mengembalikan kode error
 * yang siap dipetakan apiErrorMessage, atau null bila boleh.
 */
export function revisionGuard(prev: RevisableRow, employeeId: string | null): string | null {
  if (!employeeId || prev.employee_id !== employeeId) return "forbidden_or_failed";
  const status = String(prev.status ?? "");
  if (status !== "pending" && status !== "rejected") return "already_decided";
  return null;
}

/**
 * Kolom yang WAJIB ikut ditulis saat pengaju mengirim ulang perbaikannya.
 * Digabung dengan kolom data hasil validasi masing-masing modul.
 *
 * `revision_note` menyimpan alasan penolakan yang MEMICU revisi ini, supaya
 * penyetuju melihat konteksnya ("ini kiriman ulang atas penolakan …") meski
 * rejection_reason sudah dikosongkan.
 */
export function revisionReset(previousRejectionReason?: unknown): Record<string, unknown> {
  const note = String(previousRejectionReason ?? "").trim();
  return {
    status: "pending",
    approver: null,
    rejection_reason: null,
    manager_approver: null,
    manager_approved_at: null,
    hr_approver: null,
    hr_approved_at: null,
    revision_note: note || null,
  };
}

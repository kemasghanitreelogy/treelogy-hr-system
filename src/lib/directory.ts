import type { EmployeeStatus } from "./types";

/**
 * Direktori karyawan untuk layar riwayat (cuti, lembur, perjalanan dinas).
 *
 * Karyawan nonaktif SENGAJA ikut dikirim ke layar: pengajuan lama miliknya
 * harus tetap bernama, bukan berubah jadi avatar tanda tanya begitu ia resign.
 * Yang disaring hanya pilihan di FORMULIR pengajuan — lewat `activeOptions()`.
 */
export function activeOptions<T extends { id: string; status: EmployeeStatus }>(
  list: T[],
  /** Tetap sertakan orang ini walau nonaktif (pemilik data yang sedang direvisi/pengguna aktif). */
  keep?: string | null,
): T[] {
  return list.filter((e) => e.status === "active" || (keep != null && e.id === keep));
}

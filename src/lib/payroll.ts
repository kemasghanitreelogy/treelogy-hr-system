import type { PTKP } from "./types";

/* ============================================================
   Payroll sederhana (kebijakan perusahaan):
   Gaji bersih = gaji pokok + tunjangan + lembur − potongan ketidakhadiran.
   TIDAK ada perhitungan BPJS / PPh 21 di sistem.
   ============================================================ */

// PTKP tetap disimpan sebagai data karyawan (dipakai di form), meski tidak
// dipakai untuk menghitung pajak.
export const PTKP_OPTIONS: PTKP[] = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];

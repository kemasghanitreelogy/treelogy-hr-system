/**
 * Bolehkah seseorang memutus pengajuannya sendiri?
 *
 * Aturan normalnya: tidak. Empat mata selalu lebih baik daripada dua, dan
 * seluruh alur persetujuan di aplikasi ini dibangun di atas anggapan itu.
 *
 * Tapi anggapan itu punya satu lubang yang nyata: HR berada di puncak rantai
 * persetujuan. Tidak ada atasan di atasnya, dan tidak ada peran lain yang
 * berwenang memutuskan pengajuannya. Melarangnya memutus pengajuan sendiri
 * bukan berarti "diputuskan orang lain" — berarti pengajuannya menggantung
 * selamanya, lalu lemburnya tidak terbayar dan absensinya tidak tercatat.
 *
 * Karena itu pengecualiannya dipagari SEMPIT dan berbasis keadaan, bukan nama
 * orang: hanya bila yang bersangkutan memegang hak final (HR) DAN memang tidak
 * ada atasan yang bisa memutuskannya. Begitu Amanda kelak punya atasan, atau
 * seseorang selain HR mencoba jalan ini, pagarnya menutup sendiri — tanpa ada
 * yang perlu ingat untuk mencabut pengecualian.
 */
export function canDecideOwnRequest(opts: {
  /** Pemegang hak putus final (employees.manage). */
  isHR: boolean;
  /** Punya atasan aktif yang berwenang menyetujui (employee_requires_manager). */
  requiresManager: boolean;
}): boolean {
  return opts.isHR && !opts.requiresManager;
}

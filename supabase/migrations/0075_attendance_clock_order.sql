-- ============================================================
-- Jam pulang tidak boleh mendahului jam masuk — dijamin DATABASE.
--
-- Pagar di route clock hanya menutup SATU jalur tulis. Masih ada dua jalur
-- lain di route persetujuan HR, dan setiap kode baru yang menyentuh absensi
-- kelak akan jadi jalur berikutnya. Aturan yang hanya hidup di kode aplikasi
-- menuntut setiap penulis mengingatnya; aturan yang hidup di sini tidak bisa
-- dilewati siapa pun, termasuk penyuntingan manual lewat SQL.
--
-- Perbandingannya stempel waktu absolut, jadi shift yang melewati tengah malam
-- tetap sah: masuk 22:00 dan pulang 06:00 keesokan harinya tetap clock_out >
-- clock_in.
-- ============================================================

alter table attendance
  drop constraint if exists attendance_clock_out_after_in;

alter table attendance
  add constraint attendance_clock_out_after_in
  check (clock_in is null or clock_out is null or clock_out > clock_in);

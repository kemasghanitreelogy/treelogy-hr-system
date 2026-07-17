-- Treelogy HR — Satu email = satu karyawan
--
-- Akun login dibuat otomatis dari email karyawan; email ganda membuat dua
-- karyawan berebut satu akun/profil. API menolak duplikat (409 email_exists);
-- index ini lapisan terakhir terhadap race / jalur tulis lain.
-- Prasyarat: sudah diverifikasi tidak ada duplikat lower(email) di data live.

create unique index if not exists idx_employees_email_unique
  on employees (lower(email))
  where email is not null and email <> '';

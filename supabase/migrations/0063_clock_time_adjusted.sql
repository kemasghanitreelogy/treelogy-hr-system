-- ============================================================
-- Treelogy HR — jejak saat waktu ketukan diganti jam server
--
-- Absensi menyimpan waktu KETUKAN ASLI dari perangkat supaya ketukan yang
-- sempat tertahan offline tetap tercatat pada jamnya yang benar. Bila waktu
-- itu tidak masuk akal (terlalu jauh di masa depan, atau tertunda melebihi
-- batas), server memakai jamnya sendiri — dan sejak sekarang FAKTA ITU
-- DICATAT, tidak lagi diganti diam-diam.
--
-- Tanpa penanda ini, absensi bisa berubah jam tanpa jejak apa pun: persis
-- yang terjadi pada 12 Agu 2026, saat ketukan pagi tercatat sebagai 17:18.
-- ============================================================

alter table attendance
  add column if not exists clock_in_adjusted  boolean not null default false,
  add column if not exists clock_out_adjusted boolean not null default false;

comment on column attendance.clock_in_adjusted is
  'True = waktu ketukan dari perangkat ditolak, jam masuk memakai jam server.';
comment on column attendance.clock_out_adjusted is
  'True = waktu ketukan dari perangkat ditolak, jam pulang memakai jam server.';

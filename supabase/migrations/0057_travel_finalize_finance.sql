-- ============================================================
-- Treelogy HR — Persetujuan akhir perjalanan dinas = FINANCE
--
-- Klarifikasi kebijakan: tahap 2 (travel.finalize) dipegang tim Finance —
-- kepala (Honestly Samantha) beserta bawahannya — bukan HR. Admin tetap
-- cadangan. Dibuat DUA peran agar kepala Finance tidak kehilangan hak
-- manajerialnya (persetujuan cuti tim, dsb.):
--   · role-finance-lead : hak Manager + proses pembayaran + finalize travel
--   · role-finance      : hak Karyawan + proses pembayaran + finalize travel
-- Anggota Finance baru cukup diberi peran ini lewat halaman Peran & Akses.
-- ============================================================

insert into roles (id, name, description, color, system, permissions)
values (
  'role-finance-lead',
  'Finance (Kepala)',
  'Hak Manager + proses pengajuan pembayaran + persetujuan akhir perjalanan dinas.',
  '#8a6512',
  false,
  (select permissions from roles where id = 'role-manager')
)
on conflict (id) do update
  set name = excluded.name, description = excluded.description;

insert into roles (id, name, description, color, system, permissions)
values (
  'role-finance',
  'Finance',
  'Hak Karyawan + proses pengajuan pembayaran + persetujuan akhir perjalanan dinas.',
  '#a8842c',
  false,
  (select permissions from roles where id = 'role-employee')
)
on conflict (id) do update
  set name = excluded.name, description = excluded.description;

-- Tambahkan hak Finance ke kedua peran (idempoten).
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['payment.manage','travel.finalize']) p)
 where id in ('role-finance-lead','role-finance');

-- Persetujuan akhir bukan urusan HR — cabut; Admin tetap sebagai cadangan.
update roles
   set permissions = array_remove(permissions, 'travel.finalize')
 where id = 'role-hr';

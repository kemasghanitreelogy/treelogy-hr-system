-- ============================================================
-- Treelogy HR — Peran "Pengelola Inventaris"
--
-- Hak karyawan biasa + kelola penuh inventaris. Dibuat sebagai peran tersendiri,
-- BUKAN dengan menambahkan inventory.manage ke role-employee, supaya seluruh
-- karyawan tidak ikut bisa mengubah/menghapus aset kantor.
--
-- Penetapan peran ke akun tertentu dilakukan lewat halaman Peran & Akses
-- (data, bukan skema) sehingga migration ini tidak mengunci email siapa pun.
-- ============================================================

insert into roles (id, name, description, color, system, permissions)
values (
  'role-inventory',
  'Pengelola Inventaris',
  'Hak karyawan biasa, plus kelola penuh inventaris kantor (tambah/ubah/hapus & cetak label).',
  '#4a7ba6',
  false,
  array[
    'dashboard.view','attendance.view','leave.view','leave.request',
    'payroll.view','shifts.view','inventory.view','inventory.manage'
  ]
)
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      permissions = excluded.permissions;

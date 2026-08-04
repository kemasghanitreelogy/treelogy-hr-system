-- ============================================================
-- Treelogy HR — Perjalanan dinas: satu penyetuju + alur revisi
--
-- Perubahan kebijakan: semua karyawan boleh MENGAJUKAN, tetapi keputusan ada di
-- tangan pemegang permission `travel.approve` saja — bukan lagi atasan langsung
-- lalu HR. Siapa orangnya ditentukan lewat PERAN di halaman Peran & Akses,
-- bukan ditulis keras di kode, sehingga penyetujunya bisa diganti tanpa deploy.
--
-- Tambahan: penyetuju bisa MENGEMBALIKAN pengajuan untuk revisi (bukan menolak)
-- disertai catatan. Pengaju lalu memperbaiki datanya dan mengirim ulang.
-- ============================================================

alter table travel_requests add column if not exists revision_note text;

-- Penyetuju yang ditunjuk harus bisa MELIHAT pengajuan yang ia putuskan.
-- Tanpa ini ia melihat daftar kosong — dan karena UPDATE ... WHERE ikut
-- menerapkan kebijakan SELECT, ia bahkan gagal menyetujui.
drop policy if exists "read travel" on travel_requests;
create policy "read travel" on travel_requests for select to authenticated
  using (
    has_perm('travel.approve')          -- penyetuju yang ditunjuk
    or is_hr()                          -- HR tetap boleh memantau
    or employee_id = my_employee_id()   -- pengaju melihat miliknya
    or is_team_manager_of(employee_id)  -- atasan memantau timnya
  );

-- Keputusan: hanya pemegang travel.approve (bukan is_hr / atasan).
drop policy if exists "manage travel" on travel_requests;
create policy "decide travel" on travel_requests for update to authenticated
  using      (has_perm('travel.approve'))
  with check (has_perm('travel.approve'));

-- Pengaju boleh memperbaiki pengajuannya SENDIRI selama masih 'pending'.
-- WITH CHECK menahan status tetap 'pending' → tidak bisa menyetujui diri sendiri,
-- dan employee_id tetap dirinya → tidak bisa mengalihkan ke orang lain.
drop policy if exists "revise own travel" on travel_requests;
create policy "revise own travel" on travel_requests for update to authenticated
  using      (employee_id = my_employee_id() and status = 'pending')
  with check (employee_id = my_employee_id() and status = 'pending');

-- HR & Manager tidak lagi otomatis menyetujui perjalanan dinas; mereka tetap
-- bisa MELIHAT (travel.view) dan mengajukan (travel.request).
update roles
   set permissions = array_remove(permissions, 'travel.approve')
 where id in ('role-hr','role-manager');

-- Peran gabungan untuk staf operasional: hak karyawan + kelola inventaris +
-- penyetuju perjalanan dinas. Dibuat terpisah agar pemegang "Pengelola
-- Inventaris" biasa TIDAK ikut mendapat hak menyetujui.
insert into roles (id, name, description, color, system, permissions)
values (
  'role-ops',
  'Admin Operasional',
  'Hak karyawan, kelola inventaris kantor, dan penyetuju perjalanan dinas.',
  '#6b7548',
  false,
  array[
    'dashboard.view','attendance.view','leave.view','leave.request',
    'payroll.view','shifts.view',
    'inventory.view','inventory.manage',
    'travel.view','travel.request','travel.approve'
  ]
)
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      permissions = excluded.permissions;

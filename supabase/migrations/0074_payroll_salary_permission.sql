-- ============================================================
-- Pisahkan "kelola karyawan" dari "lihat gaji karyawan".
--
-- Sebelumnya `employees.manage` DENGAN SENDIRINYA membuka besaran gaji:
-- halaman Payroll memakai `payroll.process OR employees.manage` untuk mode
-- operasional, dan halaman Karyawan menampilkan kolom gaji tanpa gerbang apa
-- pun. Akibatnya hak HR tidak bisa diserahkan sebagian — memberi seseorang
-- kuasa mengurus data karyawan otomatis menyerahkan gaji seisi kantor.
--
-- `payroll.view` sengaja TIDAK ikut: di sistem ini artinya "boleh melihat slip
-- gaji SENDIRI", dan setiap karyawan memilikinya.
-- ============================================================

insert into permissions (id, module, label) values
  ('payroll.salary','payroll','Lihat gaji karyawan lain')
on conflict (id) do nothing;

-- Yang selama ini SUDAH melihat gaji tetap melihatnya — tidak ada yang
-- kehilangan akses karena pemisahan ini.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['payroll.salary']) p)
 where id in ('role-admin','role-hr','role-payroll');

-- ---- Peran serah-terima HR ----------------------------------
-- GABUNGAN hak Admin Operasional dan HR Officer, dikurangi yang membuka gaji.
-- Serah-terima berarti menambah, bukan menukar: pemegangnya tidak boleh
-- kehilangan persetujuan reimbursement/perjalanan dinas yang selama ini jadi
-- tanggung jawabnya hanya karena ia naik memegang tugas HR. Disusun lewat
-- query dari kedua peran sumbernya, bukan ditulis ulang, supaya tidak melenceng
-- saat salah satunya berubah.
insert into roles (id, name, description, color, system, permissions)
select
  'role-hr-no-salary',
  'HR + Ops (tanpa akses gaji)',
  'Gabungan hak Admin Operasional dan HR Officer, kecuali melihat besaran gaji karyawan lain dan memproses payroll.',
  '#6b7548',
  false,
  (select array_agg(distinct p order by p)
     from unnest(
       (select permissions from roles where id = 'role-hr') ||
       (select permissions from roles where id = 'role-ops')
     ) p
    where p <> all (array['payroll.salary','payroll.process','payroll.export']))
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      permissions = excluded.permissions;

-- Serah terima: hak HR Amanda pindah ke Tanty. Dicocokkan lewat email, bukan
-- id, supaya terbaca dan aman diulang.
update profiles p
   set role_id = 'role-hr-no-salary'
  from employees e
 where p.employee_id = e.id
   and lower(e.email) = 'tanty@treelogy.com'
   and p.role_id = 'role-ops';

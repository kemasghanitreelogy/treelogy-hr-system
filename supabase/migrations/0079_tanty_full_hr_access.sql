-- ============================================================
-- Tanty naik ke akses HR PENUH — sama persis dengan Amanda,
-- termasuk melihat gaji karyawan lain dan memproses payroll.
--
-- Migrasi 0074 sengaja menahan gaji saat serah-terima; penahanan itu
-- sekarang dicabut.
--
-- Kenapa BUKAN sekadar memindahkannya ke 'role-hr':
-- Tanty satu-satunya pemegang persetujuan TAHAP 1 di luar admin —
-- travel.approve, payment.approve_ops, reimbursement.approve — dan
-- 'role-hr' tidak punya ketiganya. Menukar perannya akan memutus rantai
-- persetujuan perjalanan dinas & pembayaran untuk seluruh kantor.
-- Jadi perannya = role-hr ∪ role-ops: seluruh hak Amanda, plus hak
-- operasional yang memang sudah dipegangnya.
--
-- Disusun lewat query dari kedua peran sumbernya (bukan daftar izin yang
-- ditulis ulang) supaya tidak melenceng saat salah satunya berubah.
-- ============================================================

insert into roles (id, name, description, color, system, permissions)
select
  'role-hr-ops',
  'HR + Ops (akses penuh)',
  'Seluruh hak HR Officer termasuk gaji & payroll, plus persetujuan tahap 1 perjalanan dinas & pembayaran.',
  '#6b7548',
  false,
  (select array_agg(distinct p order by p)
     from unnest(
       (select permissions from roles where id = 'role-hr') ||
       (select permissions from roles where id = 'role-ops')
     ) p)
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      color       = excluded.color,
      permissions = excluded.permissions;

-- Dicocokkan lewat email, bukan id, supaya terbaca dan aman diulang.
-- Kolom `role` warisan ikut disetel 'hr' seperti Amanda: is_hr() lama
-- membacanya, dan /api/users menjaga keduanya sinkron.
update profiles p
   set role_id = 'role-hr-ops',
       role    = 'hr'
  from employees e
 where p.employee_id = e.id
   and lower(e.email) = 'tanty@treelogy.com';

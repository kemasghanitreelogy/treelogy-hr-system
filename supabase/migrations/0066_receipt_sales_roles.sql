-- Akses Receipt Sales untuk orang tertentu, tanpa membuka menunya untuk semua.
--
-- Anna & Ika memakai peran "Karyawan" yang dipakai 15 orang, dan Rindang memakai
-- "Manager / Supervisor". Menambahkan izin langsung ke peran-peran itu akan
-- memberi akses ke semua pemegangnya sekarang DAN semua yang diberi peran itu
-- kelak — padahal halaman ini menampilkan nomor telepon pelanggan.
--
-- Jadi dibuat peran turunan, mengikuti pola yang sudah dipakai modul lain
-- ("Pengelola Inventaris" = Karyawan + kelola inventaris). Izinnya disalin dari
-- peran dasarnya lewat query, bukan ditulis ulang, supaya tidak melenceng saat
-- peran dasarnya berubah.
--
-- Yang diberikan hanya `receipt.view` (baca resi & cocokkan ke Shopify).
-- `receipt.sync` (menulis ke Jubelio) sengaja TIDAK diberikan: panelnya sudah
-- tidak ada di layar, dan itu tindakan yang mengubah data pesanan sungguhan.

insert into roles (id, name, description, color, system, permissions)
select
  'role-receipt',
  'Tim Receipt Sales',
  'Hak Karyawan, plus membaca label resi dan mencocokkannya ke order Shopify.',
  '#4a7ba6',
  false,
  (select array_agg(distinct p) from unnest(permissions || array['receipt.view']) p)
from roles where id = 'role-employee'
on conflict (id) do update
  set permissions = excluded.permissions,
      description = excluded.description;

insert into roles (id, name, description, color, system, permissions)
select
  'role-manager-receipt',
  'Manager + Receipt Sales',
  'Hak Manager / Supervisor, plus membaca label resi dan mencocokkannya ke order Shopify.',
  '#4a7ba6',
  false,
  (select array_agg(distinct p) from unnest(permissions || array['receipt.view']) p)
from roles where id = 'role-manager'
on conflict (id) do update
  set permissions = excluded.permissions,
      description = excluded.description;

-- Penugasan orangnya. Dicocokkan lewat email, bukan id, supaya terbaca dan aman
-- diulang; peran lain milik mereka tidak ikut berubah karena masing-masing
-- dipindahkan ke turunan dari perannya sendiri.
update profiles p
   set role_id = 'role-receipt'
  from employees e
 where p.employee_id = e.id
   and lower(e.email) in ('anna@treelogy.com', 'ika@treelogy.com')
   and p.role_id = 'role-employee';

update profiles p
   set role_id = 'role-manager-receipt'
  from employees e
 where p.employee_id = e.id
   and lower(e.email) = 'rindang@treelogy.com'
   and p.role_id = 'role-manager';

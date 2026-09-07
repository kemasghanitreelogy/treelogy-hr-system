-- ============================================================
-- Menu Surat Keluar untuk seluruh karyawan farm & factory.
--
-- Semua karyawan farm dan factory berperan `role-employee`, dan peran itu
-- belum memegang `letters.view` — jadi menu Surat Keluar tidak pernah muncul
-- untuk mereka. Izinnya ditambahkan ke Karyawan dan ke semua peran turunan
-- yang di kode dibangun dari EMPLOYEE_PERMS (inventaris, ops, receipt,
-- finance), supaya kode dan database tetap sejalan.
--
-- Hanya BACA: mencatat, mengubah, dan menghapus surat tetap `letters.manage`
-- (HR/admin/manajer sesuai migration 0058).
-- ============================================================

update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['letters.view']) p)
 where id in ('role-employee','role-inventory','role-ops','role-receipt','role-finance');

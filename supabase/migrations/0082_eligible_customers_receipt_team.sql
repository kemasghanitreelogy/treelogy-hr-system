-- ============================================================
-- Pelanggan Eligible untuk tim Receipt Sales.
--
-- Rindang (role-manager-receipt) serta Anna & Ika (role-receipt) adalah
-- orang-orang yang menerima daftar pelanggan yang harus di-grant, jadi
-- menunya harus ada di tangan mereka — bukan hanya HR/admin. Grant-nya
-- idempoten (customer tidak digandakan, tanggal seed tidak tertimpa), jadi
-- aman dipegang operator.
-- ============================================================

update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['customers.view','customers.grant']) p)
 where id in ('role-receipt','role-manager-receipt');

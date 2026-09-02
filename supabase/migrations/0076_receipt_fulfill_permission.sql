-- ============================================================
-- Izin SENDIRI untuk "Tandai order terkirim di Shopify".
--
-- Semula fitur ini menumpang `receipt.sync`, yang artinya "tulis No. Resi ke
-- Jubelio" — sistem yang sama sekali berbeda. Akibat penyatuan itu ada dua,
-- dan dua-duanya salah arah: siapa pun yang boleh menandai order terkirim
-- terpaksa ikut mendapat akses tulis ke Jubelio, sementara tim resi yang
-- mengerjakan label setiap hari justru TIDAK bisa memakai fitur yang jadi
-- pekerjaan mereka sendiri.
-- ============================================================

insert into permissions (id, module, label) values
  ('receipt.fulfill','receipt','Tandai order terkirim di Shopify')
on conflict (id) do nothing;

-- Diberikan HANYA kepada tim yang membaca resi: Rindang (role-manager-receipt)
-- serta Anna & Ika (role-receipt). HR dan Admin sengaja TIDAK termasuk —
-- menandai order terkirim adalah pekerjaan gudang, bukan pekerjaan HR, dan
-- tindakannya mengirim email ke pembeli.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['receipt.fulfill']) p)
 where id in ('role-receipt','role-manager-receipt');

-- Pastikan tidak bocor ke peran lain lewat pemberian massal sebelumnya.
update roles
   set permissions = (select array_agg(p) from unnest(permissions) p where p <> 'receipt.fulfill')
 where id not in ('role-receipt','role-manager-receipt')
   and 'receipt.fulfill' = any(permissions);

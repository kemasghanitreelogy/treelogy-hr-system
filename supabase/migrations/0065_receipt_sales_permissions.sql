-- Receipt Sales — baca label resi (barcode + OCR di perangkat), cocokkan ke
-- order Shopify, lalu tulis No. Resi ke Jubelio.
--
-- Modul ini TIDAK menyimpan apa pun di database: berkas resinya dibaca di
-- browser dan hasilnya diunduh sebagai Excel/CSV atau dikirim ke Jubelio. Jadi
-- migrasi ini hanya mendaftarkan izinnya, tanpa tabel dan tanpa RLS baru.

insert into permissions (id, module, label) values
  ('receipt.view','receipt','Baca resi & cocokkan ke order Shopify'),
  ('receipt.sync','receipt','Tulis No. Resi ke Jubelio')
on conflict (id) do nothing;

-- Admin, HR, dan Admin Operasional (pemilik alur gudang/pengiriman) memakai
-- keduanya. Peran lain tidak diberi akses: halaman ini menampilkan nomor HP
-- pelanggan, dan penulisan ke Jubelio mengubah data pesanan yang nyata.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['receipt.view','receipt.sync']) p)
 where id in ('role-admin','role-hr','role-ops');

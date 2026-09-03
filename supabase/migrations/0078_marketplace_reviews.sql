-- ============================================================
--  Review marketplace: Tokopedia + Shopee dalam SATU modul
-- ============================================================
--
-- Sebelumnya modul ini hanya mengenal Tokopedia, dan namanya menyatakan itu.
-- Menambah Shopee sebagai tabel kedua akan menggandakan ledger, ekspor, dan
-- layar — padahal yang berbeda cuma cara mengambil datanya. Jadi tabelnya
-- digeneralisasi: satu ledger, satu ekspor Judge.me, satu jeda antar-run,
-- dengan kolom `source` yang menyatakan asalnya.
--
-- Nama tabel ikut diganti. Tabel bernama `tokopedia_reviews` yang berisi baris
-- Shopee adalah kebohongan yang akan menyesatkan setiap pembaca berikutnya,
-- dan RENAME di Postgres membawa serta indeks, constraint, dan policy-nya —
-- jadi ongkosnya kecil dan datanya utuh.

alter type tokopedia_run_status_t rename to marketplace_run_status_t;
alter table tokopedia_products     rename to marketplace_products;
alter table tokopedia_review_runs  rename to marketplace_review_runs;
alter table tokopedia_reviews      rename to marketplace_reviews;

create type marketplace_source_t as enum ('tokopedia', 'shopee');

-- Semua baris yang sudah ada berasal dari Tokopedia — itulah bawaannya.
alter table marketplace_products    add column if not exists source marketplace_source_t not null default 'tokopedia';
alter table marketplace_review_runs add column if not exists source marketplace_source_t not null default 'tokopedia';
alter table marketplace_reviews     add column if not exists source marketplace_source_t not null default 'tokopedia';

-- ---- Kunci utama jadi (source, id) ----
-- ID produk Shopee ditulis "<shopid>_<itemid>" dan ID review-nya `cmtid`;
-- keduanya angka, sehingga BISA bertabrakan dengan ID Tokopedia. Tanpa source
-- di dalam kunci, satu review Shopee dapat menimpa review Tokopedia yang sah.
alter table marketplace_reviews  drop constraint tokopedia_reviews_product_id_fkey;
alter table marketplace_products drop constraint tokopedia_products_pkey;
alter table marketplace_products add  constraint marketplace_products_pkey primary key (source, product_id);

alter table marketplace_reviews  drop constraint tokopedia_reviews_pkey;
alter table marketplace_reviews  add  constraint marketplace_reviews_pkey primary key (source, feedback_id);
alter table marketplace_reviews  add  constraint marketplace_reviews_product_fkey
  foreign key (source, product_id) references marketplace_products(source, product_id) on delete cascade;

create index if not exists idx_marketplace_reviews_source  on marketplace_reviews(source, first_seen_at desc);
create index if not exists idx_marketplace_runs_source     on marketplace_review_runs(source, started_at desc);

comment on column marketplace_reviews.source is
  'Asal review. Foto Tokopedia memakai URL bertanda tangan yang mati ~3 jam (lihat pictures_expire_at); foto Shopee memakai URL statis di down-id.img.susercontent.com dan tidak kedaluwarsa.';

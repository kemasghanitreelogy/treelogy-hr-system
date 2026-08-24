-- ============================================================
-- Treelogy HR — Tarik Review Tokopedia → CSV Judge.me
--
-- Memindahkan pipeline `fetch_tokopedia_reviews.py` ke dalam aplikasi. Dua
-- bagian skrip itu yang WAJIB pindah ke database, bukan ke berkas:
--
--   • `ledger.json` — memori antar-run. Di laptop satu orang, berkas cukup.
--     Di sini penariknya berjalan di server tanpa disk yang bertahan, dan
--     beberapa orang bisa menekan tombolnya. Ledger harus jadi satu tabel
--     dengan kunci utama `feedback_id`, sehingga dedupnya dijamin database,
--     bukan dijamin "jangan hapus file itu".
--
--   • jeda antar-run — aturan §9.1 ("bulanan ideal, jangan lebih rapat dari
--     mingguan") tadinya hanya kalimat di dokumen. Di sini ia jadi data:
--     waktu run sukses terakhir tersimpan, dan endpoint penariknya menolak
--     berjalan sebelum jendelanya lewat.
--
-- Peta produk juga ikut masuk database supaya menambah produk Tokopedia baru
-- tidak perlu deploy ulang.
-- ============================================================

-- ---- Peta produk: Tokopedia productID → handle produk Shopify ----
create table if not exists tokopedia_products (
  -- ID 19 digit dari URL produk Tokopedia (juga menerima ID klasik).
  product_id     text primary key,
  /** Handle produk Shopify — kunci pencocokan Judge.me saat import. */
  shopify_handle text not null,
  name           text not null,
  /** Produk yang sudah tidak dijual: berhenti ditarik, riwayatnya tetap ada. */
  active         boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---- Riwayat run (jejak operasional, sekaligus penjaga jeda) ----
create type tokopedia_run_status_t as enum (
  'running',   -- sedang berjalan
  'ok',        -- selesai penuh
  'partial',   -- kehabisan waktu di tengah; sisanya terambil run berikutnya
  'rejected',  -- endpoint menolak (429/403/5xx) — berhenti tanpa retry
  'failed'     -- galat lain (mis. schema drift)
);

create table if not exists tokopedia_review_runs (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         tokopedia_run_status_t not null default 'running',
  /** Jumlah permintaan ke gql.tokopedia.com — angka inti "jejak" run ini. */
  requests       int not null default 0,
  reviews_seen   int not null default 0,
  reviews_new    int not null default 0,
  with_body      int not null default 0,
  no_body        int not null default 0,
  /** Kode galat mentah, untuk ditampilkan apa adanya di panel diagnostik. */
  error          text,
  started_by     uuid references auth.users(id) on delete set null,
  started_by_name text
);

create index if not exists idx_tokopedia_runs_started on tokopedia_review_runs(started_at desc);

-- ---- Ledger: satu baris per review yang PERNAH terlihat ----
-- Menggantikan array `exported` di ledger.json. Isinya bukan hanya ID: teks
-- reviewnya ikut disimpan supaya sebuah batch bisa diunduh ULANG tanpa
-- menyentuh Tokopedia lagi — dan itu penting, lihat catatan foto di bawah.
create table if not exists tokopedia_reviews (
  feedback_id      text primary key,
  product_id       text not null references tokopedia_products(product_id) on delete cascade,
  /** Disalin saat tarik, bukan di-join: handle boleh berubah kelak, sedangkan
   *  CSV yang sudah diimport harus tetap bisa dijelaskan asal-usulnya. */
  shopify_handle   text not null,
  rating           smallint not null check (rating between 1 and 5),
  body             text not null default '',
  /** Waktu review dibuat (unix detik dari Tokopedia, disimpan sebagai waktu). */
  review_at        timestamptz not null,
  /** Nama penulis SUDAH tersamar dari sananya (mis. "L***q"). */
  reviewer_name    text not null default '',
  is_anonymous     boolean not null default false,
  variant_name     text,
  reply            text,
  picture_urls     text[] not null default '{}',
  /**
   * Kapan tautan foto di atas mati.
   *
   * Foto review Tokopedia disajikan lewat URL BERTANDA TANGAN: parameter
   * `x-expires` di tautannya hidup hanya sekitar tiga jam. Judge.me mengunduh
   * foto saat import diproses, bukan saat CSV dibuat — jadi CSV yang ditarik
   * pagi lalu diimport malam akan masuk TANPA foto, diam-diam. Batas waktunya
   * disimpan supaya layar bisa memperingatkan, dan supaya baris yang tautannya
   * sudah mati bisa ditarik ulang.
   */
  pictures_expire_at timestamptz,
  first_run_id     uuid references tokopedia_review_runs(id) on delete set null,
  first_seen_at    timestamptz not null default now(),
  /** Terisi saat baris ini ikut sebuah berkas ekspor — supaya tidak ditawarkan
   *  lagi, meniru arti `exported` di ledger.json. */
  exported_at      timestamptz,
  export_run_id    uuid references tokopedia_review_runs(id) on delete set null
);

create index if not exists idx_tokopedia_reviews_product  on tokopedia_reviews(product_id);
create index if not exists idx_tokopedia_reviews_date     on tokopedia_reviews(review_at desc);
create index if not exists idx_tokopedia_reviews_pending
  on tokopedia_reviews(exported_at) where exported_at is null;

create or replace function public.tokopedia_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tokopedia_products_touch on tokopedia_products;
create trigger trg_tokopedia_products_touch before update on tokopedia_products
  for each row execute function public.tokopedia_touch_updated_at();

-- ---- Peta produk awal (§4 dokumen) --------------------------
-- Handle-nya WAJIB milik vendor Treelogy, bukan vendor TEST
-- (`organic-moringa-capsules-1` dst.) — salah petakan berarti review nyata
-- menempel di produk uji coba.
insert into tokopedia_products (product_id, shopify_handle, name, sort_order) values
  ('1731010208236603355','organic-moringa-capsules','Organic Moringa Capsules',1),
  ('1731010063360821211','organic-moringa-oil','Organic Moringa Cold-Pressed Seed Oil',2),
  ('1729838939428849627','organic-moringa-powder','Organic Moringa Powder',3),
  ('1731747589510825947','moringa-ritual-set','Moringa Ritual Set',4)
on conflict (product_id) do nothing;

-- ---- Katalog izin -------------------------------------------
-- Dipisah dari `receipt.*`: modul itu memunculkan nomor telepon PEMBELI,
-- sedangkan ini hanya menyentuh review publik. Menyatukan keduanya akan
-- memaksa siapa pun yang menarik review ikut bisa melihat kontak pelanggan.
insert into permissions (id, module, label) values
  ('reviews.view','reviews','Lihat review Tokopedia & unduh CSV Judge.me'),
  ('reviews.pull','reviews','Tarik review baru dari Tokopedia'),
  ('reviews.manage','reviews','Kelola peta produk Tokopedia → Shopify')
on conflict (id) do nothing;

update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['reviews.view','reviews.pull','reviews.manage']) p)
 where id in ('role-admin','role-hr');

-- Tim yang sudah memegang Receipt Sales adalah tim yang sama mengurus toko.
-- Mereka boleh menarik & mengunduh, tapi tidak mengubah peta produk.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['reviews.view','reviews.pull']) p)
 where id in ('role-ops','role-receipt','role-manager-receipt');

-- ---- RLS ----------------------------------------------------
alter table tokopedia_products     enable row level security;
alter table tokopedia_reviews      enable row level security;
alter table tokopedia_review_runs  enable row level security;

drop policy if exists "read tokopedia products" on tokopedia_products;
create policy "read tokopedia products" on tokopedia_products for select to authenticated
  using (has_perm('reviews.view') or has_perm('reviews.manage') or is_hr());

drop policy if exists "manage tokopedia products" on tokopedia_products;
create policy "manage tokopedia products" on tokopedia_products for all to authenticated
  using (has_perm('reviews.manage') or is_hr())
  with check (has_perm('reviews.manage') or is_hr());

drop policy if exists "read tokopedia reviews" on tokopedia_reviews;
create policy "read tokopedia reviews" on tokopedia_reviews for select to authenticated
  using (has_perm('reviews.view') or has_perm('reviews.manage') or is_hr());

-- Menandai "sudah diekspor" adalah pekerjaan orang yang mengunduh berkasnya.
drop policy if exists "mark tokopedia reviews exported" on tokopedia_reviews;
create policy "mark tokopedia reviews exported" on tokopedia_reviews for update to authenticated
  using (has_perm('reviews.view') or is_hr())
  with check (has_perm('reviews.view') or is_hr());

drop policy if exists "read tokopedia runs" on tokopedia_review_runs;
create policy "read tokopedia runs" on tokopedia_review_runs for select to authenticated
  using (has_perm('reviews.view') or is_hr());

-- Baris review & baris run hanya ditulis penariknya, yang berjalan dengan
-- service role di server. Tidak ada policy insert untuk `authenticated` —
-- klien tidak boleh menyisipkan review karangan ke dalam ledger.

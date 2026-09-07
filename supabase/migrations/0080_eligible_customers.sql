-- ============================================================
-- Treelogy Workspace — Pelanggan Eligible (Combined Discount)
--
-- Menu untuk membuat customer Shopify yang LANGSUNG lolos gate eligibility
-- Function `combined-discount` tanpa riwayat order sungguhan. Kontraknya ada
-- di ADMIN_ELIGIBLE_CUSTOMER_FLOW.md; dua hal yang menentukan bentuk tabel ini:
--
--   • Metafield `$app:combined-discount-state` HANYA bisa ditulis backend app
--     Combined Discount. Aplikasi ini membuat customer-nya lewat token Admin
--     API sendiri, lalu meminta backend itu menyeed eligibility. Jadi ada dua
--     langkah yang bisa gagal terpisah — dan ledger ini menyimpan sampai mana
--     tiap email berhasil, supaya "ulangi" hanya mengulang yang perlu.
--
--   • Backfill segment app tidak akan pernah menemukan customer buatan admin
--     (tidak punya first_order_date). Kalau merchant membuat campaign baru
--     dengan requireQualifyingProducts, grant harus diulang untuk SEMUA
--     customer buatan admin — tabel ini adalah daftar siapa saja mereka.
-- ============================================================

insert into permissions (id, module, label) values
  ('customers.view',  'customers', 'Lihat pelanggan eligible diskon Shopify'),
  ('customers.grant', 'customers', 'Buat pelanggan Shopify & beri eligibility diskon')
on conflict (id) do nothing;

-- Admin + seluruh varian HR (HR_PERMS = semua izin kecuali access.roles) +
-- Admin Operasional — tim yang mengurus toko dan kampanye diskonnya.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['customers.view','customers.grant']) p)
 where id in ('role-admin','role-hr','role-hr-ops','role-hr-no-salary','role-ops');

-- ---- Ledger: satu baris per email yang pernah di-grant dari sini ----
create table if not exists eligible_customers (
  /** Huruf kecil, sudah di-trim — kunci idempotensi seluruh alur. Harus SAMA
   *  PERSIS dengan email yang dipakai customer login di storefront. */
  email                  text primary key,
  shopify_customer_id    text,
  first_name             text not null default '',
  last_name              text not null default '',
  tags                   text[] not null default '{}',
  /** true = dibuat dari sini; false = sudah ada di Shopify sebelumnya. */
  created_in_shopify     boolean,
  /** pending = customer ada tapi seeding belum jalan (backend belum
   *  dikonfigurasi); seeded = metafield + DB app sudah terisi; failed = backend
   *  menolak/gagal, lihat seed_error. */
  seed_status            text not null default 'pending'
                         check (seed_status in ('pending','seeded','failed')),
  seed_first_purchase_at text,
  /** [{ key, qualifiedAt }] persis seperti jawaban backend. */
  seed_campaigns         jsonb not null default '[]'::jsonb,
  /** Kode galat mesin (mis. seed_no_campaign) — diterjemahkan di layar. */
  seed_error             text,
  seed_error_detail      text,
  /** Tanggal seed yang diminta eksplisit; null = sentinel bawaan backend. */
  seed_date              text,
  source                 text not null default 'manual'
                         check (source in ('manual','import')),
  granted_by             uuid references auth.users(id) on delete set null,
  granted_by_name        text,
  granted_at             timestamptz not null default now(),
  last_attempt_at        timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_eligible_customers_granted on eligible_customers(granted_at desc);
create index if not exists idx_eligible_customers_status  on eligible_customers(seed_status);

alter table eligible_customers enable row level security;

drop policy if exists "read eligible customers" on eligible_customers;
create policy "read eligible customers" on eligible_customers for select to authenticated
  using (has_perm('customers.view') or has_perm('customers.grant') or is_hr());

drop policy if exists "grant eligible customers" on eligible_customers;
create policy "grant eligible customers" on eligible_customers for all to authenticated
  using (has_perm('customers.grant') or is_hr())
  with check (has_perm('customers.grant') or is_hr());

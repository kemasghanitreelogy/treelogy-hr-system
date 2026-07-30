-- ============================================================
-- Treelogy HR — Inventaris kantor
--
-- Satu tabel aset (`inventory_items`) dengan kode unik yang dibuat DATABASE,
-- bukan client: sequence + default + unique constraint. Kode itulah yang
-- di-encode ke QR (satu barang = satu kode = satu QR, selamanya).
-- ============================================================

create type inventory_category_t  as enum ('elektronik','furnitur','atk','kendaraan','mesin','perlengkapan','lainnya');
create type inventory_condition_t as enum ('baik','perlu_servis','rusak','hilang');
create type inventory_status_t    as enum ('tersedia','dipakai','perawatan','pensiun');

-- Nomor aset berurutan. Sequence menjamin tidak ada tabrakan walau dua HR
-- menambah barang di detik yang sama, dan nomor tidak pernah dipakai ulang.
create sequence if not exists inventory_code_seq;

create or replace function public.inventory_next_code()
returns text language sql volatile set search_path = '' as $$
  select 'INV-' || lpad(nextval('public.inventory_code_seq')::text, 4, '0');
$$;

create table if not exists inventory_items (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default public.inventory_next_code(),
  name           text not null,
  category       inventory_category_t not null default 'lainnya',
  brand          text,
  serial_no      text,
  quantity       integer not null default 1 check (quantity >= 0),
  unit           text not null default 'unit',
  condition      inventory_condition_t not null default 'baik',
  status         inventory_status_t not null default 'tersedia',
  location       text,
  assigned_to    uuid references employees(id) on delete set null,
  purchase_date  date,
  purchase_price numeric not null default 0 check (purchase_price >= 0),
  photo_path     text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_inventory_category on inventory_items(category);
create index if not exists idx_inventory_status   on inventory_items(status);
create index if not exists idx_inventory_assigned on inventory_items(assigned_to);

-- updated_at selalu jujur, apa pun jalur update-nya.
create or replace function public.inventory_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_touch on inventory_items;
create trigger trg_inventory_touch before update on inventory_items
  for each row execute function public.inventory_touch_updated_at();

-- ---- Permission catalog -------------------------------------
insert into permissions (id, module, label) values
  ('inventory.view','inventory','Lihat inventaris'),
  ('inventory.manage','inventory','Kelola inventaris (tambah/edit/hapus)')
on conflict (id) do nothing;

-- Admin & HR mengelola; manager dan karyawan cukup melihat.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['inventory.view','inventory.manage']) p)
 where id in ('role-admin','role-hr');

update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['inventory.view']) p)
 where id in ('role-manager','role-employee');

-- ---- RLS ----------------------------------------------------
alter table inventory_items enable row level security;

drop policy if exists "read inventory" on inventory_items;
create policy "read inventory" on inventory_items for select to authenticated
  using (has_perm('inventory.view') or has_perm('inventory.manage') or is_hr());

drop policy if exists "manage inventory" on inventory_items;
create policy "manage inventory" on inventory_items for all to authenticated
  using      (has_perm('inventory.manage') or is_hr())
  with check (has_perm('inventory.manage') or is_hr());

-- ---- Foto barang (bucket privat) ----------------------------
insert into storage.buckets (id, name, public) values ('inventory-photos','inventory-photos', false)
  on conflict (id) do nothing;

drop policy if exists "manage upload inventory photos" on storage.objects;
create policy "manage upload inventory photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'inventory-photos' and (has_perm('inventory.manage') or is_hr()));

-- Foto aset kantor bukan data pribadi — siapa pun yang boleh login boleh melihat.
drop policy if exists "read inventory photos" on storage.objects;
create policy "read inventory photos" on storage.objects for select to authenticated
  using (bucket_id = 'inventory-photos');

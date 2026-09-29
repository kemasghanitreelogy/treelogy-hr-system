-- ============================================================
-- Treelogy HR — Inventaris: company + kategori aset baku + kode per kombinasi
--
-- Register aset mengikuti sheet keuangan:
--   · company  : PMA (Farm & Office) / PMDN (Factory)
--   · category : 10 kode baku — LND VEH FMT MCH OFC FUR ELC LVS BIO OTH
--   · kode     : <COMPANY>-<CAT>-<nnnn>, nomor urut per kombinasi
--                (PMA-OFC-0001, PMA-OFC-0002, PMDN-MCH-0001, …)
--
-- Kode lama (INV-0001…) TIDAK diubah: label QR-nya sudah tertempel di barang.
-- Kode ditulis trigger, bukan client — client tidak bisa memilih/memalsukan
-- nomor, dan counter di-lock per baris sehingga dua HR yang menyimpan
-- bersamaan tetap mendapat nomor berbeda.
-- ============================================================

-- ---- Company ------------------------------------------------
alter table inventory_items
  add column if not exists company text not null default 'PMA';

alter table inventory_items drop constraint if exists inventory_items_company_check;
alter table inventory_items
  add constraint inventory_items_company_check check (company in ('PMA','PMDN'));

-- ---- Kategori: enum lama → kode baku ------------------------
alter table inventory_items alter column category drop default;
alter table inventory_items
  alter column category type text using (
    case category::text
      when 'tanah'                 then 'LND'
      when 'bangunan_permanen'     then 'LND'
      when 'bangunan_non_permanen' then 'LND'
      when 'kendaraan'             then 'VEH'
      when 'mesin'                 then 'MCH'
      when 'peralatan_kantor'      then 'OFC'
      when 'elektronik'            then 'OFC'
      when 'atk'                   then 'OFC'
      when 'furnitur'              then 'FUR'
      when 'aset_biologis'         then 'BIO'
      else 'OTH'
    end
  );
alter table inventory_items alter column category set default 'OTH';

alter table inventory_items drop constraint if exists inventory_items_category_check;
alter table inventory_items
  add constraint inventory_items_category_check
  check (category in ('LND','VEH','FMT','MCH','OFC','FUR','ELC','LVS','BIO','OTH'));

drop type if exists inventory_category_t;

create index if not exists idx_inventory_company on inventory_items(company);

-- ---- Counter per prefix -------------------------------------
create table if not exists inventory_code_counters (
  prefix text primary key,          -- 'PMA-OFC'
  last   integer not null default 0
);
-- Hanya disentuh trigger (security definer) — tidak ada policy = tertutup.
alter table inventory_code_counters enable row level security;

create or replace function public.inventory_assign_code()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p text := new.company || '-' || new.category;
  n integer;
begin
  insert into public.inventory_code_counters as c (prefix, last)
       values (p, 1)
  on conflict (prefix) do update set last = c.last + 1
  returning c.last into n;
  new.code := p || '-' || lpad(n::text, 4, '0');
  return new;
end;
$$;

revoke execute on function public.inventory_assign_code() from public, anon, authenticated;

drop trigger if exists trg_inventory_assign_code on inventory_items;
create trigger trg_inventory_assign_code before insert on inventory_items
  for each row execute function public.inventory_assign_code();

-- Kode kini selalu dari trigger; default lama tidak dipakai lagi.
alter table inventory_items alter column code drop default;

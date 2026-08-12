-- ============================================================
-- Treelogy HR — Surat Keluar (agenda surat keluar)
--
-- Buku agenda surat keluar: setiap surat punya nomor agenda unik yang dibuat
-- DATABASE (sequence + default + unique), meniru pola inventaris & dokumen —
-- jadi dua staf yang mendaftar bersamaan tidak mungkin bentrok nomor.
-- Nomor surat RESMI (mis. 045/TRL-GA/VIII/2026) tetap kolom bebas karena
-- formatnya mengikuti tata naskah, bukan urutan pendaftaran.
-- ============================================================

create type letter_category_t as enum (
  'undangan','penawaran','permohonan','pemberitahuan','perjanjian',
  'surat_tugas','surat_keterangan','penagihan','lainnya'
);
create type letter_urgency_t  as enum ('biasa','segera','sangat_segera','rahasia');
create type letter_status_t   as enum ('draft','terkirim','dibatalkan');
create type letter_delivery_t as enum ('email','kurir','pos','langsung','whatsapp');

create sequence if not exists letter_code_seq;

create or replace function public.letter_next_code()
returns text language sql volatile set search_path = '' as $$
  select 'SK-' || lpad(nextval('public.letter_code_seq')::text, 4, '0');
$$;

create table if not exists outgoing_letters (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique default public.letter_next_code(),
  /** Nomor surat resmi sesuai tata naskah — bebas, boleh kosong saat draft. */
  letter_number     text,
  letter_date       date not null,
  /** Kepada siapa surat ditujukan (perusahaan/instansi/perorangan). */
  recipient         text not null,
  recipient_address text,
  /** Perihal. */
  subject           text not null,
  category          letter_category_t not null default 'lainnya',
  urgency           letter_urgency_t  not null default 'biasa',
  /** Penanda tangan surat (nama + jabatan, ditulis bebas). */
  signer            text,
  delivery          letter_delivery_t,
  status            letter_status_t not null default 'draft',
  sent_date         date,
  /** Berkas surat (PDF/scan) di bucket privat `letter-files`. */
  file_path         text,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_letters_status   on outgoing_letters(status);
create index if not exists idx_letters_category on outgoing_letters(category);
create index if not exists idx_letters_date     on outgoing_letters(letter_date desc);

-- updated_at selalu jujur, apa pun jalur update-nya.
create or replace function public.letter_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_letters_touch on outgoing_letters;
create trigger trg_letters_touch before update on outgoing_letters
  for each row execute function public.letter_touch_updated_at();

-- ---- Permission catalog -------------------------------------
insert into permissions (id, module, label) values
  ('letters.view','letters','Lihat surat keluar'),
  ('letters.manage','letters','Kelola surat keluar (tambah/edit/hapus)')
on conflict (id) do nothing;

-- Admin, HR, dan Admin Operasional (GA — pemilik agenda surat) mengelola.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['letters.view','letters.manage']) p)
 where id in ('role-admin','role-hr','role-ops');

-- Manajer & Finance cukup melihat; karyawan biasa tidak diberi akses karena
-- surat keluar memuat korespondensi resmi perusahaan.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['letters.view']) p)
 where id in ('role-manager','role-finance-lead','role-finance');

-- ---- RLS ----------------------------------------------------
alter table outgoing_letters enable row level security;

drop policy if exists "read letters" on outgoing_letters;
create policy "read letters" on outgoing_letters for select to authenticated
  using (has_perm('letters.view') or has_perm('letters.manage') or is_hr());

drop policy if exists "manage letters" on outgoing_letters;
create policy "manage letters" on outgoing_letters for all to authenticated
  using      (has_perm('letters.manage') or is_hr())
  with check (has_perm('letters.manage') or is_hr());

-- ---- Berkas surat (bucket privat) ---------------------------
insert into storage.buckets (id, name, public) values ('letter-files','letter-files', false)
  on conflict (id) do nothing;

drop policy if exists "upload letter files" on storage.objects;
create policy "upload letter files" on storage.objects for insert to authenticated
  with check (bucket_id = 'letter-files' and (has_perm('letters.manage') or is_hr()));

-- Korespondensi resmi → dibaca hanya oleh pemegang izin surat, bukan semua akun.
drop policy if exists "read letter files" on storage.objects;
create policy "read letter files" on storage.objects for select to authenticated
  using (bucket_id = 'letter-files'
         and (has_perm('letters.view') or has_perm('letters.manage') or is_hr()));

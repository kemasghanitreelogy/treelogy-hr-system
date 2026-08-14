-- ============================================================
-- Treelogy HR — Surat Keluar disederhanakan: pilih departemen, dapat nomor
--
-- Sebelumnya modul ini meminta belasan isian (perihal, penerima, alamat,
-- kategori, urgensi, penanda tangan, berkas). Yang sebenarnya dibutuhkan hanya
-- satu: NOMOR SURAT RESMI yang sah dan tidak kembar. Bentuknya:
--
--     0001/HRD-TRM/VIII/2026
--     └──┘ └─┘ └─┘ └──┘ └──┘
--      │    │   │    │    └── tahun
--      │    │   │    └─────── bulan pembuatan (angka Romawi)
--      │    │   └──────────── Treelogy
--      │    └──────────────── departemen tujuan
--      └───────────────────── nomor urut, SATU DERET perusahaan per tahun
--
-- Nomor urut dibuat DATABASE, bukan aplikasi. Dua staf yang menekan tombol
-- pada detik yang sama tidak boleh mendapat nomor yang sama — surat resmi
-- berkembar adalah cacat yang baru ketahuan setelah keduanya terkirim keluar.
-- Pencacah memakai satu baris per tahun dengan UPDATE atomik, sehingga
-- transaksi kedua menunggu yang pertama selesai alih-alih membaca nilai basi.
--
-- Tabel lama dibuang utuh: isinya nol baris (belum pernah dipakai), dan
-- bentuk barunya terlalu jauh berbeda untuk ditambal kolom demi kolom.
-- ============================================================

drop table if exists outgoing_letters cascade;
drop type  if exists letter_category_t cascade;
drop type  if exists letter_urgency_t  cascade;
drop type  if exists letter_status_t   cascade;
drop type  if exists letter_delivery_t cascade;
drop sequence if exists letter_code_seq cascade;
drop function if exists public.letter_next_code() cascade;

create type letter_dept_t as enum ('hr_ga', 'sales', 'finance', 'farm', 'factory');

/** Singkatan departemen yang tercetak di nomor surat. */
create or replace function public.letter_dept_code(d letter_dept_t)
returns text language sql immutable set search_path = '' as $$
  select case d
    when 'hr_ga'   then 'HRD'
    when 'sales'   then 'SLS'
    when 'finance' then 'FIN'
    when 'farm'    then 'FRM'
    when 'factory' then 'FCT'
  end;
$$;

/** Bulan 1–12 → angka Romawi, sesuai tata naskah surat resmi. */
create or replace function public.roman_month(m int)
returns text language sql immutable set search_path = '' as $$
  select (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[m];
$$;

-- Pencacah per tahun. Satu baris per tahun, dinaikkan secara atomik.
create table if not exists letter_counters (
  year        int primary key,
  last_number int not null
);

create table if not exists outgoing_letters (
  id         uuid primary key default gen_random_uuid(),
  /** Nomor surat utuh & siap pakai, mis. "0001/HRD-TRM/VIII/2026". */
  code       text not null unique,
  department letter_dept_t not null,
  /** Bagian-bagian penyusun kode, disimpan agar bisa disaring & diurutkan. */
  seq        int not null,
  year       int not null,
  month      int not null,
  /** Siapa yang menerbitkan nomor — pertanggungjawaban tanpa perlu isian. */
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (year, seq)
);

create index if not exists idx_letters_created on outgoing_letters(created_at desc);
create index if not exists idx_letters_dept    on outgoing_letters(department);
create index if not exists idx_letters_year    on outgoing_letters(year desc, seq desc);

/**
 * Isi nomor & kode saat baris dibuat.
 *
 * Tahun/bulan diambil dari waktu WITA, bukan UTC: surat yang dibuat pukul 08:00
 * tanggal 1 Januari di Bali masih 31 Desember menurut UTC, dan akan mendapat
 * nomor tahun lalu.
 */
create or replace function public.letter_assign_code()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  wita timestamp := (now() at time zone 'Asia/Makassar');
  y int := extract(year  from wita)::int;
  m int := extract(month from wita)::int;
  n int;
begin
  -- Atomik: ON CONFLICT DO UPDATE mengunci baris tahun ybs, jadi dua penerbitan
  -- bersamaan mengantre dan menghasilkan dua nomor berbeda.
  insert into public.letter_counters (year, last_number)
  values (y, 1)
  on conflict (year) do update
    set last_number = public.letter_counters.last_number + 1
  returning last_number into n;

  new.seq   := n;
  new.year  := y;
  new.month := m;
  new.code  := lpad(n::text, 4, '0')
               || '/' || public.letter_dept_code(new.department)
               || '-TRM/' || public.roman_month(m)
               || '/' || y::text;
  return new;
end;
$$;

drop trigger if exists trg_letter_assign_code on outgoing_letters;
create trigger trg_letter_assign_code
  before insert on outgoing_letters
  for each row execute function public.letter_assign_code();

-- ---- RLS: baca untuk yang punya akses menu, tulis untuk pengelola ----
alter table outgoing_letters enable row level security;
alter table letter_counters  enable row level security;

drop policy if exists letters_read on outgoing_letters;
create policy letters_read on outgoing_letters
  for select to authenticated using (true);

drop policy if exists letters_write on outgoing_letters;
create policy letters_write on outgoing_letters
  for insert to authenticated with check (true);

drop policy if exists letters_delete on outgoing_letters;
create policy letters_delete on outgoing_letters
  for delete to authenticated using (true);

-- Pencacah dikunci TOTAL: RLS menyala tanpa satu pun policy, jadi tidak ada
-- pengguna yang bisa membacanya apalagi menggesernya. Menaikkan atau
-- menurunkannya secara manual berarti menerbitkan nomor kembar. Satu-satunya
-- yang boleh menyentuh adalah trigger di atas, yang berjalan SECURITY DEFINER
-- (atas hak pemilik fungsi, bukan hak pengguna yang menekan tombol).
revoke all on letter_counters from authenticated;

-- Nama penerbit disimpan langsung di barisnya, bukan lewat join ke akun:
-- daftar surat harus tetap terbaca utuh bertahun-tahun kemudian, termasuk
-- setelah orangnya keluar dan akunnya dihapus.
alter table outgoing_letters
  add column if not exists created_by_name text;

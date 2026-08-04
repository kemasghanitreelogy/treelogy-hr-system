-- ============================================================
-- Treelogy HR — Pengajuan Pembayaran / Reimbursement
--
-- Menggantikan Google Form "Payment Request". Bedanya: baris disimpan di
-- database SEBAGAI SUMBER KEBENARAN, lalu disalin ke Google Sheet keuangan.
-- Kalau penyalinan gagal (kredensial belum diisi, Google down, kuota habis),
-- pengajuannya TIDAK hilang — statusnya tercatat dan bisa dikirim ulang.
-- ============================================================

create type payment_dept_t as enum (
  'finance','hr_ga','sales','farm','factory','it_creative','purchasing','ceo','marketing'
);

create type payment_kind_t as enum (
  'petty_cash','office_general','production','farm_maintenance','marketing',
  'transportation','meals_entertainment','popup_market','other'
);

/** Status penyalinan ke Google Sheet — bukan status persetujuan. */
create type sheet_sync_t as enum ('pending','synced','failed');

create table if not exists payment_requests (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid references employees(id) on delete set null,

  department     payment_dept_t not null,
  requester_name text not null,
  email          text not null,
  kind           payment_kind_t not null,
  /** Diisi hanya saat kind = 'other'. */
  kind_other     text,

  -- "Invoice date - Description - Vendor Name" pada form asli (satu kolom).
  description    text not null,
  total_amount   numeric not null check (total_amount >= 0),

  /** Lampiran faktur (maks 10) — path di bucket privat payment-files. */
  invoice_paths  text[] not null default '{}',
  /** Bukti persetujuan atasan (1 berkas) — wajib, seperti form aslinya. */
  approval_path  text not null,

  due_date       date,
  more_details   text,

  sheet_status   sheet_sync_t not null default 'pending',
  sheet_error    text,
  sheet_synced_at timestamptz,
  /** Baris di sheet memakai stempel waktu ini, jadi urutannya tetap cocok. */
  submitted_at   timestamptz not null default now()
);

create index if not exists idx_payment_employee on payment_requests(employee_id);
create index if not exists idx_payment_submitted on payment_requests(submitted_at desc);
create index if not exists idx_payment_sheet on payment_requests(sheet_status);

alter table payment_requests enable row level security;

-- Baca: pemegang payment.manage (Finance/HR), atau pengaju untuk miliknya.
drop policy if exists "read payment requests" on payment_requests;
create policy "read payment requests" on payment_requests for select to authenticated
  using (has_perm('payment.manage') or is_hr() or employee_id = my_employee_id());

-- Buat: siapa pun yang boleh mengajukan, untuk dirinya sendiri.
drop policy if exists "create payment requests" on payment_requests;
create policy "create payment requests" on payment_requests for insert to authenticated
  with check (has_perm('payment.request') and employee_id = my_employee_id());

-- Ubah (mis. kirim ulang ke sheet): Finance/HR saja.
drop policy if exists "manage payment requests" on payment_requests;
create policy "manage payment requests" on payment_requests for update to authenticated
  using      (has_perm('payment.manage') or is_hr())
  with check (has_perm('payment.manage') or is_hr());

-- ---- Berkas (bucket privat) ---------------------------------
insert into storage.buckets (id, name, public) values ('payment-files','payment-files', false)
  on conflict (id) do nothing;

drop policy if exists "upload payment files" on storage.objects;
create policy "upload payment files" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-files');

-- Baca: Finance/HR, atau pemilik folder (berkas disimpan di <employee_id>/…).
drop policy if exists "read payment files" on storage.objects;
create policy "read payment files" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-files' and (
      has_perm('payment.manage') or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

-- ---- Permission --------------------------------------------
insert into permissions (id, module, label) values
  ('payment.request','payment','Ajukan pembayaran / reimbursement'),
  ('payment.manage','payment','Kelola & proses pengajuan pembayaran')
on conflict (id) do nothing;

-- Semua peran boleh mengajukan; Finance/HR/Admin yang mengelola.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['payment.request']) p)
 where id in ('role-employee','role-inventory','role-ops','role-manager','role-payroll');

update roles
   set permissions = (select array_agg(distinct p) from unnest(
         permissions || array['payment.request','payment.manage']) p)
 where id in ('role-admin','role-hr');

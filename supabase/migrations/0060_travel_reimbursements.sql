-- ============================================================
-- Treelogy HR — Travel Reimbursement (klaim biaya perjalanan dinas)
--
-- Menggantikan Google Form "Travel Reimbursement". Alur persetujuannya
-- PERSIS seperti perjalanan dinas: tahap 1 operasional/GA
-- (`reimbursement.approve`) → tahap 2 Finance (`reimbursement.finalize`),
-- memakai ulang kolom & helper applyApproval() yang sama:
--   manager_approver = tahap 1, hr_approver = tahap 2 (nama kolom warisan).
--
-- Nomor klaim dibuat DATABASE (sequence + unique) supaya tidak mungkin
-- bentrok, seperti kode aset inventaris dan nomor agenda surat.
-- ============================================================

create type reimbursement_category_t as enum (
  'transportation','accommodation','meals','per_diem','fuel','parking_toll','other'
);

create sequence if not exists reimbursement_code_seq;

create or replace function public.reimbursement_next_code()
returns text language sql volatile set search_path = '' as $$
  select 'TR-' || lpad(nextval('public.reimbursement_code_seq')::text, 4, '0');
$$;

create table if not exists travel_reimbursements (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default public.reimbursement_next_code(),
  employee_id     uuid not null references employees(id) on delete cascade,
  -- Jabatan DI-SNAPSHOT saat klaim: riwayat tetap benar setelah promosi.
  job_title       text not null,

  -- I. Informasi perjalanan
  purpose         text not null,
  start_date      date not null,
  end_date        date not null,

  -- II. Rincian biaya (satu klaim = satu baris biaya, seperti form aslinya)
  expense_date    date not null,
  category        reimbursement_category_t not null default 'other',
  description     text not null,
  receipt_number  text,
  amount          numeric not null default 0 check (amount >= 0),
  /** Bukti/kuitansi (maks 5) — path di bucket privat `reimbursement-files`. */
  receipt_paths   text[] not null default '{}',

  -- III. Pernyataan karyawan (wajib true; divalidasi juga di API)
  confirmed       boolean not null default false,

  -- Persetujuan dua tahap — kolom identik dengan travel_requests.
  status              request_status_t not null default 'pending',
  approver            text,
  rejection_reason    text,
  manager_approver    text,
  manager_approved_at timestamptz,
  hr_approver         text,
  hr_approved_at      timestamptz,
  requested_at        timestamptz not null default now(),

  constraint reimbursement_dates_ordered check (end_date >= start_date)
);

create index if not exists idx_reimb_employee on travel_reimbursements(employee_id);
create index if not exists idx_reimb_status   on travel_reimbursements(status);
create index if not exists idx_reimb_expense  on travel_reimbursements(expense_date desc);

-- ---- Permission catalog -------------------------------------
insert into permissions (id, module, label) values
  ('reimbursement.view','reimbursement','Lihat klaim reimbursement perjalanan'),
  ('reimbursement.request','reimbursement','Ajukan klaim reimbursement perjalanan'),
  ('reimbursement.approve','reimbursement','Setujui tahap 1 reimbursement (Ops/GA)'),
  ('reimbursement.finalize','reimbursement','Persetujuan akhir reimbursement (Finance)')
on conflict (id) do nothing;

-- Semua karyawan boleh melihat & mengajukan miliknya sendiri (RLS membatasi cakupan).
update roles
   set permissions = (select array_agg(distinct p) from unnest(
         permissions || array['reimbursement.view','reimbursement.request']) p)
 where id in ('role-employee','role-inventory','role-manager','role-payroll',
              'role-finance','role-finance-lead','role-ops','role-hr','role-admin');

-- Tahap 1: Admin Operasional (Tanty). Tahap 2: Finance. Admin cadangan keduanya.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['reimbursement.approve']) p)
 where id in ('role-ops','role-admin');

update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['reimbursement.finalize']) p)
 where id in ('role-finance','role-finance-lead','role-admin');

-- ---- RLS ----------------------------------------------------
alter table travel_reimbursements enable row level security;

drop policy if exists "read reimbursements" on travel_reimbursements;
create policy "read reimbursements" on travel_reimbursements for select to authenticated
  using (
    has_perm('reimbursement.approve')
    or has_perm('reimbursement.finalize')
    or is_hr()
    or employee_id = my_employee_id()
    or is_team_manager_of(employee_id)
  );

drop policy if exists "create reimbursements" on travel_reimbursements;
create policy "create reimbursements" on travel_reimbursements for insert to authenticated
  with check (is_hr() or employee_id = my_employee_id());

drop policy if exists "decide reimbursements" on travel_reimbursements;
create policy "decide reimbursements" on travel_reimbursements for update to authenticated
  using      (has_perm('reimbursement.approve') or has_perm('reimbursement.finalize'))
  with check (has_perm('reimbursement.approve') or has_perm('reimbursement.finalize'));

-- ---- Bukti/kuitansi (bucket privat) -------------------------
insert into storage.buckets (id, name, public) values ('reimbursement-files','reimbursement-files', false)
  on conflict (id) do nothing;

drop policy if exists "upload reimbursement files" on storage.objects;
create policy "upload reimbursement files" on storage.objects for insert to authenticated
  with check (bucket_id = 'reimbursement-files');

-- Baca: penyetuju kedua tahap, HR, atau pemilik folder (<employee_id>/…).
drop policy if exists "read reimbursement files" on storage.objects;
create policy "read reimbursement files" on storage.objects for select to authenticated
  using (
    bucket_id = 'reimbursement-files' and (
      has_perm('reimbursement.approve') or has_perm('reimbursement.finalize') or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

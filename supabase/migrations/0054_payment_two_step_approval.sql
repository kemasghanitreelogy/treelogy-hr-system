-- ============================================================
-- Treelogy HR — Persetujuan pembayaran dua tahap
--
-- Alur baru: diajukan → TAHAP 1 persetujuan operasional (payment.approve_ops)
-- → TAHAP 2 diproses Finance (payment.manage). Baris BARU disalin ke Google
-- Sheet keuangan setelah tahap 1 disetujui — bukan lagi saat submit — sehingga
-- Finance hanya melihat pengajuan yang sudah lolos saringan operasional.
-- ============================================================

create type payment_approval_t as enum ('waiting_ops','waiting_finance','approved','rejected');

alter table payment_requests
  add column if not exists approval_status     payment_approval_t not null default 'waiting_ops',
  add column if not exists ops_approver        text,
  add column if not exists ops_approved_at     timestamptz,
  add column if not exists finance_approver    text,
  add column if not exists finance_approved_at timestamptz,
  add column if not exists rejected_by         text,
  add column if not exists rejected_at         timestamptz,
  add column if not exists rejection_reason    text;

create index if not exists idx_payment_approval on payment_requests(approval_status);

-- Baris lama sudah terlanjur tersalin ke sheet Finance lewat alur lama —
-- anggap sudah melewati tahap operasional supaya tidak menumpuk di antrean baru.
update payment_requests
   set approval_status = 'waiting_finance',
       ops_approver    = 'Migrasi (alur lama)',
       ops_approved_at = submitted_at
 where approval_status = 'waiting_ops' and sheet_status = 'synced';

-- ---- Permission --------------------------------------------
insert into permissions (id, module, label) values
  ('payment.approve_ops','payment','Setujui pembayaran tahap 1 (operasional)')
on conflict (id) do nothing;

-- Tahap 1 dipegang Admin Operasional (Tanty).
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['payment.approve_ops']) p)
 where id = 'role-ops';

-- ---- RLS ---------------------------------------------------
-- Approver tahap 1 harus bisa membaca semua pengajuan + menulis keputusannya.
drop policy if exists "read payment requests" on payment_requests;
create policy "read payment requests" on payment_requests for select to authenticated
  using (has_perm('payment.manage') or has_perm('payment.approve_ops')
         or is_hr() or employee_id = my_employee_id());

drop policy if exists "manage payment requests" on payment_requests;
create policy "manage payment requests" on payment_requests for update to authenticated
  using      (has_perm('payment.manage') or has_perm('payment.approve_ops') or is_hr())
  with check (has_perm('payment.manage') or has_perm('payment.approve_ops') or is_hr());

-- Lampiran juga harus terbaca oleh approver tahap 1.
drop policy if exists "read payment files" on storage.objects;
create policy "read payment files" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-files' and (
      has_perm('payment.manage') or has_perm('payment.approve_ops') or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

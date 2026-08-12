-- ============================================================
-- Treelogy HR — Dua jalur pengajuan pembayaran
--
-- Pengaju memilih jalur SEBELUM mengisi form; isiannya sama persis:
--   · 'biasa' → langsung tercatat & disalin ke Google Sheet keuangan.
--   · 'dinas' → persetujuan dua tahap (Ops/GA → Finance) dulu; baris baru
--               masuk sheet SETELAH persetujuan akhir.
--
-- Modul "Reimbursement Dinas" yang berdiri sendiri dilebur ke sini, jadi
-- semua pengajuan biaya hidup di satu daftar dengan satu format.
-- ============================================================

create type payment_flow_t as enum ('biasa', 'dinas');

alter table payment_requests
  add column if not exists flow payment_flow_t not null default 'biasa',
  -- Alasan penolakan yang memicu revisi (lihat 0061) — jalur dinas ikut
  -- memakai alur "tolak → perbaiki → kirim ulang" yang sama.
  add column if not exists revision_note text;

create index if not exists idx_payment_flow on payment_requests(flow, approval_status);

-- Baris lama semuanya jalur biasa dan sudah final; pastikan konsisten.
update payment_requests
   set flow = 'biasa', approval_status = 'approved'
 where approval_status <> 'approved' or flow is null;

-- ---- Permission ---------------------------------------------
-- Tahap 1 dipegang Admin Operasional (Tanty); tahap 2 Finance (payment.manage).
insert into permissions (id, module, label) values
  ('payment.approve_ops','payment','Setujui pembayaran dinas tahap 1 (Ops/GA)')
on conflict (id) do nothing;

update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['payment.approve_ops']) p)
 where id in ('role-ops','role-admin');

-- ---- RLS ----------------------------------------------------
-- Penyetuju tahap 1 harus bisa MELIHAT dan MEMUTUS pengajuan dinas.
drop policy if exists "read payment requests" on payment_requests;
create policy "read payment requests" on payment_requests for select to authenticated
  using (
    has_perm('payment.manage') or has_perm('payment.approve_ops')
    or is_hr() or employee_id = my_employee_id()
  );

drop policy if exists "manage payment requests" on payment_requests;
create policy "manage payment requests" on payment_requests for update to authenticated
  using      (has_perm('payment.manage') or has_perm('payment.approve_ops') or is_hr())
  with check (has_perm('payment.manage') or has_perm('payment.approve_ops') or is_hr());

-- Pengaju boleh memperbaiki pengajuannya sendiri setelah ditolak (alur revisi
-- yang sama dengan modul berpersetujuan lain): hasilnya wajib kembali menunggu.
drop policy if exists "revise own payment" on payment_requests;
create policy "revise own payment" on payment_requests for update to authenticated
  using      (employee_id = my_employee_id() and approval_status = 'rejected')
  with check (employee_id = my_employee_id() and approval_status = 'waiting_ops');

-- Lampiran ikut terbaca oleh penyetuju tahap 1.
drop policy if exists "read payment files" on storage.objects;
create policy "read payment files" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-files' and (
      has_perm('payment.manage') or has_perm('payment.approve_ops') or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

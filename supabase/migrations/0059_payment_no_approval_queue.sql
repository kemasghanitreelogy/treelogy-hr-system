-- ============================================================
-- Treelogy HR — Pengajuan pembayaran: tanpa antrean persetujuan
--
-- Koreksi kebijakan: persetujuan dua tahap (Ops → Finance) HANYA berlaku untuk
-- perjalanan dinas. Pengajuan pembayaran kembali langsung tercatat begitu
-- dikirim — Finance memprosesnya dari daftar, bukan dari antrean approval.
--
-- Kolom approval_* dibiarkan ada (arsip riwayat), tapi semua baris disetel
-- final agar tidak ada yang menggantung di "menunggu".
-- ============================================================

update payment_requests
   set approval_status = 'approved'
 where approval_status in ('waiting_ops','waiting_finance');

-- Izin tahap 1 tidak lagi dipakai modul mana pun → dicabut dari semua peran.
update roles set permissions = array_remove(permissions, 'payment.approve_ops')
 where permissions @> array['payment.approve_ops'];

delete from permissions where id = 'payment.approve_ops';

-- Cakupan baca kembali seperti semula (tanpa approver tahap 1).
drop policy if exists "read payment requests" on payment_requests;
create policy "read payment requests" on payment_requests for select to authenticated
  using (has_perm('payment.manage') or is_hr() or employee_id = my_employee_id());

drop policy if exists "manage payment requests" on payment_requests;
create policy "manage payment requests" on payment_requests for update to authenticated
  using      (has_perm('payment.manage') or is_hr())
  with check (has_perm('payment.manage') or is_hr());

drop policy if exists "read payment files" on storage.objects;
create policy "read payment files" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-files' and (
      has_perm('payment.manage') or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

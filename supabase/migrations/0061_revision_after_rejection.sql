-- ============================================================
-- Treelogy HR — Revisi setelah penolakan (semua modul berpersetujuan)
--
-- Kebijakan: penolakan bukan jalan buntu. Penolak WAJIB menulis alasan
-- (sudah ditegakkan API), lalu PENGAJU boleh memperbaiki datanya dan
-- mengirimkannya kembali ke meja penyetuju — status kembali 'pending'
-- dan seluruh tanda tangan sebelumnya dibersihkan.
--
-- `revision_note` menyimpan alasan penolakan yang MEMICU revisi, sehingga
-- penyetuju melihat konteksnya ("ini kiriman ulang atas penolakan …")
-- meski kolom rejection_reason sudah dikosongkan.
--
-- Modul tanpa persetujuan (pembayaran, inventaris, dokumen, surat) TIDAK
-- disentuh sama sekali.
-- ============================================================

alter table leave_requests        add column if not exists revision_note text;
alter table overtime_requests     add column if not exists revision_note text;
alter table travel_reimbursements add column if not exists revision_note text;

-- ---- RLS: pengaju boleh memperbaiki pengajuannya SENDIRI ----
--
-- USING  : baris yang masih 'pending' (perbaikan sebelum diputuskan) ATAU
--          sudah 'rejected' (perbaikan setelah ditolak).
-- CHECK  : hasil akhirnya wajib 'pending' dan tetap miliknya sendiri —
--          jadi pengaju tidak bisa menyetujui dirinya sendiri atau
--          mengalihkan pengajuan ke orang lain.

drop policy if exists "revise own leave" on leave_requests;
create policy "revise own leave" on leave_requests for update to authenticated
  using      (employee_id = my_employee_id() and status in ('pending','rejected'))
  with check (employee_id = my_employee_id() and status = 'pending');

drop policy if exists "revise own overtime" on overtime_requests;
create policy "revise own overtime" on overtime_requests for update to authenticated
  using      (employee_id = my_employee_id() and status in ('pending','rejected'))
  with check (employee_id = my_employee_id() and status = 'pending');

drop policy if exists "revise own reimbursement" on travel_reimbursements;
create policy "revise own reimbursement" on travel_reimbursements for update to authenticated
  using      (employee_id = my_employee_id() and status in ('pending','rejected'))
  with check (employee_id = my_employee_id() and status = 'pending');

-- Perjalanan dinas sudah punya alur revisi, tapi dulu hanya untuk 'pending'.
-- Lebarkan agar pengajuan yang DITOLAK juga bisa diperbaiki & dikirim ulang.
drop policy if exists "revise own travel" on travel_requests;
create policy "revise own travel" on travel_requests for update to authenticated
  using      (employee_id = my_employee_id() and status in ('pending','rejected'))
  with check (employee_id = my_employee_id() and status = 'pending');

-- ============================================================
-- Treelogy HR — Bukti persetujuan atasan pada perjalanan dinas
--
-- Pengajuan BARU wajib melampirkan satu berkas bukti persetujuan atasan
-- (gambar/PDF, mis. tangkapan layar WA) — divalidasi API; baris lama tetap
-- sah tanpa lampiran (kolomnya nullable).
-- ============================================================

alter table travel_requests add column if not exists approval_path text;

-- Bucket privat untuk lampiran perjalanan dinas (path: <employee_id>/<uuid>.<ext>).
insert into storage.buckets (id, name, public) values ('travel-files','travel-files', false)
  on conflict (id) do nothing;

drop policy if exists "upload travel files" on storage.objects;
create policy "upload travel files" on storage.objects for insert to authenticated
  with check (bucket_id = 'travel-files');

-- Baca: HR, penyetuju (travel.approve), atau pemilik folder.
drop policy if exists "read travel files" on storage.objects;
create policy "read travel files" on storage.objects for select to authenticated
  using (
    bucket_id = 'travel-files' and (
      is_hr() or has_perm('travel.approve')
      or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

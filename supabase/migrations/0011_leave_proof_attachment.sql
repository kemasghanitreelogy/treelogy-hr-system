-- ============================================================
-- Treelogy HR — Optional proof attachment for leave requests
-- Additive to 0001_init.sql / 0006 (storage pattern) / 0010
--
-- Each leave/permission request MAY carry one proof file (image or PDF).
-- It is optional. Files live in a private bucket, keyed by employee id:
--   leave-proofs/<employee_id>/<uuid>.<ext>
-- Visible to: the requester, HR/admin, and the requester's division manager.
-- ============================================================

-- Column to hold the storage path of the attached proof (nullable = optional).
alter table leave_requests add column if not exists proof_path text;

-- Private bucket for proof files.
insert into storage.buckets (id, name, public) values ('leave-proofs','leave-proofs', false)
  on conflict (id) do nothing;

-- Any authenticated user may upload into the bucket. Who may *create* a leave
-- request is already gated by the leave_requests insert policy.
drop policy if exists "auth upload leave proofs" on storage.objects;
create policy "auth upload leave proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-proofs');

-- Read: the uploader (owner), the employee the file belongs to, HR/admin, or the
-- division manager of that employee. The first path segment is the employee id.
drop policy if exists "read leave proofs" on storage.objects;
create policy "read leave proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-proofs' and (
      owner = auth.uid()
      or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
      or is_team_manager_of(((storage.foldername(name))[1])::uuid)
    )
  );

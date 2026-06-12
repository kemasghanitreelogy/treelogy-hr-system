-- #7: PTKP removed from the system entirely.
alter table employees drop column if exists ptkp;

-- #8: KTP identity data + per-contract signed document.
alter table employees add column if not exists ktp_nik text;
alter table employees add column if not exists ktp_photo_path text;
alter table employee_contracts add column if not exists doc_path text;

-- Private bucket for KTP scans (HR uploads; HR or the employee can read).
insert into storage.buckets (id, name, public) values ('ktp-photos','ktp-photos', false)
  on conflict (id) do nothing;

drop policy if exists "hr upload ktp" on storage.objects;
create policy "hr upload ktp" on storage.objects for insert to authenticated
  with check (bucket_id = 'ktp-photos' and is_hr());

drop policy if exists "read ktp" on storage.objects;
create policy "read ktp" on storage.objects for select to authenticated
  using (
    bucket_id = 'ktp-photos' and (
      is_hr() or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

-- Private bucket for signed contract documents (same access shape).
insert into storage.buckets (id, name, public) values ('contract-docs','contract-docs', false)
  on conflict (id) do nothing;

drop policy if exists "hr upload contract docs" on storage.objects;
create policy "hr upload contract docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-docs' and is_hr());

drop policy if exists "read contract docs" on storage.objects;
create policy "read contract docs" on storage.objects for select to authenticated
  using (
    bucket_id = 'contract-docs' and (
      is_hr() or (storage.foldername(name))[1] = my_employee_id()::text
    )
  );

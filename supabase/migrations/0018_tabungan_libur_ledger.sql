-- ============================================================
-- Treelogy HR — Tabungan Libur ledger (single source of truth)
-- Replaces the rigid day_off_in_lieu swap model with a running bank:
--   deposit    (+days)  earned by working a rest day / outside hours
--                       (auto-created from attendance, confirmed by HR)
--   withdrawal (-days)  spent by taking a saved day off (employee request)
-- The cached balance lives on leave_balances.tabungan_libur and is kept in
-- sync by the API when an entry is approved (deposit +, withdrawal -).
-- Approval is gated exactly like leave: HR + the employee's division manager.
-- ============================================================

create table if not exists tabungan_libur_entries (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  kind          text not null check (kind in ('deposit','withdrawal')),
  days          int  not null default 1 check (days > 0),
  event_date    date not null,                 -- worked_date (deposit) / off_date (withdrawal)
  reason        text,
  source        text not null default 'manual' check (source in ('manual','attendance')),
  source_id     uuid,                          -- attendance row id when source='attendance'
  status        request_status_t not null default 'pending',
  approver      text,
  proof_path    text,
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists idx_tabungan_employee on tabungan_libur_entries(employee_id);

-- At most one live (non-rejected) auto-deposit per employee per day, so a
-- repeated clock-in on the same rest day never stacks duplicate deposits.
create unique index if not exists idx_tabungan_attendance_once
  on tabungan_libur_entries(employee_id, event_date)
  where source = 'attendance' and status <> 'rejected';

alter table tabungan_libur_entries enable row level security;

-- Read: HR, the employee themselves, or their division manager.
create policy "read tabungan" on tabungan_libur_entries for select to authenticated
  using (is_hr() or employee_id = my_employee_id() or is_team_manager_of(employee_id));
-- Create: HR (on anyone) or the employee for themselves.
create policy "create tabungan" on tabungan_libur_entries for insert to authenticated
  with check (is_hr() or employee_id = my_employee_id());
-- Update (approve/reject): HR or the employee's division manager.
create policy "manage tabungan" on tabungan_libur_entries for update to authenticated
  using      (is_hr() or is_team_manager_of(employee_id))
  with check (is_hr() or is_team_manager_of(employee_id));

-- Private proof bucket (optional withdrawal evidence; same shape as leave-proofs).
insert into storage.buckets (id, name, public) values ('tabungan-proofs','tabungan-proofs', false)
  on conflict (id) do nothing;

drop policy if exists "auth upload tabungan proofs" on storage.objects;
create policy "auth upload tabungan proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'tabungan-proofs');

drop policy if exists "read tabungan proofs" on storage.objects;
create policy "read tabungan proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'tabungan-proofs' and (
      owner = auth.uid()
      or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
      or is_team_manager_of(((storage.foldername(name))[1])::uuid)
    )
  );

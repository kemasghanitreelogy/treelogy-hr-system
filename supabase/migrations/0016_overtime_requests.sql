-- ============================================================
-- Treelogy HR — Overtime (lembur) requests
-- Hourly rate = base_salary / 20 days / 8 hours (snapshotted at request time).
-- Two independent statuses: approval (pending/approved/rejected, gated like leave:
-- HR + the employee's division manager) and payment (paid/unpaid), settled
-- SEPARATELY from payroll.
-- ============================================================

create table if not exists overtime_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  date          date not null,
  start_time    time not null,
  end_time      time not null,
  hours         numeric(5,2) not null,
  reason        text,
  rate_per_hour numeric not null default 0,
  amount        numeric not null default 0,
  status        request_status_t not null default 'pending',
  approver      text,
  paid          boolean not null default false,
  paid_at       timestamptz,
  proof_path    text,
  requested_at  timestamptz not null default now()
);
create index if not exists idx_overtime_employee on overtime_requests(employee_id);

alter table overtime_requests enable row level security;

-- Read: HR, the employee themselves, or their division manager.
create policy "read overtime" on overtime_requests for select to authenticated
  using (is_hr() or employee_id = my_employee_id() or is_team_manager_of(employee_id));
-- Create: HR (on anyone) or the employee for themselves.
create policy "create overtime" on overtime_requests for insert to authenticated
  with check (is_hr() or employee_id = my_employee_id());
-- Update (approve/reject + mark paid): HR, the division manager, or payroll staff.
create policy "manage overtime" on overtime_requests for update to authenticated
  using      (is_hr() or is_team_manager_of(employee_id) or has_perm('payroll.process'))
  with check (is_hr() or is_team_manager_of(employee_id) or has_perm('payroll.process'));

-- Private proof bucket (same access shape as leave-proofs).
insert into storage.buckets (id, name, public) values ('overtime-proofs','overtime-proofs', false)
  on conflict (id) do nothing;

drop policy if exists "auth upload overtime proofs" on storage.objects;
create policy "auth upload overtime proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'overtime-proofs');

drop policy if exists "read overtime proofs" on storage.objects;
create policy "read overtime proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'overtime-proofs' and (
      owner = auth.uid()
      or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
      or is_team_manager_of(((storage.foldername(name))[1])::uuid)
    )
  );

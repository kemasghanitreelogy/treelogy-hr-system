-- Idempotency ledger for the daily contract-expiry cron: one row per
-- (contract, milestone) so a reminder is never sent twice.
create table if not exists contract_reminders (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references employee_contracts(id) on delete cascade,
  milestone   int  not null,            -- days before end_date (60 or 30)
  created_at  timestamptz not null default now(),
  unique (contract_id, milestone)
);
alter table contract_reminders enable row level security;
drop policy if exists "hr reads contract reminders" on contract_reminders;
create policy "hr reads contract reminders" on contract_reminders
  for select to authenticated using (is_hr());

-- HR/admin recipients (active employees with employees.manage, or role admin/hr)
-- for org-wide notifications such as contract reminders.
create or replace function hr_recipient_employees()
returns table (employee_id uuid, name text, email text)
language sql security definer set search_path = public as $$
  select e.id, e.name, e.email
  from profiles p
  join employees e on e.id = p.employee_id
  left join roles r on r.id = p.role_id
  where e.status = 'active'
    and (p.role in ('admin','hr') or 'employees.manage' = any(coalesce(r.permissions, '{}')))
$$;
revoke all on function hr_recipient_employees() from public, anon;
grant execute on function hr_recipient_employees() to service_role;

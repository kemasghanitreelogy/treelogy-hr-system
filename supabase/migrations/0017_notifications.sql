-- ============================================================
-- Treelogy HR — Notifications
-- One row per recipient (employee). Written server-side (service role) when
-- events happen: leave/overtime approved·rejected·paid, and new requests that
-- need an approver's action. Read/unread tracked per row.
-- ============================================================

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade, -- recipient
  type        text not null,                  -- 'leave' | 'overtime' | 'approval'
  tone        text not null default 'pending', -- approved | rejected | paid | pending
  title       text not null,
  body        text,
  href        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_recipient on notifications(employee_id, created_at desc);

alter table notifications enable row level security;

-- A user sees & updates only their own notifications. Inserts happen via the
-- service-role client (bypasses RLS), so there is no insert policy.
create policy "read own notifications" on notifications for select to authenticated
  using (employee_id = my_employee_id());
create policy "update own notifications" on notifications for update to authenticated
  using (employee_id = my_employee_id()) with check (employee_id = my_employee_id());

-- Approvers for a request: HR/admin (org-wide) + the requester's division
-- manager. Used to fan out "needs your approval" notifications.
create or replace function approver_employees(req_team team_t, exclude_emp uuid)
returns table(employee_id uuid) language sql security definer stable set search_path = '' as $$
  select distinct e.id
  from public.employees e
  join public.profiles p on p.employee_id = e.id
  join public.roles r on r.id = p.role_id
  where e.id <> exclude_emp
    and e.status = 'active'
    and (
      'employees.manage' = any(r.permissions)
      or ('leave.approve' = any(r.permissions) and e.team = req_team)
    );
$$;
-- Only the service-role notify helper calls this; not exposed to end users.
revoke execute on function approver_employees(team_t, uuid) from public, anon, authenticated;
grant execute on function approver_employees(team_t, uuid) to service_role;

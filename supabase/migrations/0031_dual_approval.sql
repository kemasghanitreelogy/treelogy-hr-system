-- ============================================================
-- Treelogy HR — dual approval for leave & overtime.
-- A request needs the employee's team manager (atasan) AND HR. Manager approves
-- first, then HR finalises. If the team has no manager, HR alone suffices.
-- A reject by either side → rejected. We keep `status` + `approver` (final/reject
-- actor) and add per-side columns so the UI can show "approved by whom".
-- Idempotent.
-- ============================================================

alter table leave_requests
  add column if not exists manager_approver    text,
  add column if not exists manager_approved_at timestamptz,
  add column if not exists hr_approver         text,
  add column if not exists hr_approved_at      timestamptz;

alter table overtime_requests
  add column if not exists manager_approver    text,
  add column if not exists manager_approved_at timestamptz,
  add column if not exists hr_approver         text,
  add column if not exists hr_approved_at      timestamptz;

-- Does the requester's team have a (non-HR) manager who can approve? Drives
-- whether the manager step is required. SECURITY DEFINER so the API can call it.
create or replace function team_has_manager(req_team team_t, exclude_emp uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.employees e
    join public.profiles p on p.employee_id = e.id
    join public.roles r    on r.id = p.role_id
    where e.id <> exclude_emp
      and e.status = 'active'
      and e.team = req_team
      and 'leave.approve' = any(r.permissions)
      and not ('employees.manage' = any(r.permissions))
  );
$$;

-- ============================================================
-- Treelogy HR — Division-scoped leave approval
-- Additive to 0001_init.sql / 0002_rbac.sql
--
-- Rule: HR/admin may approve any leave request. A division manager
-- (a role with leave.approve, but not employees.manage) may approve
-- only requests from employees in their OWN division (team), and never
-- their own request. Plain staff may not approve at all.
-- ============================================================

-- Helper: is the current user a manager of the team that `target_employee`
-- belongs to? True only when the user's role grants leave.approve, the user
-- and the target share a team, and the target is not the user themselves.
create or replace function is_team_manager_of(target_employee uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from profiles p
    join roles r      on r.id = p.role_id
    join employees me on me.id = p.employee_id
    join employees tg on tg.id = target_employee
    where p.id = auth.uid()
      and 'leave.approve' = any(r.permissions)
      and me.team = tg.team
      and me.id <> tg.id
  );
$$;

-- Widen the leave-update policy: HR/admin org-wide, managers within their team.
drop policy if exists "manage leave" on leave_requests;
create policy "manage leave" on leave_requests for update to authenticated
  using      (is_hr() or is_team_manager_of(employee_id))
  with check (is_hr() or is_team_manager_of(employee_id));

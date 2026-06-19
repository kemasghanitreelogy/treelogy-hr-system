-- Manager-step requirement should follow the ORG TREE, not the whole team.
--
-- Before: a request needed a manager's approval if ANYONE in the requester's
-- team was a manager — so an employee with no atasan (manager_id is null) was
-- wrongly blocked "waiting for the manager" and HR couldn't finalise.
--
-- After: the manager step is required only when the requester actually has a
-- direct atasan (manager_id) who can approve leave. No atasan → HR approves
-- directly. Who MAY approve stays team+role based (is_team_manager_of).

create or replace function employee_requires_manager(emp uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.employees e
    join public.employees m on m.id = e.manager_id and m.status = 'active'
    join public.profiles  p on p.employee_id = m.id
    join public.roles     r on r.id = p.role_id
    where e.id = emp
      and 'leave.approve' = any(r.permissions)
  );
$$;

revoke execute on function employee_requires_manager(uuid) from public, anon;
grant execute on function employee_requires_manager(uuid) to authenticated;

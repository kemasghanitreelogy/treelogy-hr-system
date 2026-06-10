-- ============================================================
-- Treelogy HR — Harden is_team_manager_of() (mirrors 0004 hardening)
-- Pin search_path + schema-qualify refs, and block anon RPC.
-- ============================================================

create or replace function public.is_team_manager_of(target_employee uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r      on r.id = p.role_id
    join public.employees me on me.id = p.employee_id
    join public.employees tg on tg.id = target_employee
    where p.id = auth.uid()
      and 'leave.approve' = any(r.permissions)
      and me.team = tg.team
      and me.id <> tg.id
  );
$$;

revoke execute on function public.is_team_manager_of(uuid) from public, anon;
grant execute on function public.is_team_manager_of(uuid) to authenticated;

-- ============================================================
-- Treelogy HR — Security hardening of helper functions
-- (mirrors what was applied live via Supabase)
-- ============================================================

-- Pin search_path (schema-qualify all refs) on SECURITY DEFINER helpers.
create or replace function public.is_hr()
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    left join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and (p.role in ('admin','hr') or 'employees.manage' = any(coalesce(r.permissions,'{}')))
  );
$$;

create or replace function public.my_employee_id()
returns uuid language sql security definer stable set search_path = '' as $$
  select employee_id from public.profiles where id = auth.uid();
$$;

create or replace function public.has_perm(perm text)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and perm = any(r.permissions)
  );
$$;

-- Block anon from invoking the helpers via RPC; authenticated keeps EXECUTE (RLS needs it).
revoke execute on function public.is_hr() from public, anon;
revoke execute on function public.my_employee_id() from public, anon;
revoke execute on function public.has_perm(text) from public, anon;
grant execute on function public.is_hr() to authenticated;
grant execute on function public.my_employee_id() to authenticated;
grant execute on function public.has_perm(text) to authenticated;

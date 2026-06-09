-- ============================================================
-- Treelogy HR — Performance: FK indexes + RLS init-plan + policy split
-- (mirrors what was applied live via Supabase)
-- ============================================================

-- Covering indexes for foreign keys
create index if not exists idx_attendance_shift on attendance(shift_id);
create index if not exists idx_dol_employee on day_off_in_lieu(employee_id);
create index if not exists idx_kpis_employee on kpis(employee_id);
create index if not exists idx_leave_employee on leave_requests(employee_id);
create index if not exists idx_payslips_employee on payslips(employee_id);
create index if not exists idx_profiles_employee on profiles(employee_id);
create index if not exists idx_profiles_role on profiles(role_id);
create index if not exists idx_push_user on push_subscriptions(user_id);
create index if not exists idx_shiftassign_shift on shift_assignments(shift_id);

-- Evaluate auth.uid() once per query, not per row.
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select to authenticated
  using (id = (select auth.uid()) or is_hr());

drop policy if exists "assign roles" on profiles;
create policy "assign roles" on profiles for update to authenticated
  using (has_perm('access.users') or id = (select auth.uid()))
  with check (has_perm('access.users') or id = (select auth.uid()));

drop policy if exists "own subscriptions" on push_subscriptions;
create policy "own subscriptions" on push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) or is_hr())
  with check (user_id = (select auth.uid()) or is_hr());

-- Split "FOR ALL" write policies into command-specific ones to remove
-- duplicate permissive SELECT policies (read policies already cover SELECT).
do $$
declare t text;
begin
  foreach t in array array['employees','shifts','attendance','leave_balances','payroll_runs','payslips','kpis'] loop
    execute format('drop policy if exists %I on %I', 'hr write '||
      case t when 'shift_assignments' then 'assignments'
             when 'leave_balances' then 'balances'
             when 'payroll_runs' then 'payroll'
             else t end, t);
  end loop;
end $$;

-- (Explicit recreation — kept verbose for clarity.)
drop policy if exists "hr write assignments" on shift_assignments;

create policy "employees insert" on employees for insert to authenticated with check (is_hr());
create policy "employees update" on employees for update to authenticated using (is_hr()) with check (is_hr());
create policy "employees delete" on employees for delete to authenticated using (is_hr());
create policy "shifts insert" on shifts for insert to authenticated with check (is_hr());
create policy "shifts update" on shifts for update to authenticated using (is_hr()) with check (is_hr());
create policy "shifts delete" on shifts for delete to authenticated using (is_hr());
create policy "assignments insert" on shift_assignments for insert to authenticated with check (is_hr());
create policy "assignments update" on shift_assignments for update to authenticated using (is_hr()) with check (is_hr());
create policy "assignments delete" on shift_assignments for delete to authenticated using (is_hr());
create policy "attendance insert" on attendance for insert to authenticated with check (is_hr());
create policy "attendance update" on attendance for update to authenticated using (is_hr()) with check (is_hr());
create policy "attendance delete" on attendance for delete to authenticated using (is_hr());
create policy "balances insert" on leave_balances for insert to authenticated with check (is_hr());
create policy "balances update" on leave_balances for update to authenticated using (is_hr()) with check (is_hr());
create policy "balances delete" on leave_balances for delete to authenticated using (is_hr());
create policy "payroll insert" on payroll_runs for insert to authenticated with check (is_hr());
create policy "payroll update" on payroll_runs for update to authenticated using (is_hr()) with check (is_hr());
create policy "payroll delete" on payroll_runs for delete to authenticated using (is_hr());
create policy "payslips insert" on payslips for insert to authenticated with check (is_hr());
create policy "payslips update" on payslips for update to authenticated using (is_hr()) with check (is_hr());
create policy "payslips delete" on payslips for delete to authenticated using (is_hr());
create policy "kpis insert" on kpis for insert to authenticated with check (is_hr());
create policy "kpis update" on kpis for update to authenticated using (is_hr()) with check (is_hr());
create policy "kpis delete" on kpis for delete to authenticated using (is_hr());

drop policy if exists "manage roles" on roles;
create policy "roles insert" on roles for insert to authenticated
  with check (has_perm('access.roles') and id <> 'role-admin');
create policy "roles update" on roles for update to authenticated
  using (has_perm('access.roles')) with check (has_perm('access.roles') and id <> 'role-admin');
create policy "roles delete" on roles for delete to authenticated
  using (has_perm('access.roles') and id <> 'role-admin');

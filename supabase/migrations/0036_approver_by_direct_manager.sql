-- Treelogy HR — Visibility & approval by DIRECT atasan (manager_id), not team
--
-- Until now is_team_manager_of() granted any employee with leave.approve sight
-- of (and authority over) EVERY request in their team. That is too broad: a
-- request must only be visible/approvable by the requester, HR/admin, and the
-- requester's DIRECT atasan (employees.manager_id) who holds leave.approve.
-- Peers and skip-level reports in the same team must not see each other.
--
-- This replaces is_team_manager_of() with is_manager_of() across every leave /
-- overtime / tabungan policy + proof bucket, and reroutes approver
-- notifications (approver_employees) to the direct atasan.

-- 1) Am I the target's DIRECT atasan, and may I approve?
create or replace function public.is_manager_of(target_employee uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.profiles  p
    join public.roles     r  on r.id = p.role_id
    join public.employees tg on tg.id = target_employee
    where p.id = auth.uid()
      and 'leave.approve' = any(r.permissions)
      and tg.manager_id = p.employee_id
  );
$$;

revoke execute on function public.is_manager_of(uuid) from public, anon;
grant  execute on function public.is_manager_of(uuid) to authenticated;

-- 2) leave_requests
drop policy if exists "read leave" on leave_requests;
create policy "read leave" on leave_requests for select to authenticated
  using (is_hr() or employee_id = my_employee_id() or is_manager_of(employee_id));

drop policy if exists "manage leave" on leave_requests;
create policy "manage leave" on leave_requests for update to authenticated
  using      (is_hr() or is_manager_of(employee_id))
  with check (is_hr() or is_manager_of(employee_id));

-- 3) overtime_requests (payroll.process keeps PAID-marking power)
drop policy if exists "read overtime" on overtime_requests;
create policy "read overtime" on overtime_requests for select to authenticated
  using (is_hr() or employee_id = my_employee_id() or is_manager_of(employee_id));

drop policy if exists "manage overtime" on overtime_requests;
create policy "manage overtime" on overtime_requests for update to authenticated
  using      (is_hr() or is_manager_of(employee_id) or has_perm('payroll.process'))
  with check (is_hr() or is_manager_of(employee_id) or has_perm('payroll.process'));

-- 4) tabungan_libur_entries
drop policy if exists "read tabungan" on tabungan_libur_entries;
create policy "read tabungan" on tabungan_libur_entries for select to authenticated
  using (is_hr() or employee_id = my_employee_id() or is_manager_of(employee_id));

drop policy if exists "manage tabungan" on tabungan_libur_entries;
create policy "manage tabungan" on tabungan_libur_entries for update to authenticated
  using      (is_hr() or is_manager_of(employee_id))
  with check (is_hr() or is_manager_of(employee_id));

-- 5) Proof buckets (path is <employeeId>/<file>)
drop policy if exists "read leave proofs" on storage.objects;
create policy "read leave proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-proofs' and (
      owner = auth.uid()
      or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
      or is_manager_of(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "read overtime proofs" on storage.objects;
create policy "read overtime proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'overtime-proofs' and (
      owner = auth.uid()
      or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
      or is_manager_of(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "read tabungan proofs" on storage.objects;
create policy "read tabungan proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'tabungan-proofs' and (
      owner = auth.uid()
      or is_hr()
      or (storage.foldername(name))[1] = my_employee_id()::text
      or is_manager_of(((storage.foldername(name))[1])::uuid)
    )
  );

-- 6) Approver notifications → HR/admin + the requester's DIRECT atasan only.
--    New signature keyed by the requester's employee id (was req_team).
drop function if exists public.approver_employees(team_t, uuid);
create or replace function public.approver_employees(req_employee uuid)
returns table(employee_id uuid) language sql security definer stable set search_path = '' as $$
  select distinct e.id
  from public.employees e
  join public.profiles  p on p.employee_id = e.id
  join public.roles     r on r.id = p.role_id
  where e.id <> req_employee
    and e.status = 'active'
    and (
      'employees.manage' = any(r.permissions)
      or (
        'leave.approve' = any(r.permissions)
        and e.id = (select manager_id from public.employees where id = req_employee)
      )
    );
$$;

revoke execute on function public.approver_employees(uuid) from public, anon, authenticated;
grant  execute on function public.approver_employees(uuid) to service_role;

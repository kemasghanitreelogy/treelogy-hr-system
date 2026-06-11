-- ============================================================
-- Treelogy HR — RLS widening for payroll runs & shift management.
-- payroll_runs: payroll staff (payroll.process) may read + manage runs,
--   not only HR — the payroll page is their job.
-- shifts / shift_assignments: holders of shifts.manage may manage them
--   (shift CRUD + per-date scheduling UI).
-- Note: employees gain payroll.view (role change, not RLS) to see their
--   OWN payslip — payslips are computed from their RLS-scoped attendance,
--   so no extra table grants are needed here.
-- ============================================================

drop policy if exists "read payroll runs" on payroll_runs;
create policy "read payroll runs" on payroll_runs for select to authenticated
  using (is_hr() or has_perm('payroll.process'));

drop policy if exists "hr write payroll" on payroll_runs;
create policy "manage payroll runs" on payroll_runs for all to authenticated
  using      (is_hr() or has_perm('payroll.process'))
  with check (is_hr() or has_perm('payroll.process'));

drop policy if exists "hr write shifts" on shifts;
create policy "manage shifts" on shifts for all to authenticated
  using      (is_hr() or has_perm('shifts.manage'))
  with check (is_hr() or has_perm('shifts.manage'));

drop policy if exists "hr write assignments" on shift_assignments;
create policy "manage assignments" on shift_assignments for all to authenticated
  using      (is_hr() or has_perm('shifts.manage'))
  with check (is_hr() or has_perm('shifts.manage'));

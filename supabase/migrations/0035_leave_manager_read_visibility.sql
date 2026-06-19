-- Treelogy HR — Let team managers READ their team's leave requests
--
-- The original "read leave" SELECT policy (0001) only allowed HR or the
-- requester themselves. Migration 0010 later extended the UPDATE policy to
-- team managers (is_team_manager_of) so they could approve/reject — but the
-- SELECT policy was never updated to match. Result: an approver got the
-- notification yet saw an empty queue on /leave, because the database filtered
-- out every request that wasn't theirs.
--
-- Overtime (0016) and tabungan libur (0018) already include is_team_manager_of
-- in their SELECT policies; this brings leave_requests in line.

drop policy if exists "read leave" on leave_requests;
create policy "read leave" on leave_requests for select to authenticated
  using (is_hr() or employee_id = my_employee_id() or is_team_manager_of(employee_id));

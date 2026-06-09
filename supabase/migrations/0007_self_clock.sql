-- Allow a signed-in employee to record their OWN attendance (clock in/out).
create policy "self clock insert" on attendance for insert to authenticated
  with check (employee_id = my_employee_id());
create policy "self clock update" on attendance for update to authenticated
  using (employee_id = my_employee_id()) with check (employee_id = my_employee_id());

-- Treelogy HR — Part-time employment type + hourly pay
--
-- Adds 'parttime' as a third contract type next to PKWT/PKWTT:
--   * employees.hourly_rate (Rp per jam) — the pay basis for part-timers.
--     Payroll pays hourly_rate × scheduled hours (work_start–work_end) ×
--     present days; no monthly base salary, no absence deduction (no work,
--     no pay).
--   * Overtime for part-timers is flat 1× at hourly_rate (same shape as PKWT).
--   * employee_contracts.type also accepts 'parttime' for contract history.

alter table employees
  drop constraint if exists employees_contract_type_check;
alter table employees
  add constraint employees_contract_type_check
  check (contract_type in ('pkwt', 'pkwtt', 'parttime'));

alter table employees
  add column if not exists hourly_rate numeric not null default 0;

alter table overtime_requests
  drop constraint if exists overtime_requests_contract_type_check;
alter table overtime_requests
  add constraint overtime_requests_contract_type_check
  check (contract_type in ('pkwt', 'pkwtt', 'parttime'));

alter table employee_contracts
  drop constraint if exists employee_contracts_type_check;
alter table employee_contracts
  add constraint employee_contracts_type_check
  check (type in ('probation', 'pkwt', 'pkwtt', 'magang', 'harian', 'parttime'));

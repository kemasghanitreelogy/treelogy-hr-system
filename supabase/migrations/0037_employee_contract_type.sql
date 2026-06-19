-- Treelogy HR — Per-employee contract type (PKWT / PKWTT) driving overtime pay
--
-- Every employee must carry a contract type. It governs how overtime is paid:
--   PKWT  : (gaji / 20 / 8) * jam
--   PKWTT : (gaji / 20 / 8) * 1.5 * (1 jam pertama)
--         + (gaji / 20 / 8) * 2   * (jam setelahnya)
-- The type is snapshotted onto each overtime_request so historical pay stays
-- explainable even if the employee's contract changes later.

alter table employees
  add column if not exists contract_type text not null default 'pkwt'
  check (contract_type in ('pkwt', 'pkwtt'));

alter table overtime_requests
  add column if not exists contract_type text not null default 'pkwt'
  check (contract_type in ('pkwt', 'pkwtt'));

-- Backfill PKWTT staff from the office master file (the rest stay PKWT).
update employees set contract_type = 'pkwtt'
where name in (
  'Ayudhia Kaniashwari',
  'Anna Vindrina',
  'Rindang Damai Mayomi Sahara',
  'Angelina Amanda Dewi',
  'Honestly Samantha'
);

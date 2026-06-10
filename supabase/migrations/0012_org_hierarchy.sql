-- ============================================================
-- Treelogy HR — Organisation hierarchy (reporting lines)
-- Additive to 0001_init.sql
--
-- Each employee may have a direct supervisor (manager_id). NULL = top of
-- their division. Drives the org-tree management UI. Writes are covered by
-- the existing "hr write employees" policy (HR/admin only).
-- ============================================================

alter table employees add column if not exists manager_id uuid references employees(id) on delete set null;
create index if not exists idx_employees_manager on employees(manager_id);

-- Seed sensible default reporting lines from existing roles/positions
-- (idempotent: re-running resolves to the same heads).

-- Factory members report to the Production Supervisor.
update employees e set manager_id = h.id
  from employees h
  where h.team = 'factory' and h.position = 'Production Supervisor'
    and e.team = 'factory' and e.id <> h.id;

-- Farm members report to the Field Lead.
update employees e set manager_id = h.id
  from employees h
  where h.team = 'farm' and h.position = 'Field Lead'
    and e.team = 'farm' and e.id <> h.id;

-- Sales members report to the Sales Lead.
update employees e set manager_id = h.id
  from employees h
  where h.team = 'sales' and h.position = 'Sales Lead'
    and e.team = 'sales' and e.id <> h.id;

-- Office chain: HR Officer reports to Finance Officer; Admin Staff reports to HR Officer.
update employees e set manager_id = f.id
  from employees f
  where f.team = 'office' and f.position = 'Finance Officer'
    and e.team = 'office' and e.position = 'HR Officer';
update employees e set manager_id = h.id
  from employees h
  where h.team = 'office' and h.position = 'HR Officer'
    and e.team = 'office' and e.position = 'Admin Staff';

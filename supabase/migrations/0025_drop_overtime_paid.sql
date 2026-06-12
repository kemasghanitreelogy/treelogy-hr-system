-- Overtime is now paid through payroll, not settled separately.
-- Drop the per-request payment tracking columns.
alter table overtime_requests drop column if exists paid;
alter table overtime_requests drop column if exists paid_at;

-- Treelogy HR — "Jadwal belum diatur" safety-net flag
--
-- New employees are created WITHOUT schedule fields (the add-employee form no
-- longer sets them). schedule_set stays false until HR saves a schedule on the
-- Jadwal page (per-employee edit or template apply) — the Jadwal list shows an
-- amber "Jadwal belum diatur" badge while false, so a skipped post-create
-- handoff can always be caught later.

alter table employees
  add column if not exists schedule_set boolean not null default false;

-- Existing staff already have working schedules — don't nag about them.
update employees set schedule_set = true;

-- ============================================================
-- Treelogy HR — Per-employee work hours (jam masuk / jam keluar)
-- HR sets these; clock-in derives late status + minutes against them.
-- ============================================================

alter table employees
  add column if not exists work_start time not null default '08:00',
  add column if not exists work_end   time not null default '17:00';

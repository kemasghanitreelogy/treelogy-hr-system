-- ============================================================
-- Treelogy HR — dedup ledger for clock-in/out push reminders so a cron
-- re-fire can't notify the same person twice on the same day. Service-role
-- only (RLS on, no policies → anon blocked, admin client bypasses).
-- ============================================================

create table if not exists clock_reminders (
  employee_id uuid not null references employees(id) on delete cascade,
  date        date not null,
  kind        text not null check (kind in ('in', 'out')),
  created_at  timestamptz not null default now(),
  primary key (employee_id, date, kind)
);

alter table clock_reminders enable row level security;

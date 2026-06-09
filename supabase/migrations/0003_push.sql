-- ============================================================
-- Treelogy HR — Web Push subscriptions
-- ============================================================
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index push_sub_emp_idx on push_subscriptions(employee_id);

alter table push_subscriptions enable row level security;

-- A user manages their own subscriptions; HR can read all (to broadcast).
create policy "own subscriptions" on push_subscriptions for all to authenticated
  using (user_id = auth.uid() or is_hr())
  with check (user_id = auth.uid() or is_hr());

-- NOTE: the demo API (src/app/api/push) uses an in-memory store so it works
-- without Supabase. To persist, swap src/lib/push/store.ts to write/read this
-- table via a service-role client and send from a Supabase Edge Function or
-- a Vercel Cron hitting /api/push/send.

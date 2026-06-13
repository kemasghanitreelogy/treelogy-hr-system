-- Prevent GoTrue's "Database error finding users".
--
-- listUsers() (used by the OTP/password-reset lookup) cannot scan NULL into
-- these varchar token columns. Four of them ship WITHOUT a DEFAULT, so rows
-- inserted via raw SQL (e.g. ad-hoc demo-account seeding) left them NULL and
-- broke every auth lookup until backfilled. The other token columns already
-- default to '' — these four should too.
--
-- NOTE: ALTER on auth.users requires ownership of the table (role
-- supabase_auth_admin). The restricted MCP/API role cannot run it, so if your
-- migration runner fails here, run this file from the Supabase SQL Editor /
-- dashboard (which connects with sufficient privileges). The backfill UPDATE
-- below works under the normal service role and is safe to run anywhere.

-- 1) Backfill any existing NULLs to '' (idempotent).
update auth.users set
  confirmation_token     = coalesce(confirmation_token, ''),
  recovery_token         = coalesce(recovery_token, ''),
  email_change           = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, '')
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null;

-- 2) Default them to '' so future inserts that omit the column stay safe.
alter table auth.users alter column confirmation_token     set default '';
alter table auth.users alter column recovery_token         set default '';
alter table auth.users alter column email_change           set default '';
alter table auth.users alter column email_change_token_new set default '';

-- Fix + prevent GoTrue's "Database error finding users".
--
-- listUsers() (used by the OTP/password-reset lookup) cannot scan NULL into
-- these varchar token columns. Four of them ship WITHOUT a DEFAULT, so rows
-- inserted via raw SQL (e.g. ad-hoc demo-account seeding) left them NULL and
-- broke every auth lookup until backfilled.
--
-- Backfill any existing NULLs to '' (idempotent). This runs fine under the
-- service role / postgres and is already applied in production.
update auth.users set
  confirmation_token     = coalesce(confirmation_token, ''),
  recovery_token         = coalesce(recovery_token, ''),
  email_change           = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, '')
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null;

-- NOTE — no ALTER ... SET DEFAULT here on purpose.
--   We wanted to DEFAULT these four columns to '' as a belt-and-suspenders
--   guard, but auth.users is owned by `supabase_auth_admin`, and on hosted
--   Supabase no available role (not even `postgres` in the SQL Editor) owns it
--   or can `set role` into it — so the ALTER fails with "must be owner of table
--   users". It is simply not runnable on a managed project.
--
--   PREVENTION instead lives in application code: create auth users ONLY via the
--   GoTrue Admin API (createUser), which always initialises these columns to ''.
--   See scripts/seed-accounts.mjs and the app's ensureAccount(). Never
--   `INSERT INTO auth.users` by hand — that is what produced the NULLs.

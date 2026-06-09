-- ============================================================
-- Treelogy HR — Password reset OTP codes
-- Stores short-lived hashed OTP codes for the self-serve
-- forgot-password flow (email sent from our own SMTP, not Supabase).
-- Server-only: RLS on with no policies → only the service-role
-- key (which bypasses RLS) can read/write. Never exposed to clients.
-- ============================================================
create table if not exists password_reset_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code_hash  text not null,
  expires_at timestamptz not null,
  consumed   boolean not null default false,
  attempts   int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists prc_email_idx on password_reset_codes(email);
create index if not exists prc_expires_idx on password_reset_codes(expires_at);

alter table password_reset_codes enable row level security;
-- No policies on purpose: only service-role access from server routes.

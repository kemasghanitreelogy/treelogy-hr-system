-- ============================================================
-- Treelogy HR — Indonesianise the leave type value.
-- The enum value 'in-lieu' (English for "sebagai pengganti") becomes
-- 'tukar-libur'. Non-destructive: ALTER TYPE ... RENAME VALUE keeps every
-- existing leave_requests row pointing at the renamed value automatically.
-- Guarded so it is safe to run more than once / on a fresh database.
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'leave_type_t' and e.enumlabel = 'in-lieu'
  ) and not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'leave_type_t' and e.enumlabel = 'tukar-libur'
  ) then
    alter type leave_type_t rename value 'in-lieu' to 'tukar-libur';
  end if;
end $$;

-- Super-admin tier: a fixed root email plus users the super admin assigns.
alter table profiles add column if not exists is_super_admin boolean not null default false;

-- Seed the root super admin (harmless if the account doesn't exist yet).
update profiles set is_super_admin = true
where id in (select id from auth.users where lower(email) = 'kemasghani123@gmail.com');

-- True when the CURRENT request belongs to a super admin (assigned flag OR root email).
create or replace function is_super_admin() returns boolean
language sql security definer stable as $$
  select coalesce((select p.is_super_admin from profiles p where p.id = auth.uid()), false)
      or coalesce(lower(auth.jwt() ->> 'email') = 'kemasghani123@gmail.com', false);
$$;

-- Guard: only a super admin (or the service role, where auth.uid() is null) may
-- flip is_super_admin — closes the escalation hole in the existing profiles UPDATE policy.
create or replace function guard_super_admin() returns trigger
language plpgsql security definer as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin then
    if not (auth.uid() is null or is_super_admin()) then
      raise exception 'not authorized to change is_super_admin';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_super_admin on profiles;
create trigger trg_guard_super_admin before update on profiles
for each row execute function guard_super_admin();

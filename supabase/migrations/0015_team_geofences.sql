-- ============================================================
-- Treelogy HR — Per-division geofences
-- Factory (Pabrik), Farm (Kebun) and Office (Kantor) are at different physical
-- locations. Clock-in/out is validated against the geofence of the division the
-- employee is registered in (employees.team). Global toggles (require_photo /
-- require_location) stay on attendance_settings.
-- ============================================================

create table if not exists team_geofences (
  team       team_t primary key,
  label      text not null,
  lat        double precision not null,
  lng        double precision not null,
  radius_m   int not null default 50,
  updated_at timestamptz not null default now()
);

alter table team_geofences enable row level security;
create policy "read team geofences" on team_geofences for select to authenticated using (true);
create policy "hr write team geofences" on team_geofences for all to authenticated
  using (is_hr()) with check (is_hr());

-- Seed the three divisions from the current single office point as a starting
-- value; HR adjusts each one to its real location afterwards.
insert into team_geofences (team, label, lat, lng, radius_m)
select v.team, v.label, s.office_lat, s.office_lng, s.max_radius_m
from (values
  ('factory'::team_t, 'Pabrik · Bali'),
  ('farm'::team_t,    'Kebun · Bali'),
  ('office'::team_t,  'Kantor · Bali')
) as v(team, label)
cross join (select office_lat, office_lng, max_radius_m from attendance_settings where id = 1) s
on conflict (team) do nothing;

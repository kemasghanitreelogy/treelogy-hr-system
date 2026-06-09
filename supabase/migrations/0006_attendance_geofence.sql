-- ============================================================
-- Treelogy HR — Attendance geofence + selfie evidence
-- ============================================================
create table attendance_settings (
  id               int primary key default 1,
  office_label     text not null default 'Treelogy Office · Bali',
  office_lat       double precision not null default -8.409518,
  office_lng       double precision not null default 115.188919,
  max_radius_m     int not null default 50,
  require_photo    boolean not null default true,
  require_location boolean not null default true,
  updated_at       timestamptz not null default now(),
  constraint singleton check (id = 1)
);
insert into attendance_settings (id) values (1);

alter table attendance_settings enable row level security;
create policy "read settings" on attendance_settings for select to authenticated using (true);
create policy "hr update settings" on attendance_settings for update to authenticated using (is_hr()) with check (is_hr());
create policy "hr insert settings" on attendance_settings for insert to authenticated with check (is_hr());

alter table attendance
  add column if not exists clock_in_lat double precision,
  add column if not exists clock_in_lng double precision,
  add column if not exists clock_in_photo text,
  add column if not exists clock_in_distance_m int,
  add column if not exists clock_out_lat double precision,
  add column if not exists clock_out_lng double precision,
  add column if not exists clock_out_photo text,
  add column if not exists clock_out_distance_m int;

insert into storage.buckets (id, name, public) values ('attendance-selfies','attendance-selfies', false)
  on conflict (id) do nothing;
create policy "auth upload selfies" on storage.objects for insert to authenticated
  with check (bucket_id = 'attendance-selfies');
create policy "owner or hr read selfies" on storage.objects for select to authenticated
  using (bucket_id = 'attendance-selfies' and (owner = auth.uid() or is_hr()));

-- ============================================================
-- Treelogy HR — agama karyawan, kalender hari libur, & riwayat kontrak.
-- Hari libur: 'public' (semua karyawan off) / 'religious' (hanya seagama off).
-- Kontrak: riwayat dari awal kerja sampai status sekarang per karyawan.
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'religion_t') then
    create type religion_t as enum ('islam', 'kristen', 'katolik', 'hindu', 'buddha', 'konghucu');
  end if;
end $$;

alter table employees add column if not exists religion religion_t;

-- Kalender hari libur ------------------------------------------
create table if not exists holidays (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  name       text not null,
  type       text not null check (type in ('public', 'religious')),
  religion   religion_t,  -- diisi saat type = 'religious'
  created_at timestamptz not null default now()
);
create index if not exists idx_holiday_date on holidays(date);

alter table holidays enable row level security;
create policy "read holidays" on holidays for select to authenticated using (true);
create policy "manage holidays" on holidays for all to authenticated
  using (is_hr() or has_perm('shifts.manage')) with check (is_hr() or has_perm('shifts.manage'));

-- Riwayat kontrak kerja ----------------------------------------
create table if not exists employee_contracts (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  type        text not null check (type in ('probation', 'pkwt', 'pkwtt', 'magang', 'harian')),
  start_date  date not null,
  end_date    date,  -- null = berkelanjutan (mis. PKWTT/tetap)
  status      text not null default 'active' check (status in ('active', 'ended')),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_contract_employee on employee_contracts(employee_id);

alter table employee_contracts enable row level security;
create policy "read contracts" on employee_contracts for select to authenticated
  using (is_hr() or employee_id = my_employee_id());
create policy "manage contracts" on employee_contracts for all to authenticated
  using (is_hr()) with check (is_hr());

-- ============================================================
-- Treelogy HR — Initial schema (Supabase / Postgres)
-- ============================================================

-- Enums --------------------------------------------------------
create type team_t as enum ('factory', 'farm', 'sales', 'office');
create type employee_status_t as enum ('active', 'inactive');
create type role_t as enum ('admin', 'hr', 'manager', 'employee');
create type ptkp_t as enum ('TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3');
create type attendance_status_t as enum ('present','late','absent','leave','sick','off','holiday');
create type attendance_source_t as enum ('biometric','mobile','manual','web');
create type leave_type_t as enum ('annual','sick','unpaid','in-lieu');
create type request_status_t as enum ('pending','approved','rejected');
create type payroll_status_t as enum ('draft','processing','approved','paid');

-- Employees ----------------------------------------------------
create table employees (
  id           uuid primary key default gen_random_uuid(),
  nik          text unique not null,
  name         text not null,
  email        text unique,
  phone        text,
  team         team_t not null,
  position     text not null,
  status       employee_status_t not null default 'active',
  join_date    date not null,
  end_date     date,
  base_salary  numeric(14,2) not null default 0,
  allowance    numeric(14,2) not null default 0,
  ptkp         ptkp_t not null default 'TK/0',
  npwp         text,
  bpjs_kes     boolean not null default true,
  bpjs_tk      boolean not null default true,
  bank_name    text,
  bank_account text,
  location     text,
  created_at   timestamptz not null default now()
);

-- Profiles (auth.users -> employee, with a role) ---------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  role        role_t not null default 'employee',
  created_at  timestamptz not null default now()
);

-- Shifts -------------------------------------------------------
create table shifts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  team           team_t not null,
  start_time     time not null,
  end_time       time not null,
  break_minutes  int not null default 60,
  overtime_after time not null,
  color          text default '#3d5a2e'
);

create table shift_assignments (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  shift_id    uuid not null references shifts(id) on delete cascade,
  date        date not null,
  unique (employee_id, date)
);

-- Attendance ---------------------------------------------------
create table attendance (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id) on delete cascade,
  date             date not null,
  shift_id         uuid references shifts(id) on delete set null,
  clock_in         timestamptz,
  clock_out        timestamptz,
  status           attendance_status_t not null default 'present',
  late_minutes     int not null default 0,
  overtime_minutes int not null default 0,
  source           attendance_source_t not null default 'mobile',
  unique (employee_id, date)
);
create index attendance_date_idx on attendance(date);
create index attendance_emp_idx on attendance(employee_id);

-- Leave --------------------------------------------------------
create table leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  type         leave_type_t not null,
  start_date   date not null,
  end_date     date not null,
  days         int not null,
  reason       text,
  status       request_status_t not null default 'pending',
  approver     text,
  requested_at timestamptz not null default now()
);

create table leave_balances (
  employee_id    uuid primary key references employees(id) on delete cascade,
  annual_quota   int not null default 12,
  annual_used    int not null default 0,
  sick_used      int not null default 0,
  tabungan_libur int not null default 0  -- saved day-off bank (days)
);

create table day_off_in_lieu (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  worked_date date not null,
  off_date    date not null,
  reason      text,
  status      request_status_t not null default 'pending'
);

-- Payroll ------------------------------------------------------
create table payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  period         text not null,            -- 'YYYY-MM'
  status         payroll_status_t not null default 'draft',
  employee_count int not null default 0,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  unique (period)
);

create table payslips (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references payroll_runs(id) on delete cascade,
  employee_id         uuid not null references employees(id) on delete cascade,
  period              text not null,
  working_days        int not null default 0,
  present_days        int not null default 0,
  base_salary         numeric(14,2) not null default 0,
  allowance           numeric(14,2) not null default 0,
  overtime_pay        numeric(14,2) not null default 0,
  overtime_hours      numeric(6,1) not null default 0,
  gross_pay           numeric(14,2) not null default 0,
  bpjs                jsonb not null default '{}'::jsonb,
  bpjs_employee_total numeric(14,2) not null default 0,
  pph21               numeric(14,2) not null default 0,
  deductions          numeric(14,2) not null default 0,
  net_pay             numeric(14,2) not null default 0,
  unique (run_id, employee_id)
);

-- KPIs ---------------------------------------------------------
create table kpis (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  metric      text not null,
  period      text not null,
  target      numeric not null,
  actual      numeric not null,
  unit        text,
  weight      int not null default 0
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table employees        enable row level security;
alter table profiles         enable row level security;
alter table shifts           enable row level security;
alter table shift_assignments enable row level security;
alter table attendance       enable row level security;
alter table leave_requests   enable row level security;
alter table leave_balances   enable row level security;
alter table day_off_in_lieu  enable row level security;
alter table payroll_runs     enable row level security;
alter table payslips         enable row level security;
alter table kpis             enable row level security;

-- Helper: is the current user an HR/admin?
create or replace function is_hr()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin','hr')
  );
$$;

-- Helper: employee_id linked to the current user
create or replace function my_employee_id()
returns uuid language sql security definer stable as $$
  select employee_id from profiles where id = auth.uid();
$$;

-- Read: any authenticated user can read reference + own-or-HR data.
create policy "read employees" on employees for select to authenticated using (true);
create policy "read shifts" on shifts for select to authenticated using (true);
create policy "read assignments" on shift_assignments for select to authenticated using (true);
create policy "read kpis" on kpis for select to authenticated using (is_hr() or employee_id = my_employee_id());

create policy "read attendance" on attendance for select to authenticated
  using (is_hr() or employee_id = my_employee_id());
create policy "read leave" on leave_requests for select to authenticated
  using (is_hr() or employee_id = my_employee_id());
create policy "read balances" on leave_balances for select to authenticated
  using (is_hr() or employee_id = my_employee_id());
create policy "read swaps" on day_off_in_lieu for select to authenticated
  using (is_hr() or employee_id = my_employee_id());
create policy "read payroll runs" on payroll_runs for select to authenticated using (is_hr());
create policy "read payslips" on payslips for select to authenticated
  using (is_hr() or employee_id = my_employee_id());
create policy "read own profile" on profiles for select to authenticated
  using (id = auth.uid() or is_hr());

-- Write: HR/admin manage everything.
create policy "hr write employees" on employees for all to authenticated using (is_hr()) with check (is_hr());
create policy "hr write shifts" on shifts for all to authenticated using (is_hr()) with check (is_hr());
create policy "hr write assignments" on shift_assignments for all to authenticated using (is_hr()) with check (is_hr());
create policy "hr write attendance" on attendance for all to authenticated using (is_hr()) with check (is_hr());
create policy "hr write balances" on leave_balances for all to authenticated using (is_hr()) with check (is_hr());
create policy "hr write payroll" on payroll_runs for all to authenticated using (is_hr()) with check (is_hr());
create policy "hr write payslips" on payslips for all to authenticated using (is_hr()) with check (is_hr());
create policy "hr write kpis" on kpis for all to authenticated using (is_hr()) with check (is_hr());

-- Employees can create their own leave / swap requests; HR can manage all.
create policy "create own leave" on leave_requests for insert to authenticated
  with check (is_hr() or employee_id = my_employee_id());
create policy "manage leave" on leave_requests for update to authenticated
  using (is_hr()) with check (is_hr());
create policy "create own swap" on day_off_in_lieu for insert to authenticated
  with check (is_hr() or employee_id = my_employee_id());
create policy "manage swap" on day_off_in_lieu for update to authenticated
  using (is_hr()) with check (is_hr());

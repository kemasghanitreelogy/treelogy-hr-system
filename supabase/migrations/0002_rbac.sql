-- ============================================================
-- Treelogy HR — RBAC: custom roles, permissions, assignment
-- Additive to 0001_init.sql
-- ============================================================

-- Roles with a flexible permission set (array of permission ids).
create table roles (
  id          text primary key,                 -- e.g. 'role-admin'
  name        text not null,
  description text,
  color       text not null default '#3d5a2e',
  system      boolean not null default false,   -- protected from deletion
  permissions text[] not null default '{}',     -- e.g. {'payroll.view','leave.approve'}
  created_at  timestamptz not null default now()
);

-- Link each profile (auth user) to a role.
alter table profiles add column if not exists role_id text references roles(id) on delete set null;

-- Permission catalog (reference table; mirrors src/lib/rbac.ts).
create table permissions (
  id     text primary key,   -- 'payroll.process'
  module text not null,      -- 'payroll'
  label  text not null
);

-- Seed permission catalog -------------------------------------
insert into permissions (id, module, label) values
  ('dashboard.view','dashboard','Lihat dashboard'),
  ('attendance.view','attendance','Lihat absensi'),
  ('attendance.manage','attendance','Kelola & koreksi absensi'),
  ('shifts.view','shifts','Lihat shift & jadwal'),
  ('shifts.manage','shifts','Kelola shift'),
  ('shifts.swap_approve','shifts','Setujui tukar libur'),
  ('leave.view','leave','Lihat cuti & saldo'),
  ('leave.request','leave','Ajukan cuti/izin'),
  ('leave.approve','leave','Setujui / tolak cuti'),
  ('payroll.view','payroll','Lihat payroll & slip gaji'),
  ('payroll.process','payroll','Proses & setujui payroll'),
  ('payroll.export','payroll','Ekspor transfer bank'),
  ('employees.view','employees','Lihat data karyawan'),
  ('employees.manage','employees','Tambah / edit / nonaktifkan'),
  ('kpi.view','kpi','Lihat KPI'),
  ('kpi.manage','kpi','Kelola KPI & target'),
  ('access.roles','access','Kelola peran & hak akses'),
  ('access.users','access','Kelola pengguna & assignment');

-- Seed default roles ------------------------------------------
insert into roles (id, name, description, color, system, permissions) values
  ('role-admin','Administrator','Akses penuh ke seluruh sistem termasuk pengaturan peran.','#3d5a2e',true,
    (select array_agg(id) from permissions)),
  ('role-hr','HR Officer','Mengelola karyawan, absensi, cuti, dan payroll.','#6b7548',true,
    (select array_agg(id) from permissions where id <> 'access.roles')),
  ('role-manager','Manager / Supervisor','Menyetujui cuti & tukar libur, melihat data tim.','#4a7ba6',false,
    array['dashboard.view','attendance.view','shifts.view','shifts.swap_approve','leave.view','leave.approve','employees.view','kpi.view']),
  ('role-employee','Karyawan','Absensi mandiri dan pengajuan cuti/izin.','#8ba859',true,
    array['dashboard.view','attendance.view','leave.view','leave.request']),
  ('role-payroll','Payroll Staff','Khusus memproses payroll dan ekspor transfer bank.','#e0a82e',false,
    array['dashboard.view','payroll.view','payroll.process','payroll.export','attendance.view']);

-- Permission-aware helpers ------------------------------------
-- True if the current user's role grants `perm`.
create or replace function has_perm(perm text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from profiles p
    join roles r on r.id = p.role_id
    where p.id = auth.uid() and perm = any(r.permissions)
  );
$$;

-- Keep is_hr() working: now also true for any role with employees.manage.
create or replace function is_hr()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles p
    left join roles r on r.id = p.role_id
    where p.id = auth.uid()
      and (p.role in ('admin','hr') or 'employees.manage' = any(coalesce(r.permissions,'{}')))
  );
$$;

-- RLS for roles/permissions -----------------------------------
alter table roles enable row level security;
alter table permissions enable row level security;

create policy "read roles" on roles for select to authenticated using (true);
create policy "read permissions" on permissions for select to authenticated using (true);

-- Only users with access.roles may manage roles; the Admin role stays protected.
create policy "manage roles" on roles for all to authenticated
  using (has_perm('access.roles'))
  with check (has_perm('access.roles') and id <> 'role-admin');

-- Only users with access.users may (re)assign roles to profiles.
create policy "assign roles" on profiles for update to authenticated
  using (has_perm('access.users') or id = auth.uid())
  with check (has_perm('access.users') or id = auth.uid());

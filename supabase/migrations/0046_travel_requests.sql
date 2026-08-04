-- ============================================================
-- Treelogy HR — Perjalanan Dinas (Business Travel Request)
--
-- Menggantikan Google Form "Business Travel Request". Perbedaan penting:
-- data yang bisa DITURUNKAN tidak disimpan dari ketikan pengguna, melainkan
-- dihitung/diambil server saat pengajuan:
--   · nama & jabatan  → dari tabel employees (jabatan di-snapshot, lihat bawah)
--   · durasi          → dari tanggal berangkat & kembali (inklusif)
--   · total biaya     → jumlah keempat komponen biaya
-- Dengan begitu angka di daftar, detail, dan persetujuan tidak mungkin berbeda.
--
-- Kolom persetujuan sengaja SAMA PERSIS dengan leave_requests & overtime_requests
-- supaya helper applyApproval() (atasan → HR) dipakai ulang tanpa cabang khusus.
-- ============================================================

create type travel_transport_t as enum ('company_vehicle','flight','train','other');

create table if not exists travel_requests (
  id                     uuid primary key default gen_random_uuid(),
  employee_id            uuid not null references employees(id) on delete cascade,

  -- I. Informasi karyawan.
  -- Jabatan DI-SNAPSHOT saat pengajuan: kalau karyawan promosi tahun depan,
  -- riwayat perjalanan dinasnya harus tetap menunjukkan jabatan saat itu.
  job_title              text not null,

  -- II. Rincian perjalanan
  purpose                text not null,
  destination            text not null,
  departure_date         date not null,
  return_date            date not null,
  duration_days          integer not null check (duration_days >= 1),
  transport              travel_transport_t not null default 'company_vehicle',
  transport_other        text,
  accommodation_required boolean not null default false,
  accommodation_details  text,

  -- III. Estimasi biaya (Rupiah)
  cost_transport         numeric not null default 0 check (cost_transport >= 0),
  cost_accommodation     numeric not null default 0 check (cost_accommodation >= 0),
  cost_per_diem          numeric not null default 0 check (cost_per_diem >= 0),
  cost_other             numeric not null default 0 check (cost_other >= 0),
  cost_total             numeric not null default 0 check (cost_total >= 0),

  -- IV. Uang muka perjalanan
  advance_required       boolean not null default false,
  advance_amount         numeric not null default 0 check (advance_amount >= 0),

  -- V. Informasi tambahan
  remarks                text,
  -- Pernyataan karyawan pada form asli; wajib true (divalidasi juga di API).
  confirmed              boolean not null default false,

  -- Persetujuan ganda (atasan → HR), kolom identik dengan modul cuti & lembur.
  status                 request_status_t not null default 'pending',
  approver               text,
  rejection_reason       text,
  manager_approver       text,
  manager_approved_at    timestamptz,
  hr_approver            text,
  hr_approved_at         timestamptz,
  requested_at           timestamptz not null default now(),

  constraint travel_dates_ordered check (return_date >= departure_date)
);

create index if not exists idx_travel_employee on travel_requests(employee_id);
create index if not exists idx_travel_status   on travel_requests(status);
create index if not exists idx_travel_departure on travel_requests(departure_date);

alter table travel_requests enable row level security;

-- Baca: HR, karyawan itu sendiri, atau atasan divisinya — sama seperti lembur.
drop policy if exists "read travel" on travel_requests;
create policy "read travel" on travel_requests for select to authenticated
  using (is_hr() or employee_id = my_employee_id() or is_team_manager_of(employee_id));

-- Buat: HR (untuk siapa pun) atau karyawan untuk dirinya sendiri.
drop policy if exists "create travel" on travel_requests;
create policy "create travel" on travel_requests for insert to authenticated
  with check (is_hr() or employee_id = my_employee_id());

-- Ubah (setujui/tolak): HR atau atasan divisinya.
drop policy if exists "manage travel" on travel_requests;
create policy "manage travel" on travel_requests for update to authenticated
  using      (is_hr() or is_team_manager_of(employee_id))
  with check (is_hr() or is_team_manager_of(employee_id));

-- ---- Permission catalog -------------------------------------
insert into permissions (id, module, label) values
  ('travel.view','travel','Lihat perjalanan dinas'),
  ('travel.request','travel','Ajukan perjalanan dinas'),
  ('travel.approve','travel','Setujui / tolak perjalanan dinas')
on conflict (id) do nothing;

update roles
   set permissions = (select array_agg(distinct p) from unnest(
         permissions || array['travel.view','travel.request','travel.approve']) p)
 where id in ('role-admin','role-hr');

update roles
   set permissions = (select array_agg(distinct p) from unnest(
         permissions || array['travel.view','travel.request','travel.approve']) p)
 where id = 'role-manager';

-- Karyawan boleh melihat & mengajukan miliknya sendiri (RLS yang membatasi cakupan).
update roles
   set permissions = (select array_agg(distinct p) from unnest(
         permissions || array['travel.view','travel.request']) p)
 where id in ('role-employee','role-inventory');

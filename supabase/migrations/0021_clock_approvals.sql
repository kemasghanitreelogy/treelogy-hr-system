-- ============================================================
-- Treelogy HR — Konfirmasi clock-in/out di luar area (geofence).
-- Clock di luar radius tidak langsung ditolak: karyawan dapat mengajukan
-- konfirmasi ke HR (dengan catatan opsional). Saat HR menyetujui, absensi
-- ditulis memakai WAKTU PENGAJUAN (requested_at), bukan waktu approval.
-- ============================================================

create table if not exists clock_approval_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  date          date not null,
  direction     text not null check (direction in ('in','out')),
  requested_at  timestamptz not null default now(),  -- momen clock sebenarnya
  lat           double precision,
  lng           double precision,
  distance_m    int,
  photo_path    text,
  note          text,                                 -- catatan opsional untuk HR
  status        request_status_t not null default 'pending',
  approver      text,
  decided_at    timestamptz
);
create index if not exists idx_clock_approval_employee on clock_approval_requests(employee_id);

-- Satu pengajuan pending per (karyawan, tanggal, arah) — tidak bisa spam.
create unique index if not exists idx_clock_approval_once
  on clock_approval_requests(employee_id, date, direction)
  where status = 'pending';

alter table clock_approval_requests enable row level security;

-- Read: HR atau karyawan ybs.
create policy "read clock approvals" on clock_approval_requests for select to authenticated
  using (is_hr() or employee_id = my_employee_id());
-- Create: HR (atas nama siapa pun) atau karyawan untuk dirinya sendiri.
create policy "create clock approval" on clock_approval_requests for insert to authenticated
  with check (is_hr() or employee_id = my_employee_id());
-- Update (setujui/tolak): HR saja.
create policy "manage clock approvals" on clock_approval_requests for update to authenticated
  using (is_hr()) with check (is_hr());

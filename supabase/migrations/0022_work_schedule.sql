-- ============================================================
-- Treelogy HR — Jadwal kerja berbasis hari (mengganti model "shift").
-- Setiap karyawan punya HARI kerja (work_days, 0=Min..6=Sab) + jam kerja
-- (work_start/work_end yang sudah ada). Template jadwal bisa dibuat lalu
-- diterapkan ke banyak karyawan, atau jadwal diedit langsung per karyawan.
-- Absensi: hadir/alpa dari hari yang seharusnya kerja; telat dari jam masuk.
-- Clock-in di hari libur → karyawan memilih: tukar libur (tabungan) / lembur.
-- ============================================================

create table if not exists schedule_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  work_days   int[] not null default '{1,2,3,4,5}',  -- 0=Minggu .. 6=Sabtu
  work_start  time not null default '08:00',
  work_end    time not null default '17:00',
  created_at  timestamptz not null default now()
);

alter table employees add column if not exists work_days int[] not null default '{1,2,3,4,5}';
alter table employees add column if not exists schedule_template_id uuid references schedule_templates(id) on delete set null;

-- Backfill agar sesuai pola lama: kantor Senin–Jumat, pabrik & kebun Senin–Sabtu.
update employees set work_days = '{1,2,3,4,5,6}' where team in ('factory','farm');
update employees set work_days = '{1,2,3,4,5}'   where team = 'office';

-- Pilihan saat clock-in di hari libur: tukar libur (tabungan) atau lembur.
alter table attendance add column if not exists off_day_choice text
  check (off_day_choice in ('swap','overtime'));

alter table schedule_templates enable row level security;
create policy "read schedule templates" on schedule_templates for select to authenticated using (true);
create policy "manage schedule templates" on schedule_templates for all to authenticated
  using      (is_hr() or has_perm('shifts.manage'))
  with check (is_hr() or has_perm('shifts.manage'));

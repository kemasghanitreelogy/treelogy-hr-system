-- ============================================================
-- Log email pengingat hari libur (H-1).
--
-- Satu baris per (hari libur, karyawan) yang emailnya SUDAH terkirim.
-- Inilah yang membuat pengirimnya aman diulang: run yang mati di tengah
-- (SMTP putus setelah lima email) tinggal dijalankan lagi, dan lima orang
-- pertama tidak menerima ucapan yang sama dua kali.
-- ============================================================

create table if not exists holiday_greeting_log (
  id          uuid primary key default gen_random_uuid(),
  holiday_id  uuid not null references holidays(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  sent_at     timestamptz not null default now(),
  unique (holiday_id, employee_id)
);

alter table holiday_greeting_log enable row level security;

-- Hanya HR yang perlu melihat jejaknya; menulis hanya lewat service role.
drop policy if exists "hr reads holiday greeting log" on holiday_greeting_log;
create policy "hr reads holiday greeting log" on holiday_greeting_log
  for select to authenticated using (is_hr());

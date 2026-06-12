-- ============================================================
-- Treelogy HR — clock_approval_requests kini juga menampung "kerja hari libur".
-- Clock-in di hari libur DITAHAN (tidak langsung jadi absensi); jadi pengajuan
-- pending dengan pilihan tukar-libur/lembur. HR menyetujui di halaman Attendance,
-- baru absensi + (tabungan / lembur) dicatat. clock_out_at menyimpan jam pulang
-- yang dikirim selagi pengajuan masih menunggu (untuk menghitung durasi lembur).
-- ============================================================

alter table clock_approval_requests
  add column if not exists kind text not null default 'out_of_area'
    check (kind in ('out_of_area', 'off_day'));

alter table clock_approval_requests
  add column if not exists off_day_choice text
    check (off_day_choice in ('swap', 'overtime'));

alter table clock_approval_requests
  add column if not exists clock_out_at timestamptz;

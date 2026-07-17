# Workflow: Persetujuan Clock In/Out → HR-only (tanpa atasan)

Tanggal: 2026-07-17 · Strategi: systematic · Scope: notifikasi saja (gap tunggal)

## Requirement
Pengajuan clock in/out (di luar area & hari libur) tidak butuh persetujuan atasan.
Permintaan acc hanya ke HR.

## Audit kondisi saat ini (verified terhadap kode + DB live)

| Lapisan | Kondisi | Status |
|---|---|---|
| RLS `clock_approval_requests` (update) | `is_hr()` only — atasan tidak bisa acc sejak migration 0021 | ✅ sudah HR-only |
| UI panel approval (`attendance/page.tsx`) | Digate `attendance.manage`; role Manager tidak memilikinya (cek roles DB live) | ✅ sudah HR-only |
| Nav badge (`getActionCounts`) | Attendance count digate `attendance.manage` / `employees.manage` | ✅ sudah HR-only |
| Alur approval route (`/api/attendance/approvals`) | Single-step approve/reject, tanpa tahap manajer | ✅ sudah HR-only |
| **Push notification** (`/api/attendance/clock`) | `notifyApprovers()` = HR **+ atasan langsung** (rpc `approver_employees`) menerima "perlu konfirmasi Anda" di 2 titik: out_of_area & off_day | ❌ **gap — atasan ikut dimintai konfirmasi** |

## Phases

### Phase 1 — DB: RPC target notifikasi HR
- [x] Migration `0041_hr_employees_rpc.sql`: fungsi `hr_employees(req_employee uuid)`
      → karyawan aktif yang HR (semantik = `is_hr()`: `profiles.role in ('admin','hr')`
      ATAU permission `employees.manage`), exclude pemohon.
      `security definer`, execute hanya untuk `service_role` (paritas dengan `approver_employees`).
- [x] Terapkan ke Supabase live + verifikasi (proname + EXECUTE service_role ✓).

### Phase 2 — Lib: helper notifikasi
- [x] `lib/notify.ts`: tambah `notifyHr(requesterEmployeeId, content)` memakai rpc `hr_employees`.
      `notifyApprovers` TIDAK diubah (masih dipakai leave/overtime yang tetap dual approval).

### Phase 3 — Route clock
- [x] `/api/attendance/clock`: ganti 2 panggilan `notifyApprovers` → `notifyHr`
      (request out_of_area dan off_day).

### Phase 4 — Validasi
- [x] `tsc --noEmit` + `next build` hijau.
- [x] Grep: notifyHr hanya di clock route; leave/overtime/tabungan tetap notifyApprovers.
- [x] Update memory proyek (treelogy-push-notifications).

## Non-goals (eksplisit)
- Leave, lembur, tabungan: tetap dual approval (atasan → HR) — tidak disentuh.
- Tidak ada perubahan RLS/UI (sudah HR-only).

## Risiko
- Rendah: perubahan additive; fallback jika rpc gagal = notifikasi tidak terkirim (best-effort, sama seperti sekarang).

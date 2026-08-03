import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getApprovedOvertimeBetween, getAttendanceBetween } from "@/lib/data";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Batas kewarasan: satu permintaan ekspor maksimal ~2 tahun. */
const MAX_DAYS = 750;

/**
 * Absensi + lembur disetujui pada rentang tanggal, untuk Ekspor Rekap Absensi.
 *
 * Halaman absensi sengaja hanya memuat bulan berjalan agar ringan; tanpa
 * endpoint ini, mengekspor bulan lampau akan menghasilkan file kosong.
 *
 * Cakupan datanya ditentukan RLS, bukan kode ini: HR mendapat seluruh karyawan,
 * karyawan biasa hanya barisnya sendiri. Jadi tidak ada pengecekan izin manual
 * yang bisa ketinggalan di sini.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (!Number.isFinite(days) || days > MAX_DAYS) {
    return NextResponse.json({ error: "out_of_range" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [records, overtimeAll] = await Promise.all([
    getAttendanceBetween(from, to),
    getApprovedOvertimeBetween(from, to),
  ]);

  // Lembur hanya butuh tiga kolom di sheet "Daftar Lembur" — jangan kirim sisanya.
  const overtime = overtimeAll.map((o) => ({
    employeeId: o.employeeId,
    date: o.date,
    hours: o.hours,
  }));

  return NextResponse.json({ ok: true, records, overtime });
}

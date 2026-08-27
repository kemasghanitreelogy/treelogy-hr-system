import type { SupabaseClient } from "@supabase/supabase-js";
import { contractRatePerHour, overtimePayEstimate, parseContractType } from "./overtime";

/* ============================================================
   Catatan lembur untuk kerja di HARI LIBUR.

   Dulu logika ini hanya hidup di route persetujuan HR, dan hanya berjalan bila
   `clock_out_at` sudah terisi. Padahal jam pulang itu TIDAK PERNAH terisi —
   jalur clock-out hari libur hanya memperbarui pengajuan yang masih `pending`,
   sedangkan absensinya baru ada setelah HR menyetujui. Akibatnya: 8 orang
   memilih dibayar lembur, nol catatan lembur terbit. Diam-diam, sejak Juni.

   Sekarang dipakai bersama oleh kedua jalur — saat HR menyetujui, dan saat
   karyawan menekan clock-out setelah disetujui — supaya keduanya tidak bisa
   lagi melenceng satu sama lain.
   ============================================================ */

/** HH:MM WITA dari sebuah timestamp. */
export function witaHHMM(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

/** Menit sejak tengah malam WITA. */
export function witaMinutes(iso: string): number {
  const [h, m] = witaHHMM(iso).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Terbitkan catatan lembur hari libur, sekali saja per (karyawan, tanggal).
 *
 * Mengembalikan `false` bila tidak ada yang perlu dicatat (durasi nol, atau
 * catatannya sudah ada) — bukan error, karena keduanya keadaan yang wajar.
 */
export async function recordOffDayOvertime(opts: {
  supabase: SupabaseClient;
  employeeId: string;
  date: string;
  /** Jam masuk (ISO). */
  startIso: string;
  /** Jam pulang (ISO). */
  endIso: string;
  approver: string | null;
}): Promise<boolean> {
  const { supabase, employeeId, date, startIso, endIso, approver } = opts;

  const mins = witaMinutes(endIso) - witaMinutes(startIso);
  if (mins <= 0) return false;

  // Idempoten: menekan clock-out dua kali, atau HR menyetujui setelah karyawan
  // clock-out, tidak boleh menerbitkan lembur dobel.
  const { data: existing } = await supabase
    .from("overtime_requests")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();
  if (existing) return false;

  const { data: emp } = await supabase
    .from("employees")
    .select("base_salary, hourly_rate, contract_type")
    .eq("id", employeeId)
    .maybeSingle();

  const hours = Math.round((mins / 60) * 100) / 100;
  const contractType = parseContractType(emp?.contract_type);
  const ratePerHour = contractRatePerHour(
    contractType,
    Number(emp?.base_salary) || 0,
    Number(emp?.hourly_rate) || 0,
  );

  const { error } = await supabase.from("overtime_requests").insert({
    employee_id: employeeId,
    date,
    start_time: witaHHMM(startIso),
    end_time: witaHHMM(endIso),
    hours,
    reason: "Kerja di hari libur (disetujui HR)",
    rate_per_hour: ratePerHour,
    amount: overtimePayEstimate(ratePerHour, hours, contractType),
    contract_type: contractType,
    status: "approved",
    approver,
    paid: false,
  });
  return !error;
}

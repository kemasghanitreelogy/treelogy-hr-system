import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapClockApproval } from "@/lib/data";
import { adjustTabungan } from "@/lib/balance";
import { pushNotifications } from "@/lib/notify";
import { contractRatePerHour, overtimePayEstimate, parseContractType } from "@/lib/overtime";
import { formatDate } from "@/lib/utils";
import type { RequestStatus } from "@/lib/types";

export const runtime = "nodejs";

const STATUSES: RequestStatus[] = ["pending", "approved", "rejected"];

/** HH:MM WITA (Asia/Makassar) dari sebuah timestamp. */
function witaHHMM(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Menit sejak tengah malam WITA. */
function witaMinutes(iso: string): number {
  const [h, m] = witaHHMM(iso).split(":").map(Number);
  return h * 60 + m;
}

async function auth() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase };
}

// ---- Setujui / tolak clock di luar area (HR via RLS) ----
export async function PATCH(req: Request) {
  let body: { id?: string; status?: RequestStatus; approver?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (!body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  if (body.status === "rejected" && !body.reason?.trim()) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data: prev } = await supabase!
    .from("clock_approval_requests")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await supabase!
    .from("clock_approval_requests")
    .update({
      status: body.status,
      approver: body.approver?.trim() || null,
      rejection_reason: body.status === "rejected" ? body.reason!.trim() : null,
      decided_at: body.status === "pending" ? null : new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Baru disetujui → tulis absensi memakai WAKTU PENGAJUAN (bukan waktu approval).
  if (prev.status !== "approved" && body.status === "approved") {
    const employeeId = String(prev.employee_id);
    const date = String(prev.date);
    const requestedAt = String(prev.requested_at);
    const { data: emp } = await supabase!
      .from("employees")
      .select("work_start, work_end, base_salary, hourly_rate, contract_type")
      .eq("id", employeeId)
      .maybeSingle();

    if (prev.kind === "off_day") {
      // Tulis absensi hari libur (hadir, tanpa telat) + jam pulang bila ada.
      const clockOutAt = prev.clock_out_at ? String(prev.clock_out_at) : null;
      const { error: attErr } = await supabase!.from("attendance").upsert(
        {
          employee_id: employeeId,
          date,
          clock_in: requestedAt,
          clock_out: clockOutAt,
          status: "present",
          late_minutes: 0,
          off_day_choice: prev.off_day_choice,
          source: "mobile",
          clock_in_lat: prev.lat ?? null,
          clock_in_lng: prev.lng ?? null,
          clock_in_distance_m: prev.distance_m ?? null,
          clock_in_photo: prev.photo_path ?? null,
        },
        { onConflict: "employee_id,date" },
      );
      if (attErr) return NextResponse.json({ error: "attendance_write_failed" }, { status: 500 });

      if (prev.off_day_choice === "swap") {
        // Tukar libur → kreditkan 1 hari ke tabungan libur (langsung disetujui).
        const { error: depErr } = await supabase!.from("tabungan_libur_entries").insert({
          employee_id: employeeId,
          kind: "deposit",
          days: 1,
          event_date: date,
          reason: "Kerja di hari libur — tukar jadi tabungan libur",
          source: "attendance",
          status: "approved",
          approver: body.approver?.trim() || null,
          decided_at: new Date().toISOString(),
        });
        if (!depErr) await adjustTabungan(employeeId, 1);
      } else if (prev.off_day_choice === "overtime" && clockOutAt) {
        // Lembur → catat ke data lembur (disetujui, tinggal pembayaran).
        const mins = witaMinutes(clockOutAt) - witaMinutes(requestedAt);
        if (mins > 0) {
          const { data: existing } = await supabase!
            .from("overtime_requests")
            .select("id")
            .eq("employee_id", employeeId)
            .eq("date", date)
            .maybeSingle();
          if (!existing) {
            const hours = Math.round((mins / 60) * 100) / 100;
            const baseSalary = Number(emp?.base_salary) || 0;
            const contractType = parseContractType(emp?.contract_type);
            const ratePerHour = contractRatePerHour(contractType, baseSalary, Number(emp?.hourly_rate) || 0);
            await supabase!.from("overtime_requests").insert({
              employee_id: employeeId,
              date,
              start_time: witaHHMM(requestedAt),
              end_time: witaHHMM(clockOutAt),
              hours,
              reason: "Kerja di hari libur (disetujui HR)",
              rate_per_hour: ratePerHour,
              amount: overtimePayEstimate(ratePerHour, hours, contractType),
              contract_type: contractType,
              status: "approved",
              approver: body.approver?.trim() || null,
              paid: false,
            });
          }
        }
      }
    } else if (prev.direction === "in") {
      const [sh, sm] = String(emp?.work_start ?? "08:00").split(":").map(Number);
      const lateMinutes = Math.max(0, witaMinutes(requestedAt) - (sh * 60 + sm));
      const { error: attErr } = await supabase!.from("attendance").upsert(
        {
          employee_id: employeeId,
          date,
          clock_in: requestedAt,
          status: lateMinutes > 0 ? "late" : "present",
          late_minutes: lateMinutes,
          source: "mobile",
          clock_in_lat: prev.lat ?? null,
          clock_in_lng: prev.lng ?? null,
          clock_in_distance_m: prev.distance_m ?? null,
          clock_in_photo: prev.photo_path ?? null,
        },
        { onConflict: "employee_id,date" },
      );
      if (attErr) return NextResponse.json({ error: "attendance_write_failed" }, { status: 500 });
    } else {
      const [eh, em] = String(emp?.work_end ?? "17:00").split(":").map(Number);
      const overtimeMinutes = Math.max(0, witaMinutes(requestedAt) - (eh * 60 + em));
      const outFields = {
        clock_out: requestedAt,
        overtime_minutes: overtimeMinutes,
        clock_out_lat: prev.lat ?? null,
        clock_out_lng: prev.lng ?? null,
        clock_out_distance_m: prev.distance_m ?? null,
        clock_out_photo: prev.photo_path ?? null,
      };
      // Update dulu agar status hari itu (mis. "late") tidak tertimpa; insert
      // hanya jika belum ada baris absensi sama sekali untuk hari tersebut.
      const { data: updated, error: updErr } = await supabase!
        .from("attendance")
        .update(outFields)
        .eq("employee_id", employeeId)
        .eq("date", date)
        .select("id")
        .maybeSingle();
      if (updErr) return NextResponse.json({ error: "attendance_write_failed" }, { status: 500 });
      if (!updated) {
        const { error: insErr } = await supabase!.from("attendance").insert({
          employee_id: employeeId,
          date,
          status: "present",
          source: "mobile",
          ...outFields,
        });
        if (insErr) return NextResponse.json({ error: "attendance_write_failed" }, { status: 500 });
      }
    }
  }

  // Kabari karyawan.
  if (body.status === "approved" || body.status === "rejected") {
    const verb = body.status === "approved" ? "disetujui" : "ditolak";
    const title =
      data.kind === "off_day"
        ? `Kerja di hari libur ${verb}`
        : `Clock-${data.direction} di luar area ${verb}`;
    const reasonNote = body.status === "rejected" && data.rejection_reason ? ` · "${data.rejection_reason}"` : "";
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "attendance",
        tone: body.status,
        title,
        body: `${formatDate(String(data.date))}${data.approver ? ` · oleh ${data.approver}` : ""}${reasonNote}`,
        href: "/attendance",
      },
    ]);
  }

  return NextResponse.json({ ok: true, request: mapClockApproval(data) });
}

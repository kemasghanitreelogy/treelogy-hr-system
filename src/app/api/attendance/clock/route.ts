import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { distanceMeters } from "@/lib/geo";
import { notifyApprovers } from "@/lib/notify";
import { formatDate } from "@/lib/utils";

export const runtime = "nodejs";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Nomor hari (0=Min..6=Sab) menurut WITA (Asia/Makassar). */
function witaDow(when: Date): number {
  return WD.indexOf(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Makassar", weekday: "short" }).format(when));
}
/** HH:MM menurut WITA. */
function witaHHMM(when: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);
}

// Tarif lembur per jam = gaji pokok / 20 hari / 8 jam (sama dengan modul Lembur).
const OVERTIME_DIVISOR = 20 * 8;

interface Body {
  direction: "in" | "out";
  lat?: number;
  lng?: number;
  photo?: string; // data URL
  /** true = karyawan sadar di luar area dan minta konfirmasi HR. */
  confirmOutOfRange?: boolean;
  /** Catatan opsional untuk HR saat mengajukan konfirmasi luar area. */
  note?: string;
  /** Saat clock-in di hari libur: 'swap' (→tabungan) / 'overtime' (→lembur). */
  offDayChoice?: "swap" | "overtime";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const direction = body.direction === "out" ? "out" : "in";

  // Seed/demo mode: accept without persistence so the widget works offline.
  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: true, recorded: false, demo: true });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: true, recorded: false, demo: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Who is clocking in — needed for the team-scoped geofence and late calc.
  const { data: profile } = await supabase
    .from("profiles")
    .select("employee_id")
    .eq("id", user.id)
    .maybeSingle();
  let emp: {
    name?: string | null;
    work_start?: string | null;
    work_end?: string | null;
    team?: string | null;
    work_days?: number[] | null;
    base_salary?: number | null;
  } | null = null;
  if (profile?.employee_id) {
    const { data } = await supabase
      .from("employees")
      .select("name, work_start, work_end, team, work_days, base_salary")
      .eq("id", profile.employee_id)
      .maybeSingle();
    emp = data;
  }
  // Hari libur = hari ini bukan hari kerja menurut jadwal karyawan.
  const workDays = Array.isArray(emp?.work_days) ? emp!.work_days!.map(Number) : [1, 2, 3, 4, 5];
  const isOffDay = !workDays.includes(witaDow(new Date()));

  // Global toggles.
  const { data: s } = await supabase
    .from("attendance_settings")
    .select("require_photo, require_location")
    .eq("id", 1)
    .maybeSingle();
  const requireLocation = s ? Boolean(s.require_location) : true;
  const requirePhoto = s ? Boolean(s.require_photo) : true;

  // Geofence re-validation against the employee's OWN division (never trust client).
  let distance: number | null = null;
  let outOfRange = false;
  if (requireLocation) {
    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return NextResponse.json({ error: "location_required" }, { status: 400 });
    }
    const team = (emp?.team as string) ?? "office";
    const { data: gf } = await supabase
      .from("team_geofences")
      .select("lat, lng, radius_m")
      .eq("team", team)
      .maybeSingle();
    const fence = gf ?? { lat: -8.409518, lng: 115.188919, radius_m: 50 };
    distance = distanceMeters(body.lat, body.lng, fence.lat, fence.lng);
    if (distance > fence.radius_m) {
      // Tanpa flag konfirmasi → tolak seperti biasa (klien menampilkan modal).
      // Dengan flag → lanjut sebagai PENGAJUAN konfirmasi HR, bukan absensi langsung.
      if (!body.confirmOutOfRange) {
        return NextResponse.json(
          { error: "out_of_range", distance, maxRadius: fence.radius_m },
          { status: 403 },
        );
      }
      outOfRange = true;
    }
  }

  if (requirePhoto && !body.photo) {
    return NextResponse.json({ error: "photo_required" }, { status: 400 });
  }

  // Upload selfie (best-effort) to private storage.
  // Path per (hari, arah) + upsert: clock ulang di hari yang sama MENIMPA
  // foto sebelumnya, bukan menumpuk file yatim di storage.
  let photoPath: string | null = null;
  if (body.photo?.startsWith("data:image")) {
    try {
      const base64 = body.photo.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      const path = `${user.id}/${new Date().toISOString().slice(0, 10)}-${direction}${body.confirmOutOfRange ? "-oor" : ""}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("attendance-selfies")
        .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
      if (!upErr) photoPath = path;
    } catch {
      /* ignore upload failure */
    }
  }

  // Di luar area + minta konfirmasi → JANGAN tulis absensi. Simpan sebagai
  // pengajuan pending; HR menyetujui → absensi ditulis dengan waktu pengajuan.
  if (outOfRange) {
    if (!profile?.employee_id) return NextResponse.json({ error: "no_employee" }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);
    const { error: reqErr } = await supabase.from("clock_approval_requests").insert({
      employee_id: profile.employee_id,
      date: today,
      direction,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      distance_m: distance == null ? null : Math.round(distance),
      photo_path: photoPath,
      note: body.note?.trim() || null,
    });
    // 23505 = sudah ada pengajuan pending yang sama hari ini → idempoten, anggap terkirim.
    if (reqErr && reqErr.code !== "23505") {
      return NextResponse.json({ error: "request_failed" }, { status: 403 });
    }
    if (!reqErr && emp?.team) {
      await notifyApprovers(profile.employee_id, String(emp.team), {
        type: "attendance",
        title: `${emp.name ?? "Karyawan"} clock-${direction} di luar area`,
        body: `${formatDate(today)} · ${distance == null ? "" : `${Math.round(distance)} m dari lokasi · `}perlu konfirmasi Anda`,
        href: "/attendance",
      });
    }
    return NextResponse.json({ ok: true, pending: true, distance });
  }

  let recorded = false;
  if (profile?.employee_id) {
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    if (direction === "in") {
      // Pada hari libur tidak ada jadwal → tidak ada hitungan telat (status hadir).
      // Pada hari kerja, telat = selisih jam masuk vs jadwal mulai (WITA).
      const workStart = (emp?.work_start as string) ?? "08:00";
      const [ch, cm] = witaHHMM(new Date()).split(":").map(Number);
      const [sh, sm] = workStart.split(":").map(Number);
      const lateMinutes = isOffDay ? 0 : Math.max(0, ch * 60 + cm - (sh * 60 + sm));
      const choice = isOffDay && (body.offDayChoice === "swap" || body.offDayChoice === "overtime")
        ? body.offDayChoice
        : null;

      const { data: att, error } = await supabase
        .from("attendance")
        .upsert(
          {
            employee_id: profile.employee_id,
            date: today,
            clock_in: nowIso,
            status: lateMinutes > 0 ? "late" : "present",
            late_minutes: lateMinutes,
            off_day_choice: choice,
            source: "mobile",
            clock_in_lat: body.lat ?? null,
            clock_in_lng: body.lng ?? null,
            clock_in_distance_m: distance,
            clock_in_photo: photoPath,
          },
          { onConflict: "employee_id,date" },
        )
        .select("id")
        .maybeSingle();
      recorded = !error;

      // Hari libur + pilih TUKAR LIBUR → setoran tabungan pending (konfirmasi HR).
      // Pilih LEMBUR → dicatat di off_day_choice, request lembur dibuat saat clock-out.
      if (recorded && choice === "swap") {
        const { error: depErr } = await supabase.from("tabungan_libur_entries").insert({
          employee_id: profile.employee_id,
          kind: "deposit",
          days: 1,
          event_date: today,
          reason: "Kerja di hari libur — tukar jadi tabungan (konfirmasi HR)",
          source: "attendance",
          source_id: att?.id ?? null,
          status: "pending",
        });
        if (!depErr && emp?.team) {
          await notifyApprovers(profile.employee_id, String(emp.team), {
            type: "tabungan",
            title: "Kerja di hari libur — konfirmasi tabungan",
            body: `${formatDate(today)} · konfirmasi untuk kreditkan 1 hari tabungan libur`,
            href: "/shifts",
          });
        }
      }
    } else {
      // Baca dulu baris hari ini untuk tahu jam masuk & pilihan hari libur.
      const { data: row } = await supabase
        .from("attendance")
        .select("clock_in, off_day_choice")
        .eq("employee_id", profile.employee_id)
        .eq("date", today)
        .maybeSingle();

      // Menit lembur (informasi absensi) = selisih pulang vs jadwal selesai (WITA).
      const workEnd = (emp?.work_end as string) ?? "17:00";
      const [ch, cm] = witaHHMM(new Date()).split(":").map(Number);
      const [eh, em] = workEnd.split(":").map(Number);
      const overtimeMinutes = Math.max(0, ch * 60 + cm - (eh * 60 + em));

      const { error } = await supabase
        .from("attendance")
        .update({
          clock_out: nowIso,
          overtime_minutes: overtimeMinutes,
          clock_out_lat: body.lat ?? null,
          clock_out_lng: body.lng ?? null,
          clock_out_distance_m: distance,
          clock_out_photo: photoPath,
        })
        .eq("employee_id", profile.employee_id)
        .eq("date", today);
      recorded = !error;

      // Hari libur + pilih LEMBUR → buat pengajuan lembur dari seluruh durasi kerja.
      if (recorded && row?.off_day_choice === "overtime" && row.clock_in) {
        const start = witaHHMM(new Date(String(row.clock_in)));
        const end = witaHHMM(new Date(nowIso));
        const [a, b] = start.split(":").map(Number);
        const [c, d] = end.split(":").map(Number);
        const mins = c * 60 + d - (a * 60 + b);
        if (mins > 0) {
          // Hindari duplikat jika clock-out terjadi dua kali.
          const { data: existing } = await supabase
            .from("overtime_requests")
            .select("id")
            .eq("employee_id", profile.employee_id)
            .eq("date", today)
            .maybeSingle();
          if (!existing) {
            const hours = Math.round((mins / 60) * 100) / 100;
            const ratePerHour = Math.round((Number(emp?.base_salary) || 0) / OVERTIME_DIVISOR);
            await supabase.from("overtime_requests").insert({
              employee_id: profile.employee_id,
              date: today,
              start_time: start,
              end_time: end,
              hours,
              reason: "Kerja di hari libur (otomatis dari absensi)",
              rate_per_hour: ratePerHour,
              amount: Math.round(ratePerHour * hours),
              status: "pending",
              paid: false,
            });
            if (emp?.team) {
              await notifyApprovers(profile.employee_id, String(emp.team), {
                type: "overtime",
                title: `${emp.name ?? "Karyawan"} lembur di hari libur`,
                body: `${formatDate(today)} · ${hours} jam · perlu persetujuan Anda`,
                href: "/overtime",
              });
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, recorded, distance });
}

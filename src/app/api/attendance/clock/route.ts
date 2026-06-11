import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { distanceMeters } from "@/lib/geo";
import { notifyApprovers } from "@/lib/notify";
import { formatDate } from "@/lib/utils";

export const runtime = "nodejs";

/** WITA (Asia/Makassar) weekday short name for `when`, e.g. "Sun". */
function witaWeekday(when: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Makassar", weekday: "short" }).format(when);
}

interface Body {
  direction: "in" | "out";
  lat?: number;
  lng?: number;
  photo?: string; // data URL
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
  let emp: { work_start?: string | null; work_end?: string | null; team?: string | null } | null = null;
  if (profile?.employee_id) {
    const { data } = await supabase
      .from("employees")
      .select("work_start, work_end, team")
      .eq("id", profile.employee_id)
      .maybeSingle();
    emp = data;
  }

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
      return NextResponse.json(
        { error: "out_of_range", distance, maxRadius: fence.radius_m },
        { status: 403 },
      );
    }
  }

  if (requirePhoto && !body.photo) {
    return NextResponse.json({ error: "photo_required" }, { status: 400 });
  }

  // Upload selfie (best-effort) to private storage.
  let photoPath: string | null = null;
  if (body.photo?.startsWith("data:image")) {
    try {
      const base64 = body.photo.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      const path = `${user.id}/${Date.now()}-${direction}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("attendance-selfies")
        .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
      if (!upErr) photoPath = path;
    } catch {
      /* ignore upload failure */
    }
  }

  let recorded = false;
  if (profile?.employee_id) {
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    if (direction === "in") {
      // Derive late status against the employee's scheduled start (WITA).
      const workStart = (emp?.work_start as string) ?? "08:00";
      // Wall-clock HH:MM in WITA (Asia/Makassar = UTC+8) at clock-in moment.
      const witaHM = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Makassar",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      const [ch, cm] = witaHM.split(":").map(Number);
      const [sh, sm] = workStart.split(":").map(Number);
      const lateMinutes = Math.max(0, ch * 60 + cm - (sh * 60 + sm));

      const { data: att, error } = await supabase
        .from("attendance")
        .upsert(
          {
            employee_id: profile.employee_id,
            date: today,
            clock_in: nowIso,
            status: lateMinutes > 0 ? "late" : "present",
            late_minutes: lateMinutes,
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

      // Tabungan libur: clocking in on a rest day (weekend, WITA) earns a saved
      // day-off. We file it as a PENDING deposit and notify HR/the manager to
      // confirm the off-hours attendance — it only credits the bank once approved.
      const weekday = witaWeekday(new Date());
      const isRestDay = weekday === "Sat" || weekday === "Sun";
      if (recorded && isRestDay) {
        const { error: depErr } = await supabase.from("tabungan_libur_entries").insert({
          employee_id: profile.employee_id,
          kind: "deposit",
          days: 1,
          event_date: today,
          reason: "Kehadiran di hari libur — perlu konfirmasi HR",
          source: "attendance",
          source_id: att?.id ?? null,
          status: "pending",
        });
        // The partial unique index rejects a duplicate same-day deposit; that's fine.
        if (!depErr && emp?.team) {
          await notifyApprovers(profile.employee_id, String(emp.team), {
            type: "tabungan",
            title: "Kehadiran di hari libur — konfirmasi tabungan",
            body: `${formatDate(today)} · konfirmasi untuk kreditkan 1 hari tabungan libur`,
            href: "/shifts",
          });
        }
      }
    } else {
      // Menit lembur = selisih pulang vs jadwal selesai (WITA). INFORMASI
      // ABSENSI SAJA — lembur dibayar terpisah lewat modul Lembur, bukan payroll.
      const workEnd = (emp?.work_end as string) ?? "17:00";
      const witaHM = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Makassar",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      const [ch, cm] = witaHM.split(":").map(Number);
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
    }
  }

  return NextResponse.json({ ok: true, recorded, distance });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { distanceMeters } from "@/lib/geo";

export const runtime = "nodejs";

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

  // Settings + server-side geofence re-validation (never trust the client).
  const { data: s } = await supabase.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
  const settings = s ?? {
    office_lat: -8.409518, office_lng: 115.188919, max_radius_m: 50,
    require_photo: true, require_location: true,
  };

  let distance: number | null = null;
  if (settings.require_location) {
    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return NextResponse.json({ error: "location_required" }, { status: 400 });
    }
    distance = distanceMeters(body.lat, body.lng, settings.office_lat, settings.office_lng);
    if (distance > settings.max_radius_m) {
      return NextResponse.json(
        { error: "out_of_range", distance, maxRadius: settings.max_radius_m },
        { status: 403 },
      );
    }
  }

  if (settings.require_photo && !body.photo) {
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

  // Record against the linked employee (if any).
  const { data: profile } = await supabase
    .from("profiles")
    .select("employee_id")
    .eq("id", user.id)
    .maybeSingle();

  let recorded = false;
  if (profile?.employee_id) {
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    if (direction === "in") {
      // Derive late status against the employee's scheduled start (WITA).
      const { data: emp } = await supabase
        .from("employees")
        .select("work_start")
        .eq("id", profile.employee_id)
        .maybeSingle();
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

      const { error } = await supabase.from("attendance").upsert(
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
      );
      recorded = !error;
    } else {
      const { error } = await supabase
        .from("attendance")
        .update({
          clock_out: nowIso,
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

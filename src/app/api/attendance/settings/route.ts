import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: true, demo: true });
  }
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS enforces that only HR/admin can write. Global toggles → attendance_settings.
  const { error: toggleErr } = await supabase
    .from("attendance_settings")
    .update({
      require_photo: Boolean(b.requirePhoto),
      require_location: Boolean(b.requireLocation),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (toggleErr) {
    return NextResponse.json({ error: "forbidden_or_failed", detail: toggleErr.message }, { status: 403 });
  }

  // Per-division geofences → team_geofences (one row per team).
  const geofences = (b.geofences ?? {}) as Record<
    string,
    { label?: string; lat?: number; lng?: number; radiusM?: number }
  >;
  const rows = (["factory", "farm", "office"] as const)
    .filter((t) => geofences[t])
    .map((t) => ({
      team: t,
      label: String(geofences[t].label ?? ""),
      lat: Number(geofences[t].lat),
      lng: Number(geofences[t].lng),
      radius_m: Math.max(1, Math.round(Number(geofences[t].radiusM) || 50)),
      updated_at: new Date().toISOString(),
    }));
  if (rows.length) {
    const { error } = await supabase.from("team_geofences").upsert(rows, { onConflict: "team" });
    if (error) {
      return NextResponse.json({ error: "forbidden_or_failed", detail: error.message }, { status: 403 });
    }
  }
  return NextResponse.json({ ok: true });
}

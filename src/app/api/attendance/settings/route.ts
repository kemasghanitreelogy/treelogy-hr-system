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

  // RLS ("hr update settings") enforces that only HR/admin can write.
  const { error } = await supabase
    .from("attendance_settings")
    .update({
      office_label: String(b.officeLabel ?? "Treelogy Office"),
      office_lat: Number(b.officeLat),
      office_lng: Number(b.officeLng),
      max_radius_m: Math.max(1, Math.round(Number(b.maxRadiusM) || 50)),
      require_photo: Boolean(b.requirePhoto),
      require_location: Boolean(b.requireLocation),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: "forbidden_or_failed", detail: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

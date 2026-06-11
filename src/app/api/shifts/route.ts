import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapShift } from "@/lib/data";
import type { Team } from "@/lib/types";

export const runtime = "nodejs";

const TEAMS: Team[] = ["factory", "farm", "office"];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

interface ShiftPayload {
  id?: string;
  name?: string;
  team?: Team;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  overtimeAfter?: string;
  color?: string;
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

function validate(body: ShiftPayload, partial: boolean) {
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) return "name_required";
  }
  if (!partial || body.team !== undefined) {
    if (!body.team || !TEAMS.includes(body.team)) return "invalid_team";
  }
  for (const key of ["startTime", "endTime", "overtimeAfter"] as const) {
    if (!partial || body[key] !== undefined) {
      if (!body[key] || !HHMM.test(body[key]!)) return "invalid_time";
    }
  }
  if (body.color !== undefined && body.color && !HEX.test(body.color)) return "invalid_color";
  return null;
}

function toRow(body: ShiftPayload): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (body.name !== undefined) row.name = body.name.trim();
  if (body.team !== undefined) row.team = body.team;
  if (body.startTime !== undefined) row.start_time = body.startTime;
  if (body.endTime !== undefined) row.end_time = body.endTime;
  if (body.breakMinutes !== undefined) row.break_minutes = Math.max(0, Math.floor(Number(body.breakMinutes) || 0));
  if (body.overtimeAfter !== undefined) row.overtime_after = body.overtimeAfter;
  if (body.color !== undefined) row.color = body.color || "#3d5a2e";
  return row;
}

// ---- Create a shift ----
export async function POST(req: Request) {
  let body: ShiftPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const invalid = validate(body, false);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!.from("shifts").insert(toRow(body)).select("*").single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, shift: mapShift(data) });
}

// ---- Update a shift ----
export async function PATCH(req: Request) {
  let body: ShiftPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const invalid = validate(body, true);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const row = toRow(body);
  if (Object.keys(row).length === 0) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!
    .from("shifts")
    .update(row)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, shift: mapShift(data) });
}

// ---- Delete a shift (assignments cascade in the schema) ----
export async function DELETE(req: Request) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!
    .from("shifts")
    .delete()
    .eq("id", body.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapScheduleTemplate } from "@/lib/data";

export const runtime = "nodejs";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface Payload {
  id?: string;
  name?: string;
  workDays?: number[];
  workStart?: string;
  workEnd?: string;
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

function cleanDays(days: unknown): number[] | null {
  if (!Array.isArray(days)) return null;
  const set = [...new Set(days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  return set.length ? set : null;
}

function validate(body: Payload, partial: boolean): string | null {
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) return "name_required";
  }
  if (!partial || body.workDays !== undefined) {
    if (!cleanDays(body.workDays)) return "invalid_days";
  }
  for (const k of ["workStart", "workEnd"] as const) {
    if (!partial || body[k] !== undefined) {
      if (!body[k] || !HHMM.test(body[k]!)) return "invalid_time";
    }
  }
  return null;
}

function toRow(body: Payload): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (body.name !== undefined) row.name = body.name.trim();
  if (body.workDays !== undefined) row.work_days = cleanDays(body.workDays);
  if (body.workStart !== undefined) row.work_start = body.workStart;
  if (body.workEnd !== undefined) row.work_end = body.workEnd;
  return row;
}

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const invalid = validate(body, false);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!.from("schedule_templates").insert(toRow(body)).select("*").single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, template: mapScheduleTemplate(data) });
}

export async function PATCH(req: Request) {
  let body: Payload;
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

  const { data, error } = await supabase!.from("schedule_templates").update(row).eq("id", body.id).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, template: mapScheduleTemplate(data) });
}

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

  const { data, error } = await supabase!.from("schedule_templates").delete().eq("id", body.id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

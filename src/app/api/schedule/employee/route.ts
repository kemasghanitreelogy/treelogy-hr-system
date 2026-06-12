import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface Payload {
  /** Edit jadwal kustom satu karyawan. */
  employeeId?: string;
  workDays?: number[];
  workStart?: string;
  workEnd?: string;
  /** Terapkan template ke banyak karyawan sekaligus. */
  employeeIds?: string[];
  templateId?: string;
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

export async function PATCH(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // --- Mode 1: terapkan template ke banyak karyawan ---
  if (body.templateId && Array.isArray(body.employeeIds) && body.employeeIds.length > 0) {
    const { data: tpl } = await supabase!
      .from("schedule_templates")
      .select("work_days, work_start, work_end")
      .eq("id", body.templateId)
      .maybeSingle();
    if (!tpl) return NextResponse.json({ error: "template_not_found" }, { status: 404 });

    const { error } = await supabase!
      .from("employees")
      .update({
        work_days: tpl.work_days,
        work_start: tpl.work_start,
        work_end: tpl.work_end,
        schedule_template_id: body.templateId,
      })
      .in("id", body.employeeIds);
    if (error) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
    return NextResponse.json({ ok: true, applied: body.employeeIds.length });
  }

  // --- Mode 2: jadwal kustom satu karyawan ---
  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  const days = cleanDays(body.workDays);
  if (!days) return NextResponse.json({ error: "invalid_days" }, { status: 400 });
  if (!body.workStart || !HHMM.test(body.workStart) || !body.workEnd || !HHMM.test(body.workEnd)) {
    return NextResponse.json({ error: "invalid_time" }, { status: 400 });
  }

  const { error } = await supabase!
    .from("employees")
    .update({
      work_days: days,
      work_start: body.workStart,
      work_end: body.workEnd,
      schedule_template_id: null, // jadwal kustom → lepas dari template
    })
    .eq("id", body.employeeId);
  if (error) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

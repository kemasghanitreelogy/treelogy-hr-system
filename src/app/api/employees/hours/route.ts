import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * HR sets an employee's scheduled work hours (jam masuk / jam keluar).
 * Write is gated by RLS (`is_hr()` on the employees table), so a non-HR
 * session is rejected by Postgres even if it reaches here.
 */
export async function POST(req: Request) {
  let body: { id?: string; workStart?: string; workEnd?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { id, workStart, workEnd } = body;
  if (!id || !HHMM.test(workStart ?? "") || !HHMM.test(workEnd ?? "")) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("employees")
    .update({ work_start: workStart, work_end: workEnd })
    .eq("id", id)
    .select("id");

  // RLS silently filters non-HR writes to 0 rows (no error) — treat that as forbidden.
  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, id, workStart, workEnd });
}

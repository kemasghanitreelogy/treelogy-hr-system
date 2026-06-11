import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapAssignment } from "@/lib/data";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Payload {
  employeeId?: string;
  date?: string;
  /** Shift to assign; null/empty clears the assignment for that day. */
  shiftId?: string | null;
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

// ---- Upsert (or clear) one employee's shift for one date ----
export async function POST(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  if (!body.date || !ISO_DATE.test(body.date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Clearing: remove the row for that employee+date.
  if (!body.shiftId) {
    const { error } = await supabase!
      .from("shift_assignments")
      .delete()
      .eq("employee_id", body.employeeId)
      .eq("date", body.date);
    if (error) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
    return NextResponse.json({ ok: true, assignment: null });
  }

  const { data, error } = await supabase!
    .from("shift_assignments")
    .upsert(
      { employee_id: body.employeeId, shift_id: body.shiftId, date: body.date },
      { onConflict: "employee_id,date" },
    )
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, assignment: mapAssignment(data) });
}

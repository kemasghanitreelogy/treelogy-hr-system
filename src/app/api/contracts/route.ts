import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapContract } from "@/lib/data";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["probation", "pkwt", "pkwtt", "magang", "harian"];

async function auth() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase };
}

export async function POST(req: Request) {
  let body: { employeeId?: string; type?: string; startDate?: string; endDate?: string | null; status?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  if (!body.type || !TYPES.includes(body.type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  if (!body.startDate || !ISO_DATE.test(body.startDate)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (body.endDate && !ISO_DATE.test(body.endDate)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!
    .from("employee_contracts")
    .insert({
      employee_id: body.employeeId,
      type: body.type,
      start_date: body.startDate,
      end_date: body.endDate || null,
      status: body.status === "ended" ? "ended" : "active",
      note: body.note?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, contract: mapContract(data) });
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

  const { data, error } = await supabase!.from("employee_contracts").delete().eq("id", body.id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

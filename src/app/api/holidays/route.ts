import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapHoliday } from "@/lib/data";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["public", "religious"];
const RELIGIONS = ["islam", "kristen", "katolik", "hindu", "buddha", "konghucu"];

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
  let body: { date?: string; name?: string; type?: string; religion?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.date || !ISO_DATE.test(body.date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!body.type || !TYPES.includes(body.type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  const religion = body.type === "religious" ? body.religion : null;
  if (body.type === "religious" && (!religion || !RELIGIONS.includes(religion))) {
    return NextResponse.json({ error: "religion_required" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!
    .from("holidays")
    .insert({ date: body.date, name: body.name.trim(), type: body.type, religion })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, holiday: mapHoliday(data) });
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

  const { data, error } = await supabase!.from("holidays").delete().eq("id", body.id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

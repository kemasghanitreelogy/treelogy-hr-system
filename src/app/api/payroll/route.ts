import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapRun } from "@/lib/data";
import type { PayrollStatus } from "@/lib/types";

export const runtime = "nodejs";

// Catatan: lembur TIDAK pernah disentuh di sini — dibayar terpisah lewat
// modul Lembur, bukan lewat payroll run.

const STATUSES: PayrollStatus[] = ["draft", "processing", "approved", "paid"];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function auth() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase };
}

// ---- Create (or return) the run for a period ----
export async function POST(req: Request) {
  let body: { period?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.period || !PERIOD_RE.test(body.period)) {
    return NextResponse.json({ error: "invalid_period" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Idempotent: a period has at most one run (unique constraint).
  const { data: existing } = await supabase!
    .from("payroll_runs")
    .select("*")
    .eq("period", body.period)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, run: mapRun(existing) });

  const { count } = await supabase!
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { data, error } = await supabase!
    .from("payroll_runs")
    .insert({ period: body.period, status: "draft", employee_count: count ?? 0 })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, run: mapRun(data) });
}

// ---- Move a run through draft → approved → paid ----
export async function PATCH(req: Request) {
  let body: { id?: string; status?: PayrollStatus };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (!body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const update: Record<string, unknown> = {
    status: body.status,
    paid_at: body.status === "paid" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase!
    .from("payroll_runs")
    .update(update)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, run: mapRun(data) });
}

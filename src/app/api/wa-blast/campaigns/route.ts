import { NextResponse } from "next/server";
import { createCampaign, parseCreateInput } from "@/lib/qontak/campaigns";
import { countsFor, emptyCounts } from "@/lib/qontak/counts";
import { guard, qontakFailure } from "../guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Riwayat kampanye + hitungan per status. */
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const { data: camps, error } = await g.db
    .from("wa_campaigns")
    .select("id, name, source, template_name, status, stop_reason, created_by_name, created_at, started_at, finished_at")
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: "load_failed" }, { status: 500 });
  const ids = (camps ?? []).map((c) => c.id);
  const counts = await countsFor(g.db, ids);
  return NextResponse.json({ campaigns: (camps ?? []).map((c) => ({ ...c, counts: counts.get(c.id) ?? emptyCounts() })) });
}

/** Buat kampanye DRAFT dari daftar penerima — belum ada yang dikirim. */
export async function POST(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;
  const input = parseCreateInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const r = await createCampaign(g.db, input, { id: g.me.id, name: g.me.name });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r.result);
  } catch (e) {
    return qontakFailure(e);
  }
}

import { NextResponse, after } from "next/server";
import { runDrain } from "@/lib/qontak/store";
import { guard } from "../../../guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Konfirmasi kirim. Idempoten: kampanye yang sudah berjalan tidak dimulai
 * dua kali (klik ganda, dua tab). Pengurasan antrean dimulai SEGERA lewat
 * after() — respons kembali ke layar dulu, worker jalan di belakangnya, dan
 * pg_cron melanjutkan tiap menit sampai antrean habis walau tab ditutup.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { id } = await params;

  const { count } = await g.db.from("wa_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "queued");
  const { data: started } = await g.db
    .from("wa_campaigns")
    .update({ status: "sending", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (!started?.length) {
    const { data: camp } = await g.db.from("wa_campaigns").select("status").eq("id", id).maybeSingle();
    if (!camp) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, already: camp.status });
  }
  if (!count) {
    // Semua penerima dilewati (resi sudah pernah dikirimi) — tutup langsung.
    await g.db.from("wa_campaigns").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, queued: 0 });
  }

  after(() => runDrain(50_000));
  return NextResponse.json({ ok: true, queued: count });
}

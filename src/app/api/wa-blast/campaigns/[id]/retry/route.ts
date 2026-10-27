import { NextResponse, after } from "next/server";
import { runDrain } from "@/lib/qontak/store";
import { guard } from "../../../guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Kirim ulang yang gagal — keputusan MANUSIA, bukan otomatis. Termasuk
 * 'unknown' (worker terputus / timeout: pesannya mungkin sudah sampai, maka
 * hanya dikirim ulang atas perintah orang yang sudah menimbangnya) dan pesan
 * yang ditolak WhatsApp saat pengiriman.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { id } = await params;
  const { data: camp } = await g.db.from("wa_campaigns").select("status").eq("id", id).maybeSingle();
  if (!camp) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (camp.status === "draft" || camp.status === "cancelled") return NextResponse.json({ error: "not_running" }, { status: 409 });

  const reset = { status: "queued", attempts: 0, next_attempt_at: null, last_error: null, delivery_status: null, delivery_error: null, delivery_checked_at: null, qontak_ref: null, sent_at: null };
  const { data: a } = await g.db.from("wa_campaign_recipients").update(reset).eq("campaign_id", id).in("status", ["failed", "unknown"]).select("id");
  const { data: b } = await g.db.from("wa_campaign_recipients").update(reset).eq("campaign_id", id).eq("status", "sent").eq("delivery_status", "failed").select("id");
  const n = (a?.length ?? 0) + (b?.length ?? 0);
  // Kampanye yang berhenti karena kredensial juga dilanjutkan dari sini.
  const { count: open } = await g.db.from("wa_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "queued");
  if (!open) return NextResponse.json({ ok: true, requeued: 0 });

  await g.db.from("wa_campaigns").update({ status: "sending", stop_reason: null, finished_at: null }).eq("id", id);
  after(() => runDrain(50_000));
  return NextResponse.json({ ok: true, requeued: n || open });
}

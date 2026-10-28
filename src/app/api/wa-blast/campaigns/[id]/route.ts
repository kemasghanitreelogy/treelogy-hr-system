import { NextResponse } from "next/server";
import { countsFor, emptyCounts } from "@/lib/qontak/counts";
import { CONFIRM_WINDOW_MS, deliveryState, FINAL_DELIVERY, RETRYABLE } from "@/lib/qontak/delivery";
import { guard } from "../../guard";

export const runtime = "nodejs";

const COLS = "id, seq, phone, name, awb, vals, status, last_error, attempts, sent_at, delivery_status, delivery_error";

/**
 * Detail kampanye. `?full=1` memuat SEMUA penerima (untuk pratinjau sebelum
 * kirim); tanpa itu hanya hitungan + aktivitas terakhir + yang bermasalah —
 * ringan untuk dipoll tiap 2 detik selama antrean berjalan.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { id } = await params;
  const full = new URL(req.url).searchParams.get("full") === "1";

  const { data: camp } = await g.db.from("wa_campaigns").select("*").eq("id", id).maybeSingle();
  if (!camp) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const counts = (await countsFor(g.db, [id])).get(id) ?? emptyCounts();

  if (full) {
    const recipients: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id).order("seq").range(from, from + 999);
      recipients.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return NextResponse.json({ campaign: camp, counts, recipients });
  }

  const lewat = new Date(Date.now() - CONFIRM_WINDOW_MS).toISOString();
  const [{ data: recent }, { data: bad }, { data: silent }] = await Promise.all([
    g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id).not("last_attempt_at", "is", null)
      .order("last_attempt_at", { ascending: false }).limit(12),
    g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id)
      .or("status.in.(failed,unknown),delivery_status.eq.failed").order("seq").limit(300),
    // Diterima Qontak tapi tidak pernah dikonfirmasi WhatsApp dalam 48 jam.
    g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id).eq("status", "sent").lt("sent_at", lewat)
      .or(`delivery_status.is.null,delivery_status.not.in.(${FINAL_DELIVERY.join(",")})`).order("seq").limit(300),
  ]);
  const problems = [...(bad ?? []), ...(silent ?? [])]
    .filter((r) => RETRYABLE.includes(deliveryState(r)))
    .sort((a, b) => a.seq - b.seq);
  return NextResponse.json({ campaign: camp, counts, recent: recent ?? [], problems });
}

/** Batalkan. Draft dihapus; kampanye berjalan: sisa antrean dilewati
 *  (yang sudah dalam perjalanan tetap dicatat hasilnya). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { id } = await params;
  const { data: camp } = await g.db.from("wa_campaigns").select("status").eq("id", id).maybeSingle();
  if (!camp) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (camp.status === "draft") {
    await g.db.from("wa_campaigns").delete().eq("id", id);
    return NextResponse.json({ ok: true, deleted: true });
  }
  if (camp.status !== "sending") return NextResponse.json({ error: "not_running" }, { status: 409 });
  await g.db.from("wa_campaign_recipients").update({ status: "skipped", last_error: "cancelled" }).eq("campaign_id", id).eq("status", "queued");
  await g.db.from("wa_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}

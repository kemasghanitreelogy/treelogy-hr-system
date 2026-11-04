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
  // Sedikit lewat jadwal tetap dikirim balik: layar menampilkan "Mengirim…"
  // sampai worker benar-benar membuat broadcast-nya (tick cron ≤ 1 menit).
  const waitFloor = new Date(Date.now() - 90_000).toISOString();
  const [{ data: recent }, { data: bad }, { data: silent }, { data: waiting }, { data: pending }] = await Promise.all([
    g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id).not("last_attempt_at", "is", null)
      .order("last_attempt_at", { ascending: false }).limit(12),
    g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id)
      .or("status.in.(failed,unknown),delivery_status.eq.failed").order("seq").limit(300),
    // Diterima Qontak tapi tidak pernah dikonfirmasi WhatsApp dalam 48 jam.
    g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id).eq("status", "sent").lt("sent_at", lewat)
      .or(`delivery_status.is.null,delivery_status.not.in.(${FINAL_DELIVERY.join(",")})`).order("seq").limit(300),
    // Antre jatah broadcast bulk Qontak (lihat lib/qontak/bulk.ts) — untuk hitung mundur.
    g.db.from("wa_campaign_recipients").select("next_attempt_at").eq("campaign_id", id).eq("status", "queued")
      .like("last_error", "rate_wait%").gt("next_attempt_at", waitFloor).order("next_attempt_at", { ascending: false }).limit(1),
    // Diterima Qontak, laporan sampai/tidaknya belum datang — selalu tampil
    // di atas daftar aktivitas, walau dikirim lebih awal dari 12 terakhir.
    g.db.from("wa_campaign_recipients").select(COLS).eq("campaign_id", id).eq("status", "sent").gte("sent_at", lewat)
      .or(`delivery_status.is.null,delivery_status.not.in.(${FINAL_DELIVERY.join(",")})`).order("seq").limit(100),
  ]);
  // Jeda dihitung dari broadcast terakhir yang diterima Qontak — itulah awal progress bar.
  let bulkWait: { until: string; from: string | null } | null = null;
  const until = waiting?.[0]?.next_attempt_at as string | undefined;
  if (until) {
    const { data: last } = await g.db.from("wa_campaign_recipients").select("sent_at").eq("status", "sent")
      .lte("sent_at", until).gt("sent_at", new Date(+new Date(until) - 10 * 60_000).toISOString())
      .order("sent_at", { ascending: false }).limit(1);
    bulkWait = { until, from: (last?.[0]?.sent_at as string | undefined) ?? null };
  }
  const problems = [...(bad ?? []), ...(silent ?? [])]
    .filter((r) => RETRYABLE.includes(deliveryState(r)))
    .sort((a, b) => a.seq - b.seq);
  return NextResponse.json({ campaign: camp, counts, recent: recent ?? [], problems, bulkWait, pending: pending ?? [] });
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

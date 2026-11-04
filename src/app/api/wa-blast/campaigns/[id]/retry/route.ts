import { NextResponse, after } from "next/server";
import { RESEND_GUARD_DAYS } from "@/lib/qontak/campaigns";
import { deliveryState, RETRYABLE } from "@/lib/qontak/delivery";
import { runDrain } from "@/lib/qontak/store";
import { guard } from "../../../guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Kirim ulang — keputusan MANUSIA, bukan otomatis. Yang boleh: gagal,
 * 'unknown' (koneksi putus saat mengirim — mungkin sudah sampai), ditolak
 * WhatsApp, dan yang tidak pernah terkonfirmasi dalam 48 jam. Pesan yang
 * terbukti sampai / dibaca, atau masih menunggu laporan, TIDAK pernah ikut.
 *
 * Body opsional `{ ids: string[] }` = kirim ulang penerima tertentu saja.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const only = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : null;

  if (only && !only.length) return NextResponse.json({ ok: true, requeued: 0 });

  const { data: camp } = await g.db.from("wa_campaigns").select("status").eq("id", id).maybeSingle();
  if (!camp) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Kampanye yang dihentikan tetap boleh: yang gagal sebelum dihentikan
  // masih bisa dikirim ulang (sisa antrean yang dibatalkan tidak ikut).
  if (camp.status === "draft") return NextResponse.json({ error: "not_running" }, { status: 409 });

  // Status dinilai ulang di server dengan aturan yang sama dengan layar —
  // klien tidak bisa memaksa kirim ulang pesan yang sudah sampai.
  const pick: string[] = [];
  const awbOf = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    let q = g.db.from("wa_campaign_recipients").select("id, awb, status, delivery_status, sent_at")
      .eq("campaign_id", id).in("status", ["failed", "unknown", "sent"]).order("id").range(from, from + 999);
    if (only) q = q.in("id", only);
    const { data } = await q;
    for (const r of data ?? []) if (RETRYABLE.includes(deliveryState(r))) pick.push(r.id), awbOf.set(r.id, r.awb);
    if (!data || data.length < 1000) break;
  }

  // Penjaga pesan ganda PER RESI (bukan per nomor — satu nomor bisa punya
  // beberapa order): resi yang sudah terkirim lewat kampanye lain dalam
  // 14 hari dilewati, sama seperti saat kampanye dibuat. Contoh nyata: Lion
  // yang gagal karena jatah Qontak lalu dikirim lewat blast baru — tombol
  // kirim ulang di kampanye lama tidak boleh mengirimnya dua kali.
  const since = new Date(Date.now() - RESEND_GUARD_DAYS * 86400_000).toISOString();
  const awbs = [...new Set([...awbOf.values()].filter(Boolean))];
  const sentAt = new Map<string, string>();
  for (let i = 0; i < awbs.length; i += 200) {
    const { data } = await g.db.from("wa_campaign_recipients").select("awb, sent_at, delivery_status")
      .neq("campaign_id", id).eq("status", "sent").gte("sent_at", since).in("awb", awbs.slice(i, i + 200));
    for (const d of data ?? []) if (d.delivery_status !== "failed") sentAt.set(d.awb as string, d.sent_at as string);
  }
  const dupes = pick.filter((rid) => sentAt.has(awbOf.get(rid) ?? ""));
  for (const rid of dupes) {
    await g.db.from("wa_campaign_recipients")
      .update({ status: "skipped", last_error: `already_sent:${sentAt.get(awbOf.get(rid)!)}` }).eq("id", rid);
  }
  if (dupes.length) pick.splice(0, pick.length, ...pick.filter((rid) => !dupes.includes(rid)));

  const reset = { status: "queued", attempts: 0, next_attempt_at: null, last_error: null, delivery_status: null, delivery_error: null, delivery_checked_at: null, qontak_ref: null, sent_at: null, bulk_list_id: null };
  let n = 0;
  for (let i = 0; i < pick.length; i += 200) {
    const { data } = await g.db.from("wa_campaign_recipients").update(reset).in("id", pick.slice(i, i + 200)).select("id");
    n += data?.length ?? 0;
  }
  // Kampanye yang berhenti karena kredensial juga dilanjutkan dari sini.
  const { count: open } = await g.db.from("wa_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "queued");
  if (!open) return NextResponse.json({ ok: true, requeued: 0 });

  await g.db.from("wa_campaigns").update({ status: "sending", stop_reason: null, finished_at: null, bulk_list_id: null }).eq("id", id);
  after(() => runDrain(50_000));
  return NextResponse.json({ ok: true, requeued: n || open });
}

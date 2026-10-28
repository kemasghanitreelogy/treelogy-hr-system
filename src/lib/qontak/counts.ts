import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliveryState } from "./delivery";

export interface CampaignCounts {
  total: number;
  queued: number;
  sending: number;
  /** Diterima Qontak (201) — BUKAN berarti sampai. */
  sent: number;
  failed: number;
  skipped: number;
  unknown: number;
  /** Status dari WhatsApp (bukan sekadar diterima Qontak). */
  delivered: number;
  read: number;
  undelivered: number;
  /** Diterima Qontak, laporan WhatsApp belum datang (masih dicek). */
  awaiting: number;
  /** Lewat 48 jam tanpa laporan akhir — tidak pernah terkonfirmasi. */
  unconfirmed: number;
}

export function emptyCounts(): CampaignCounts {
  return { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, unknown: 0, delivered: 0, read: 0, undelivered: 0, awaiting: 0, unconfirmed: 0 };
}

const STATUS_KEYS = ["queued", "sending", "sent", "failed", "skipped", "unknown"] as const;

/** Hitungan per status untuk sekumpulan kampanye. Dibaca per 1.000 baris —
 *  PostgREST memotong diam-diam di 1.000 (lihat kueri bertarget). */
export async function countsFor(db: SupabaseClient, ids: string[]): Promise<Map<string, CampaignCounts>> {
  const out = new Map<string, CampaignCounts>();
  if (!ids.length) return out;
  const now = Date.now();
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("wa_campaign_recipients")
      .select("campaign_id, status, delivery_status, sent_at")
      .in("campaign_id", ids)
      .order("id")
      .range(from, from + 999);
    for (const r of data ?? []) {
      const c = out.get(r.campaign_id) ?? emptyCounts();
      c.total++;
      const s = r.status as (typeof STATUS_KEYS)[number];
      if (STATUS_KEYS.includes(s)) c[s]++;
      switch (deliveryState(r, now)) {
        case "read": c.read++; c.delivered++; break;
        case "delivered": c.delivered++; break;
        case "undelivered": c.undelivered++; break;
        case "unconfirmed": c.unconfirmed++; break;
        case "accepted": case "sent_wa": c.awaiting++; break;
      }
      out.set(r.campaign_id, c);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

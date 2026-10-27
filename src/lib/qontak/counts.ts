import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CampaignCounts {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  unknown: number;
  /** Status dari WhatsApp (bukan sekadar diterima Qontak). */
  delivered: number;
  read: number;
  undelivered: number;
}

export function emptyCounts(): CampaignCounts {
  return { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, unknown: 0, delivered: 0, read: 0, undelivered: 0 };
}

const STATUS_KEYS = ["queued", "sending", "sent", "failed", "skipped", "unknown"] as const;

/** Hitungan per status untuk sekumpulan kampanye. Dibaca per 1.000 baris —
 *  PostgREST memotong diam-diam di 1.000 (lihat kueri bertarget). */
export async function countsFor(db: SupabaseClient, ids: string[]): Promise<Map<string, CampaignCounts>> {
  const out = new Map<string, CampaignCounts>();
  if (!ids.length) return out;
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("wa_campaign_recipients")
      .select("campaign_id, status, delivery_status")
      .in("campaign_id", ids)
      .order("id")
      .range(from, from + 999);
    for (const r of data ?? []) {
      const c = out.get(r.campaign_id) ?? emptyCounts();
      c.total++;
      const s = r.status as (typeof STATUS_KEYS)[number];
      if (STATUS_KEYS.includes(s)) c[s]++;
      if (r.delivery_status === "delivered") c.delivered++;
      if (r.delivery_status === "read") { c.read++; c.delivered++; }
      if (r.delivery_status === "failed") c.undelivered++;
      out.set(r.campaign_id, c);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { QontakError, getBroadcastLog, sendDirect } from "./client";
import { drainBulk } from "./bulk";
import { CONFIRM_WINDOW_MS, FINAL_DELIVERY } from "./delivery";
import { drainDirect, PER_MINUTE, type CampaignInfo, type DrainResult, type DrainStore, type QueueRow, type SendError } from "./engine";

/** DrainStore di atas Supabase (service role) — RPC dari migrasi 0087. */
export function supabaseDrainStore(db: SupabaseClient): DrainStore {
  const must = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    async acquire(holder, seconds) {
      return Boolean(must(await db.rpc("acquire_wa_lease", { p_holder: holder, p_seconds: seconds })));
    },
    async release(holder) {
      await db.rpc("release_wa_lease", { p_holder: holder });
    },
    async budget(perMinute) {
      return Number(must(await db.rpc("wa_rate_budget", { p_per_minute: perMinute })) ?? 0);
    },
    async claim(limit) {
      return (must(await db.rpc("claim_wa_recipients", { p_limit: limit })) ?? []) as QueueRow[];
    },
    async campaigns(ids) {
      const rows = must(
        await db.from("wa_campaigns").select("id, name, template_id, channel_integration_id, language").in("id", ids),
      ) as (CampaignInfo & { id: string })[];
      return new Map(rows.map((r) => [r.id, r]));
    },
    async markSent(id, ref) {
      must(await db.from("wa_campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), qontak_ref: ref, last_error: null }).eq("id", id));
    },
    async requeue(id, nextAttemptAt, error, refund) {
      const { data } = await db.from("wa_campaign_recipients").select("attempts").eq("id", id).maybeSingle();
      const patch: Record<string, unknown> = {
        status: "queued",
        next_attempt_at: nextAttemptAt ? nextAttemptAt.toISOString() : null,
        last_error: error,
      };
      if (refund) patch.attempts = Math.max(0, Number(data?.attempts ?? 1) - 1);
      // Tidak pernah dikirim (waktu worker habis / kampanye berhenti) → jangan
      // ikut dihitung di anggaran rate 60 detik.
      if (error === null) patch.last_attempt_at = null;
      must(await db.from("wa_campaign_recipients").update(patch).eq("id", id));
    },
    async markFailed(id, status, error) {
      must(await db.from("wa_campaign_recipients").update({ status, last_error: error.slice(0, 500) }).eq("id", id));
    },
    async stopCampaign(campaignId, reason) {
      must(await db.from("wa_campaigns").update({ status: "failed", stop_reason: reason.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", campaignId));
    },
    async finalize() {
      must(await db.rpc("finalize_wa_campaigns"));
    },
  };
}

export function toSendError(e: unknown): SendError {
  if (e instanceof QontakError) return { code: e.code, status: e.status, message: e.message, retryAfterMs: e.retryAfterMs };
  return { code: "upstream", status: 0, message: e instanceof Error ? e.message : String(e), retryAfterMs: null };
}

/**
 * Tanyakan status pengiriman pesan yang sudah diterima Qontak.
 *
 * Satu broadcast (`qontak_ref`) = satu log Qontak berisi status per nomor:
 * jalur direct punya satu nomor per broadcast, jalur bulk banyak. Log dibaca
 * sekali per broadcast lalu dicocokkan ke penerima lewat nomornya.
 *
 * Memakai anggaran rate yang SAMA dengan kiriman dan hanya bila masih ada
 * sisa — sinkronisasi status tidak boleh merebut kuota blast yang sedang
 * berjalan. Pesan yang belum final ditanya ulang paling cepat tiap 30 detik,
 * dan berhenti ditanya setelah 48 jam.
 */
export async function syncDelivery(db: SupabaseClient, limit = 10): Promise<number> {
  const { data: budget } = await db.rpc("wa_rate_budget", { p_per_minute: PER_MINUTE });
  const n = Math.min(limit, Number(budget ?? 0) - 5);
  if (n <= 0) return 0;
  const since = new Date(Date.now() - CONFIRM_WINDOW_MS).toISOString();
  const recheck = Date.now() - 30_000;
  const open = `delivery_status.is.null,delivery_status.not.in.(${FINAL_DELIVERY.join(",")})`;
  const { data: rows } = await db
    .from("wa_campaign_recipients")
    .select("qontak_ref, delivery_checked_at")
    .eq("status", "sent")
    .not("qontak_ref", "is", null)
    .gte("sent_at", since)
    .or(open)
    .order("delivery_checked_at", { ascending: true, nullsFirst: true })
    .limit(n * 20);
  const refs: string[] = [];
  for (const r of rows ?? []) {
    if (r.delivery_checked_at && +new Date(r.delivery_checked_at) >= recheck) continue;
    if (!refs.includes(r.qontak_ref as string)) refs.push(r.qontak_ref as string);
    if (refs.length >= n) break;
  }
  let done = 0;
  for (const ref of refs) {
    const { data: members } = await db
      .from("wa_campaign_recipients")
      .select("id, phone")
      .eq("qontak_ref", ref)
      .eq("status", "sent")
      .or(open);
    if (!members?.length) continue;
    const checkedAt = new Date().toISOString();
    try {
      const log = await getBroadcastLog(ref);
      const byPhone = new Map(log.map((l) => [l.phone, l]));
      // Kelompokkan per hasil → satu UPDATE per kelompok, bukan per penerima.
      const groups = new Map<string, { patch: Record<string, unknown>; ids: string[] }>();
      for (const m of members) {
        const e = byPhone.get(m.phone) ?? (log.length === 1 && members.length === 1 ? log[0] : null);
        const status = e?.status ?? "pending";
        const key = `${status}|${e?.error ?? ""}`;
        const g = groups.get(key) ?? { patch: { delivery_status: status, delivery_error: e?.error ?? null, delivery_checked_at: checkedAt }, ids: [] };
        g.ids.push(m.id);
        groups.set(key, g);
        if (FINAL_DELIVERY.includes(status)) done++;
      }
      for (const g of groups.values()) {
        for (let i = 0; i < g.ids.length; i += 200) await db.from("wa_campaign_recipients").update(g.patch).in("id", g.ids.slice(i, i + 200));
      }
    } catch (e) {
      if (e instanceof QontakError && e.code === "rate_limited") break;
      await db.from("wa_campaign_recipients").update({ delivery_checked_at: checkedAt }).in("id", members.map((m) => m.id));
    }
  }
  return done;
}

/** Kuras antrean selama `deadlineMs`. Aman dipanggil bersamaan — lease menjamin satu worker. */
export async function runDrain(deadlineMs: number): Promise<DrainResult | { error: string }> {
  const db = createAdminClient();
  if (!db) return { error: "unavailable" };
  const started = Date.now();
  // Kampanye bulk dulu: beberapa request saja per kampanye, selesai cepat.
  const bulk = await drainBulk(db, deadlineMs).catch((e) => {
    console.error("[wa-bulk]", e);
    return { sent: 0 };
  });
  const res = await drainDirect(Math.max(5_000, deadlineMs - (Date.now() - started)), {
    store: supabaseDrainStore(db),
    toError: toSendError,
    send: (row, c) =>
      sendDirect({
        to_number: row.phone,
        to_name: row.name || row.phone,
        message_template_id: c.template_id,
        channel_integration_id: c.channel_integration_id,
        language: { code: c.language },
        parameters: row.params ?? {},
        name: c.name,
      }),
  });
  if (!res.busy) await syncDelivery(db).catch(() => 0);
  return { ...res, sent: res.sent + bulk.sent };
}

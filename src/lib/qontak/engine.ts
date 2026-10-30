/**
 * Mesin kirim "direct" — menguras antrean wa_campaign_recipients dengan
 * menghormati batas Qontak 60 request/menit per akun.
 *
 * Logika antrean dipisah dari penyimpanannya (`DrainStore`) supaya bisa diuji
 * tanpa database dan tanpa Qontak sungguhan (scripts/qa-wa-blast-engine.mts).
 *
 * Aturan yang tidak boleh dilonggarkan:
 *  • 55/menit, bukan 60 — margin untuk jam yang tidak sinkron dan request lain
 *    (daftar template, dsb.) yang juga makan kuota yang sama.
 *  • Request DILEPAS berjarak tetap (±1,1 dtk) dan boleh berjalan bersamaan
 *    (≤ MAX_INFLIGHT). Itulah "paralel" yang aman: tidak menunggu satu
 *    respons untuk melepas yang berikutnya, tapi juga tidak pernah meledak
 *    melewati burst 10/detik.
 *  • Hasil yang TIDAK PASTI (timeout jaringan) → 'unknown', tidak diulang
 *    otomatis. Pesannya bisa saja sudah sampai; mengirim dua kali ke pelanggan
 *    lebih buruk daripada meminta manusia menekan "Coba lagi".
 */

export const PER_MINUTE = 55;
const SPACING_MS = Math.ceil(60_000 / PER_MINUTE);
const MAX_INFLIGHT = 5;
const CLAIM_BATCH = 5;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [15_000, 60_000, 180_000];

export interface QueueRow {
  id: string;
  campaign_id: string;
  phone: string;
  name: string;
  params: unknown;
  attempts: number;
}

export interface CampaignInfo {
  template_id: string;
  channel_integration_id: string;
  language: string;
  /** Nama kampanye — dikirim sebagai `name` broadcast supaya semua pesan satu
   *  kampanye berlabel sama di dashboard Qontak. */
  name?: string;
}

export interface SendError {
  code: string;
  status: number;
  message: string;
  retryAfterMs: number | null;
}

export interface DrainStore {
  acquire(holder: string, seconds: number): Promise<boolean>;
  release(holder: string): Promise<void>;
  budget(perMinute: number): Promise<number>;
  claim(limit: number): Promise<QueueRow[]>;
  campaigns(ids: string[]): Promise<Map<string, CampaignInfo>>;
  markSent(id: string, ref: string | null): Promise<void>;
  /** Kembali ke antrean. `refund` = percobaan ini tidak dihitung (429, waktu habis). */
  requeue(id: string, nextAttemptAt: Date | null, error: string | null, refund: boolean): Promise<void>;
  markFailed(id: string, status: "failed" | "unknown", error: string): Promise<void>;
  stopCampaign(campaignId: string, reason: string): Promise<void>;
  finalize(): Promise<void>;
}

export type Sender = (row: QueueRow, c: CampaignInfo) => Promise<string | null>;

export interface DrainResult {
  busy?: boolean;
  sent: number;
  failed: number;
  retried: number;
}

export interface DrainDeps {
  store: DrainStore;
  send: Sender;
  /** Ubah QontakError → SendError. */
  toError: (e: unknown) => SendError;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function drainDirect(deadlineMs: number, deps: DrainDeps): Promise<DrainResult> {
  const { store, send, toError } = deps;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const start = now();
  const endAt = start + deadlineMs;
  const holder = `w-${start}-${Math.random().toString(36).slice(2, 8)}`;
  const result: DrainResult = { sent: 0, failed: 0, retried: 0 };

  if (!(await store.acquire(holder, Math.ceil(deadlineMs / 1000) + 20))) return { ...result, busy: true };

  const inflight = new Set<Promise<void>>();
  const stopped = new Set<string>();
  const campaignCache = new Map<string, CampaignInfo>();
  let nextAt = now();
  let halt = false;

  const sendOne = async (row: QueueRow, c: CampaignInfo) => {
    try {
      const ref = await send(row, c);
      await store.markSent(row.id, ref);
      result.sent++;
    } catch (e) {
      const err = toError(e);
      if (err.code === "rate_limited") {
        // Kuota habis lebih cepat dari hitungan kita (request lain di akun
        // yang sama). Mundur sesuai petunjuk server, jangan menebak.
        const wait = err.retryAfterMs ?? 60_000;
        nextAt = Math.max(nextAt, now() + wait);
        await store.requeue(row.id, new Date(now() + wait), "rate_limited", true);
        result.retried++;
      } else if (err.code === "unauthorized" || err.code === "scope_missing" || err.code === "not_configured") {
        // Bukan salah baris ini — seluruh kampanye berhenti, barisnya tetap
        // di antrean untuk dilanjutkan setelah kredensial dibereskan.
        await store.requeue(row.id, null, null, true);
        if (!stopped.has(row.campaign_id)) {
          stopped.add(row.campaign_id);
          await store.stopCampaign(row.campaign_id, `${err.code}: ${err.message}`);
        }
        halt = true;
      } else if (err.code === "network") {
        await store.markFailed(row.id, "unknown", `network: ${err.message}`);
        result.failed++;
      } else if (err.code === "upstream" && row.attempts < MAX_ATTEMPTS) {
        const wait = BACKOFF_MS[Math.min(row.attempts - 1, BACKOFF_MS.length - 1)];
        await store.requeue(row.id, new Date(now() + wait), `${err.status}: ${err.message}`, false);
        result.retried++;
      } else {
        await store.markFailed(row.id, "failed", err.message || err.code);
        result.failed++;
      }
    }
  };

  try {
    outer: while (!halt && now() < endAt - SPACING_MS) {
      const budget = await store.budget(PER_MINUTE);
      if (budget <= 0) {
        await sleep(Math.min(3_000, Math.max(0, endAt - now())));
        continue;
      }
      const rows = await store.claim(Math.min(budget, CLAIM_BATCH));
      if (!rows.length) {
        if (!inflight.size) break;
        await Promise.race(inflight);
        continue;
      }

      const missing = [...new Set(rows.map((r) => r.campaign_id))].filter((id) => !campaignCache.has(id));
      if (missing.length) for (const [id, c] of await store.campaigns(missing)) campaignCache.set(id, c);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const c = campaignCache.get(row.campaign_id);
        // Waktu habis / dihentikan: baris yang sudah diklaim dikembalikan
        // utuh, pemanggilan worker berikutnya yang melanjutkan.
        const late = Math.max(nextAt, now()) > endAt - SPACING_MS;
        if (halt || late || !c || stopped.has(row.campaign_id)) {
          for (const r of rows.slice(i)) await store.requeue(r.id, null, null, true);
          if (late) break outer;
          break;
        }
        const wait = nextAt - now();
        if (wait > 0) await sleep(wait);
        nextAt = Math.max(nextAt, now()) + SPACING_MS;

        const p = sendOne(row, c).finally(() => inflight.delete(p));
        inflight.add(p);
        if (inflight.size >= MAX_INFLIGHT) await Promise.race(inflight);
      }
    }
    await Promise.all(inflight);
    await store.finalize();
  } finally {
    await store.release(holder);
  }
  return result;
}

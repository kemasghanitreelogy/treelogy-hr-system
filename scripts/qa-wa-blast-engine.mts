#!/usr/bin/env node --experimental-strip-types
/**
 * Penjaga mesin blast WhatsApp (src/lib/qontak/engine.ts).
 *
 * Qontak membatasi jalur direct 60 request/menit PER AKUN. Uji ini menjalankan
 * mesin sungguhan di atas store memori yang meniru semantik DB (anggaran 60
 * detik, klaim, lease) dan jam virtual, lalu memastikan:
 *  • tidak ada jendela 60 detik mana pun yang melewati 55 request,
 *  • setiap penerima dikirimi TEPAT sekali,
 *  • 429 dihormati lalu dilanjutkan, 5xx diulang dengan batas, 422 gagal
 *    permanen, timeout → 'unknown' tanpa kirim ulang,
 *  • kredensial dicabut → kampanye berhenti, sisa antrean utuh,
 *  • dua worker bersamaan → yang kedua mundur (lease),
 *  • request yang berjalan bersamaan tidak pernah lebih dari 5.
 *
 * Jalankan: node --experimental-strip-types --no-warnings scripts/qa-wa-blast-engine.mts
 */
import { drainDirect, PER_MINUTE, type DrainStore, type QueueRow, type SendError } from "../src/lib/qontak/engine.ts";

let clock = 1_800_000_000_000;
const now = () => clock;
const sleep = async (ms: number) => {
  clock += Math.max(0, ms);
  await Promise.resolve();
};

interface Row extends QueueRow {
  status: string;
  next_attempt_at: number | null;
  last_attempt_at: number | null;
  last_error: string | null;
  seq: number;
}

function makeStore(rows: Row[]) {
  const campaigns = new Map<string, { status: string; stop?: string }>();
  for (const r of rows) campaigns.set(r.campaign_id, { status: "sending" });
  let lease = { holder: "", until: 0 };
  const store: DrainStore = {
    async acquire(h, s) {
      if (lease.until < clock || lease.holder === h) { lease = { holder: h, until: clock + s * 1000 }; return true; }
      return false;
    },
    async release(h) { if (lease.holder === h) lease.until = 0; },
    async budget(per) { return Math.max(0, per - rows.filter((r) => r.last_attempt_at !== null && r.last_attempt_at > clock - 60_000).length); },
    async claim(limit) {
      const got = rows
        .filter((r) => r.status === "queued" && campaigns.get(r.campaign_id)?.status === "sending" && (r.next_attempt_at ?? 0) <= clock)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit);
      for (const r of got) { r.status = "sending"; r.attempts++; r.last_attempt_at = clock; }
      return got.map((r) => ({ ...r }));
    },
    async campaigns(ids) { return new Map(ids.map((id) => [id, { template_id: "t", channel_integration_id: "c", language: "id" }])); },
    async markSent(id) { const r = rows.find((x) => x.id === id)!; r.status = "sent"; },
    async requeue(id, next, err, refund) {
      const r = rows.find((x) => x.id === id)!;
      r.status = "queued"; r.next_attempt_at = next ? +next : null; r.last_error = err;
      if (refund) r.attempts = Math.max(0, r.attempts - 1);
      if (err === null) r.last_attempt_at = null;
    },
    async markFailed(id, status, err) { const r = rows.find((x) => x.id === id)!; r.status = status; r.last_error = err; },
    async stopCampaign(cid, reason) { campaigns.set(cid, { status: "failed", stop: reason }); },
    async finalize() {},
  };
  return { store, campaigns };
}

const mkRows = (n: number, cid = "c1"): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${cid}-${i}`, campaign_id: cid, phone: `6281${String(i).padStart(8, "0")}`, name: `P${i}`, params: {},
    attempts: 0, status: "queued", next_attempt_at: null, last_attempt_at: null, last_error: null, seq: i,
  }));

class FakeErr extends Error { e: SendError; constructor(e: SendError) { super(e.message); this.e = e; } }
const toError = (e: unknown): SendError => (e instanceof FakeErr ? e.e : { code: "upstream", status: 0, message: String(e), retryAfterMs: null });

let gagal = 0;
const cek = (ok: boolean, msg: string) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) gagal++; };

async function drainAll(store: DrainStore, send: (r: QueueRow) => Promise<string | null>, maxRuns = 200) {
  for (let i = 0; i < maxRuns; i++) {
    const mulai = clock;
    await drainDirect(55_000, { store, send: (r) => send(r), toError, now, sleep });
    // pg_cron memanggil worker tiap menit — run berikutnya mulai di menit berikutnya.
    clock = Math.max(clock, mulai + 60_000);
  }
}

// ── 1. 300 penerima: rate & tepat-sekali ──────────────────────────
{
  const rows = mkRows(300);
  const { store } = makeStore(rows);
  const sends: number[] = [];
  const perPhone = new Map<string, number>();
  let inflight = 0, maxInflight = 0;
  await drainAll(store, async (r) => {
    inflight++; maxInflight = Math.max(maxInflight, inflight);
    sends.push(clock);
    perPhone.set(r.phone, (perPhone.get(r.phone) ?? 0) + 1);
    await Promise.resolve(); await Promise.resolve();
    inflight--;
    return "ref";
  }, 20);
  let worst = 0;
  for (let i = 0; i < sends.length; i++) {
    const n = sends.filter((t) => t >= sends[i] && t < sends[i] + 60_000).length;
    worst = Math.max(worst, n);
  }
  cek(rows.every((r) => r.status === "sent"), `300/300 terkirim (${rows.filter((r) => r.status === "sent").length})`);
  cek([...perPhone.values()].every((n) => n === 1) && perPhone.size === 300, "setiap nomor dikirimi tepat sekali");
  cek(worst <= PER_MINUTE, `jendela 60 dtk terpadat = ${worst} request (batas ${PER_MINUTE}, Qontak 60)`);
  cek(maxInflight <= 5, `request bersamaan maks = ${maxInflight} (≤5)`);
  const menit = (sends[sends.length - 1] - sends[0]) / 60_000;
  console.log(`  ↳ 300 pesan dalam ${menit.toFixed(1)} menit virtual`);
}

// ── 2. 429 di tengah jalan ────────────────────────────────────────
{
  const rows = mkRows(20);
  const { store } = makeStore(rows);
  let n = 0;
  const count = new Map<string, number>();
  await drainAll(store, async (r) => {
    n++;
    if (n === 5) throw new FakeErr({ code: "rate_limited", status: 429, message: "slow down", retryAfterMs: 30_000 });
    count.set(r.phone, (count.get(r.phone) ?? 0) + 1);
    return null;
  }, 5);
  cek(rows.every((r) => r.status === "sent"), "429: semua akhirnya terkirim");
  cek([...count.values()].every((x) => x === 1), "429: tidak ada yang terkirim dua kali");
}

// ── 3. timeout jaringan → unknown, tidak diulang ──────────────────
{
  const rows = mkRows(3);
  const { store } = makeStore(rows);
  let calls = 0;
  await drainAll(store, async (r) => {
    calls++;
    if (r.id === "c1-1") throw new FakeErr({ code: "network", status: 0, message: "timeout", retryAfterMs: null });
    return null;
  }, 5);
  cek(rows[1].status === "unknown", "timeout → 'unknown'");
  cek(calls === 3, `timeout tidak dikirim ulang otomatis (${calls} panggilan untuk 3 baris)`);
}

// ── 4. 422 → gagal permanen · 5xx → diulang lalu sukses ───────────
{
  const rows = mkRows(2);
  const { store } = makeStore(rows);
  let five = 0;
  await drainAll(store, async (r) => {
    if (r.id === "c1-0") throw new FakeErr({ code: "invalid", status: 422, message: "nomor tidak terdaftar WhatsApp", retryAfterMs: null });
    if (five++ < 2) throw new FakeErr({ code: "upstream", status: 502, message: "bad gateway", retryAfterMs: null });
    return null;
  }, 10);
  cek(rows[0].status === "failed" && rows[0].last_error === "nomor tidak terdaftar WhatsApp", "422 → failed + pesan Qontak apa adanya");
  cek(rows[1].status === "sent" && rows[1].attempts === 3, `5xx dua kali → terkirim di percobaan ke-3 (attempts=${rows[1].attempts})`);
}
{
  const rows = mkRows(1);
  const { store } = makeStore(rows);
  let calls = 0;
  await drainAll(store, async () => { calls++; throw new FakeErr({ code: "upstream", status: 500, message: "boom", retryAfterMs: null }); }, 10);
  cek(rows[0].status === "failed" && calls === 3, `5xx terus-menerus → failed setelah 3 percobaan (${calls})`);
}

// ── 5. kredensial dicabut → kampanye berhenti, antrean utuh ──────
{
  const rows = mkRows(10);
  const { store, campaigns } = makeStore(rows);
  let calls = 0;
  await drainAll(store, async () => { calls++; if (calls >= 3) throw new FakeErr({ code: "unauthorized", status: 401, message: "mag: unauthorized", retryAfterMs: null }); return null; }, 3);
  cek(campaigns.get("c1")?.status === "failed", "401 → kampanye dihentikan");
  cek(rows.filter((r) => r.status === "queued").length >= 7, `sisa antrean tetap 'queued' untuk dilanjutkan (${rows.filter((r) => r.status === "queued").length})`);
  cek(rows.filter((r) => r.status === "sent").length === 2, "yang sudah terkirim tetap tercatat terkirim");
}

// ── 6. lease: worker kedua mundur ─────────────────────────────────
{
  const rows = mkRows(5);
  const { store } = makeStore(rows);
  await store.acquire("lain", 60);
  const r = await drainDirect(10_000, { store, send: async () => null, toError, now, sleep });
  cek(r.busy === true && rows.every((x) => x.status === "queued"), "worker kedua mundur saat lease dipegang");
}

process.exit(gagal ? 1 : 0);

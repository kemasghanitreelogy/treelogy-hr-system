import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBulkBroadcast, createContactList, failedContacts, getContactList, QontakError } from "./client";
import { buildCsv, bulkParameters, pickRound, type BulkRow } from "./bulk-core";

/**
 * Jalur BULK: satu contact list + SATU broadcast per putaran kampanye —
 * di dashboard Qontak tampil sebagai satu kampanye, bukan satu baris per
 * penerima. Dijalankan worker (runDrain) di bawah lease yang sama dengan
 * jalur direct.
 *
 * Kejujuran status sama dengan direct:
 *  • Selama contact list diimpor, penerima tetap 'queued' (+ bulk_list_id) —
 *    belum ada yang dikirim.
 *  • 'sending' hanya selama POST broadcast; 201 → 'sent' (= diterima Qontak,
 *    BUKAN sampai). Sampai/dibaca/ditolak datang dari log per nomor.
 *  • Timeout jaringan saat POST broadcast → 'unknown' (mungkin terkirim),
 *    tidak pernah dikirim ulang otomatis.
 *  • Kontak yang ditolak Qontak saat impor → 'failed' dengan alasannya.
 *  • Scope/kredensial bulk dicabut → kampanye pindah ke jalur direct,
 *    penerima tetap di antrean (tidak ada yang hilang).
 */

const MAX_ATTEMPTS = 3;
const POLL_MS = 2_000;

interface BulkCampaign {
  id: string;
  name: string;
  template_id: string;
  channel_integration_id: string;
  language: string;
  bulk_list_id: string | null;
}

type Db = SupabaseClient;

async function updateIds(db: Db, ids: string[], patch: Record<string, unknown>) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("wa_campaign_recipients").update(patch).in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}

async function queuedRows(db: Db, campaignId: string, listId: string | null): Promise<(BulkRow & { attempts: number })[]> {
  const out: (BulkRow & { attempts: number })[] = [];
  const nowIso = new Date().toISOString();
  for (let from = 0; ; from += 1000) {
    let q = db.from("wa_campaign_recipients").select("id, phone, name, params, attempts")
      .eq("campaign_id", campaignId).eq("status", "queued").order("seq").range(from, from + 999);
    q = listId ? q.eq("bulk_list_id", listId) : q.is("bulk_list_id", null).or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as (BulkRow & { attempts: number })[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const stamp = () =>
  new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

/** Kredensial/scope bulk hilang → lanjutkan lewat direct, tanpa kehilangan antrean. */
async function fallbackToDirect(db: Db, c: BulkCampaign, reason: string) {
  await db.from("wa_campaign_recipients").update({ bulk_list_id: null }).eq("campaign_id", c.id).eq("status", "queued");
  await db.from("wa_campaigns").update({ engine: "direct", bulk_list_id: null, stop_reason: null }).eq("id", c.id);
  console.warn(`[wa-bulk] ${c.id} → direct: ${reason}`);
}

const lostAccess = (e: unknown) =>
  e instanceof QontakError && (e.code === "scope_missing" || e.code === "unauthorized" || e.code === "not_configured");

/** Satu langkah untuk satu kampanye. Mengembalikan jumlah penerima yang diterima Qontak. */
async function step(db: Db, c: BulkCampaign, endAt: number): Promise<number> {
  let listId = c.bulk_list_id;

  // 1 — Unggah contact list untuk putaran ini (satu nomor sekali per list).
  if (!listId) {
    const round = pickRound(await queuedRows(db, c.id, null));
    if (!round.length) return 0;
    try {
      const list = await createContactList(`${c.name} · ${stamp()}`, buildCsv(round));
      if (!list.id) throw new QontakError(502, "upstream", "contact list tanpa id");
      listId = list.id;
    } catch (e) {
      if (lostAccess(e)) await fallbackToDirect(db, c, (e as Error).message);
      // Lainnya (jaringan, 5xx, 429): belum ada yang terkirim — coba lagi di tick berikutnya.
      return 0;
    }
    await updateIds(db, round.map((r) => r.id), { bulk_list_id: listId });
    await db.from("wa_campaigns").update({ bulk_list_id: listId }).eq("id", c.id);
  }

  // 2 — Tunggu Qontak selesai mengimpor (biasanya < 2 dtk per 100 kontak).
  let list;
  for (;;) {
    try {
      list = await getContactList(listId);
    } catch (e) {
      if (lostAccess(e)) await fallbackToDirect(db, c, (e as Error).message);
      return 0;
    }
    if (list.progress !== "processing" && list.progress !== "pending" && list.progress !== "") break;
    if (Date.now() + POLL_MS > endAt - 20_000) return 0; // lanjut di tick berikutnya
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  let members = await queuedRows(db, c.id, listId);
  const closeList = async () => {
    await db.from("wa_campaigns").update({ bulk_list_id: null }).eq("id", c.id);
  };
  if (!members.length) {
    await closeList();
    return 0;
  }

  // 3 — Kontak yang ditolak Qontak saat impor: gagal, dengan alasannya.
  if (list.progress !== "success" && list.count - list.failed <= 0) {
    await updateIds(db, members.map((m) => m.id), {
      status: "failed", bulk_list_id: null, last_error: `Qontak menolak contact list: ${JSON.stringify(list.errors ?? list.progress).slice(0, 300)}`,
    });
    await closeList();
    return 0;
  }
  if (list.failed > 0) {
    const bad = await failedContacts(listId).catch(() => new Map<string, string>());
    const rejected = members.filter((m) => bad.has(m.phone));
    for (const m of rejected) {
      await db.from("wa_campaign_recipients")
        .update({ status: "failed", bulk_list_id: null, last_error: `Ditolak Qontak saat impor kontak: ${bad.get(m.phone)}` })
        .eq("id", m.id);
    }
    members = members.filter((m) => !bad.has(m.phone));
    if (!members.length) {
      await closeList();
      return 0;
    }
  }

  // 4 — SATU broadcast untuk seluruh list.
  const ids = members.map((m) => m.id);
  const attempts = Math.max(...members.map((m) => m.attempts)) + 1;
  await updateIds(db, ids, { status: "sending", attempts, last_attempt_at: new Date().toISOString() });
  try {
    const ref = await createBulkBroadcast({
      name: c.name,
      message_template_id: c.template_id,
      contact_list_id: listId,
      channel_integration_id: c.channel_integration_id,
      language: { code: c.language },
      parameters: bulkParameters(members),
    });
    await updateIds(db, ids, { status: "sent", sent_at: new Date().toISOString(), qontak_ref: ref, bulk_list_id: null, last_error: null });
    await db.from("wa_campaigns").update({ bulk_list_id: null, qontak_broadcast_id: ref }).eq("id", c.id);
    return ids.length;
  } catch (e) {
    const err = e instanceof QontakError ? e : new QontakError(0, "upstream", e instanceof Error ? e.message : String(e));
    if (err.code === "network") {
      // Bisa saja broadcast sudah dibuat — jangan kirim ulang otomatis.
      await updateIds(db, ids, { status: "unknown", bulk_list_id: null, last_error: `network: ${err.message}` });
      await closeList();
    } else if (lostAccess(err)) {
      await updateIds(db, ids, { status: "queued", attempts: attempts - 1, last_attempt_at: null });
      await fallbackToDirect(db, c, err.message);
    } else if ((err.code === "rate_limited" || err.code === "upstream") && attempts < MAX_ATTEMPTS) {
      // Ditolak = belum terkirim. List yang sama dipakai lagi di tick berikutnya.
      const wait = err.retryAfterMs ?? 60_000;
      await updateIds(db, ids, { status: "queued", next_attempt_at: new Date(Date.now() + wait).toISOString(), last_error: `${err.status}: ${err.message}`.slice(0, 500) });
    } else {
      await updateIds(db, ids, { status: "failed", bulk_list_id: null, last_error: (err.message || err.code).slice(0, 500) });
      await closeList();
    }
    return 0;
  }
}

/** Proses semua kampanye bulk yang sedang berjalan sampai `deadlineMs` habis. */
export async function drainBulk(db: Db, deadlineMs: number): Promise<{ busy?: boolean; sent: number }> {
  const endAt = Date.now() + deadlineMs;
  const holder = `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: got } = await db.rpc("acquire_wa_lease", { p_holder: holder, p_seconds: Math.ceil(deadlineMs / 1000) + 20 });
  if (!got) return { busy: true, sent: 0 };
  let sent = 0;
  try {
    const { data: camps } = await db
      .from("wa_campaigns")
      .select("id, name, template_id, channel_integration_id, language, bulk_list_id")
      .eq("status", "sending").eq("engine", "bulk").order("started_at");
    for (const c of (camps ?? []) as BulkCampaign[]) {
      // Putaran berikutnya (nomor yang sama dengan resi lain) langsung menyusul.
      for (let round = 0; round < 5 && Date.now() < endAt - 25_000; round++) {
        const n = await step(db, c, endAt);
        const { data: fresh } = await db.from("wa_campaigns").select("bulk_list_id, engine").eq("id", c.id).maybeSingle();
        sent += n;
        if (fresh?.engine !== "bulk" || fresh?.bulk_list_id) break; // pindah jalur / list masih diproses
        c.bulk_list_id = null;
        if (!n) break;
      }
    }
    await db.rpc("finalize_wa_campaigns");
  } finally {
    await db.rpc("release_wa_lease", { p_holder: holder });
  }
  return { sent };
}

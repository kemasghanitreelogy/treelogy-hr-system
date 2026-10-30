import "server-only";
import { signRequest } from "./sign";
import { toWaTemplate, type WaTemplate } from "./template";

/**
 * Klien Qontak Chat lewat gateway Mekari (HMAC).
 *
 * Kredensialnya `CLIENT_ID_QONTAK` / `CLIENT_SECRET_QONTAK` — aplikasi HMAC di
 * Mekari Developer Center, BUKAN token OAuth service-chat.qontak.com versi
 * lama. Tanda tangannya (dokumentasi Mekari + SDK resmi qontak-api-js):
 *
 *   signature = base64( HMAC-SHA256( secret, "date: <RFC 7231>\n<METHOD> <path+query> HTTP/1.1" ) )
 *
 * Query string WAJIB ikut ditandatangani persis seperti yang dikirim — sejak
 * Desember 2023 gateway menolak tanda tangan tanpa query untuk URL yang
 * memilikinya. Karena itu URL dan request-line dibangun dari string yang sama.
 */

const BASE = "https://api.mekari.com";
const PREFIX = "/qontak/chat/v1";
const TIMEOUT_MS = 15_000;

export class QontakError extends Error {
  status: number;
  /** Kode mesin: scope_missing | unauthorized | rate_limited | invalid | upstream | network | not_configured */
  code: string;
  /** Untuk 429: berapa lama menunggu sebelum mencoba lagi. */
  retryAfterMs: number | null;
  constructor(status: number, code: string, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function qontakConfigured(): boolean {
  return Boolean(process.env.CLIENT_ID_QONTAK && process.env.CLIENT_SECRET_QONTAK);
}

/** Retry-After (detik) atau X-RateLimit-Reset (detik / epoch detik) → ms. */
function retryAfter(h: Headers): number | null {
  const ra = h.get("retry-after");
  if (ra && /^\d+$/.test(ra)) return Number(ra) * 1000;
  const reset = h.get("x-ratelimit-reset");
  if (reset && /^\d+$/.test(reset)) {
    const n = Number(reset);
    return n > 1e9 ? Math.max(0, n * 1000 - Date.now()) : n * 1000;
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function errorText(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body.slice(0, 300);
  const e = body.error ?? body.errors ?? body.message ?? body.code;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    if (Array.isArray(e.messages)) return e.messages.join("; ");
    if (typeof e.message === "string") return e.message;
    if (Array.isArray(e)) return e.map((x) => (typeof x === "string" ? x : x?.message ?? JSON.stringify(x))).join("; ");
    return JSON.stringify(e).slice(0, 300);
  }
  return JSON.stringify(body).slice(0, 300);
}

export async function qontakRequest<T = any>(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string | number | undefined>; json?: unknown; form?: FormData } = {},
): Promise<T> {
  const id = process.env.CLIENT_ID_QONTAK;
  const secret = process.env.CLIENT_SECRET_QONTAK;
  if (!id || !secret) throw new QontakError(503, "not_configured", "Qontak belum dikonfigurasi");

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") qs.set(k, String(v));
  const query = qs.toString();
  const pathWithQuery = `${PREFIX}${path}${query ? `?${query}` : ""}`;
  const date = new Date().toUTCString();

  const headers: Record<string, string> = {
    Accept: "application/json",
    Date: date,
    Authorization: signRequest(method, pathWithQuery, id, secret, date),
  };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(BASE + pathWithQuery, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    throw new QontakError(0, "network", e instanceof Error ? e.message : "network");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.ok) return data as T;

  const msg = errorText(data) || `HTTP ${res.status}`;
  if (res.status === 429) throw new QontakError(429, "rate_limited", msg, retryAfter(res.headers));
  // MAG-008 = aplikasi HMAC tidak punya scope untuk endpoint ini. Dibedakan
  // dari 401 biasa: obatnya mengaktifkan scope, bukan mengganti kredensial.
  if (/MAG-008/.test(msg)) throw new QontakError(res.status, "scope_missing", msg);
  if (res.status === 401 || res.status === 403) throw new QontakError(res.status, "unauthorized", msg);
  if (res.status === 422 || res.status === 400 || res.status === 404) throw new QontakError(res.status, "invalid", msg);
  throw new QontakError(res.status, "upstream", msg);
}

// ── Template & channel (di-cache per instance) ───────────────────────

let tplCache: { at: number; list: WaTemplate[] } | null = null;
const TPL_TTL_MS = 5 * 60_000;

export async function listTemplates(force = false): Promise<WaTemplate[]> {
  if (!force && tplCache && Date.now() - tplCache.at < TPL_TTL_MS) return tplCache.list;
  const res = await qontakRequest<{ data?: any[] }>("GET", "/templates/whatsapp", { query: { limit: 100 } });
  const list = (res?.data ?? []).filter((t) => t?.status === "APPROVED").map(toWaTemplate);
  tplCache = { at: Date.now(), list };
  return list;
}

export interface WaChannel {
  id: string;
  phone: string | null;
  name: string | null;
}

let chCache: { at: number; list: WaChannel[] } | null = null;

export async function listChannels(): Promise<WaChannel[]> {
  if (chCache && Date.now() - chCache.at < TPL_TTL_MS) return chCache.list;
  const res = await qontakRequest<{ data?: any[] }>("GET", "/integrations", { query: { target_channel: "wa", limit: 20 } });
  const list = (res?.data ?? [])
    .filter((c) => c?.is_active)
    .map((c) => ({
      id: String(c.id),
      phone: c.settings?.phone_number ?? null,
      name: c.settings?.account_name ?? c.settings?.name ?? null,
    }));
  chCache = { at: Date.now(), list };
  return list;
}

/** Kirim satu pesan template (direct). Mengembalikan id referensi Qontak bila ada. */
export async function sendDirect(payload: {
  to_number: string;
  to_name: string;
  message_template_id: string;
  channel_integration_id: string;
  language: { code: string };
  parameters: unknown;
  /** Nama broadcast di dashboard Qontak (opsional di API direct). */
  name?: string;
}): Promise<string | null> {
  const { name, ...base } = payload;
  let res: any;
  try {
    res = await qontakRequest<any>("POST", "/broadcasts/whatsapp/direct", { json: name ? { ...base, name: name.slice(0, 100) } : base });
  } catch (e) {
    // 400/422 (mungkin karena `name`): kirim ulang tanpa label — ditolak berarti belum terkirim,
    // jadi tidak ada risiko pesan ganda. Label tidak boleh menggagalkan blast.
    if (!name || !(e instanceof QontakError) || e.code !== "invalid" || e.status === 404) throw e;
    res = await qontakRequest<any>("POST", "/broadcasts/whatsapp/direct", { json: base });
  }
  return res?.data?.id ? String(res.data.id) : null;
}

let capCache: { at: number; bulk: boolean } | null = null;

/**
 * Apakah jalur bulk (contact list) terbuka untuk kredensial ini? Dicek
 * dengan GET ringan; MAG-008 berarti scope belum diaktifkan di Mekari.
 */
export async function bulkAvailable(): Promise<boolean> {
  if (capCache && Date.now() - capCache.at < 10 * 60_000) return capCache.bulk;
  let bulk = false;
  try {
    await qontakRequest("GET", "/contacts/contact_lists", { query: { limit: 1 } });
    bulk = true;
  } catch (e) {
    if (!(e instanceof QontakError) || e.code !== "scope_missing") {
      // Gangguan lain (jaringan, 5xx) — jangan simpan, coba lagi lain kali.
      return false;
    }
  }
  capCache = { at: Date.now(), bulk };
  return bulk;
}
/* eslint-enable @typescript-eslint/no-explicit-any */


// ── Jalur bulk: contact list + satu broadcast ────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Semua halaman endpoint ber-cursor Qontak (limit 100). */
async function pageAll(path: string, query: Record<string, string> = {}, maxPages = 100): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const res = await qontakRequest<any>("GET", path, { query: { ...query, limit: 100, cursor, cursor_direction: cursor ? "after" : undefined } });
    const data: any[] = Array.isArray(res?.data) ? res.data : [];
    out.push(...data);
    const next = res?.meta?.pagination?.cursor?.next;
    if (data.length < 100 || !next || next === cursor) break;
    cursor = String(next);
  }
  return out;
}

export interface QontakContactList {
  id: string;
  /** processing | success | failed (nama dari Qontak, apa adanya). */
  progress: string;
  count: number;
  failed: number;
  errors: unknown;
}

function toContactList(d: any): QontakContactList {
  return {
    id: String(d?.id ?? ""),
    progress: String(d?.progress ?? ""),
    count: Number(d?.contacts_count ?? 0),
    failed: Number(d?.contacts_count_failed ?? 0),
    errors: d?.error_messages ?? null,
  };
}

/** Unggah CSV sebagai contact list (diproses asinkron oleh Qontak). */
export async function createContactList(name: string, csv: string): Promise<QontakContactList> {
  const form = new FormData();
  form.set("name", name.slice(0, 100));
  form.set("source_type", "spreadsheet");
  form.set("file", new Blob([csv], { type: "text/csv" }), "contacts.csv");
  const res = await qontakRequest<any>("POST", "/contacts/contact_lists/async", { form });
  return toContactList(res?.data);
}

export async function getContactList(id: string): Promise<QontakContactList> {
  const res = await qontakRequest<any>("GET", `/contacts/contact_lists/${encodeURIComponent(id)}`);
  return toContactList(res?.data);
}

/** Kontak di list yang GAGAL diimpor → nomor (digit) → alasan. */
export async function failedContacts(listId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const c of await pageAll(`/contacts/contact_lists/contacts/${encodeURIComponent(listId)}`)) {
    if (c?.status === "success" && c?.is_valid !== false) continue;
    const why = c?.error_messages && Object.keys(c.error_messages).length ? JSON.stringify(c.error_messages) : `status ${c?.status ?? "?"}`;
    out.set(String(c?.phone_number ?? "").replace(/\D/g, ""), why.slice(0, 300));
  }
  return out;
}

/** SATU broadcast untuk seluruh contact list. Mengembalikan id broadcast. */
export async function createBulkBroadcast(payload: {
  name: string;
  message_template_id: string;
  contact_list_id: string;
  channel_integration_id: string;
  language: { code: string };
  parameters: unknown;
}): Promise<string | null> {
  const res = await qontakRequest<any>("POST", "/broadcasts/whatsapp", { json: { ...payload, name: payload.name.slice(0, 100), execute_type: "immediately" } });
  return res?.data?.id ? String(res.data.id) : null;
}

export interface LogEntry {
  phone: string;
  status: string | null;
  error: string | null;
}

/** Log broadcast lengkap (semua penerima) — status per nomor dari WhatsApp. */
export async function getBroadcastLog(broadcastId: string): Promise<LogEntry[]> {
  return (await pageAll(`/broadcasts/${encodeURIComponent(broadcastId)}/whatsapp/log`)).map((l) => ({
    phone: String(l?.contact_phone_number ?? "").replace(/\D/g, ""),
    status: typeof l?.status === "string" ? l.status : null,
    error: typeof l?.whatsapp_error_message === "string" && l.whatsapp_error_message !== "n/a" ? l.whatsapp_error_message : null,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

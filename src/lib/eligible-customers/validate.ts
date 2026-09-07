/**
 * Pemeriksaan isian yang dipakai DUA sisi: layar (pratinjau impor menandai
 * baris bermasalah sebelum dikirim) dan server (tidak percaya klien).
 */

const EMAIL_RE = /^[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z0-9-]{2,}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Tanggal seed harus YYYY-MM-DD — Function membandingkannya sebagai string. */
export function isValidSeedDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "vip, admin-created ;lain" → ["vip","admin-created","lain"] */
export function splitTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
  return [...new Set(String(raw ?? "").split(/[,;|]/).map((t) => t.trim()).filter(Boolean))];
}

export const MAX_BULK_ROWS = 25;

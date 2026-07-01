import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indonesian Rupiah formatter. */
export function rupiah(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(value) >= 1_000_000) {
    return "Rp " + (value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function num(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function pct(value: number, digits = 0): string {
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: digits })}%`;
}

const MONTHS: Record<"id" | "en", string[]> = {
  id: [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

/** Shared WITA (Asia/Makassar) date formatter — reused so every date renders in
 *  the attendance timezone regardless of server or browser locale. */
const WITA_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Makassar",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** [year, month(1-12), day] of an instant, read in WITA. */
function witaYMD(d: Date): [number, number, number] {
  const [y, m, day] = WITA_YMD.format(d).split("-").map(Number);
  return [y, m, day];
}

export function formatDate(
  input: string | Date,
  style: "short" | "long" = "short",
  locale: "id" | "en" = "id",
): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  // Always render the WITA calendar day — a date-only string ("2026-07-01") is
  // parsed as UTC midnight, which is still the same day in WITA (UTC+8); a full
  // instant is mapped to its WITA day. Avoids off-by-one on non-WITA locales.
  const [y, mo, day] = witaYMD(d);
  const months = MONTHS[locale];
  if (style === "long") {
    return `${day} ${months[mo - 1]} ${y}`;
  }
  return `${String(day).padStart(2, "0")} ${months[mo - 1].slice(0, 3)} ${y}`;
}

export function monthLabel(period: string, locale: "id" | "en" = "id"): string {
  // period = "2026-05"
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[locale][m - 1]} ${y}`;
}

/** `n` periode "YYYY-MM" mundur dari `from` (inklusif), terbaru dulu. */
export function periodsBack(n: number, from: string): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Add (or subtract) whole days to a YYYY-MM-DD string, returning YYYY-MM-DD.
 * Pure calendar arithmetic anchored at UTC midnight — safe for date-only values
 * (Indonesia has no DST, so no wall-clock drift).
 */
export function addDaysStr(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in WITA (Asia/Makassar) — the attendance timezone. */
export function witaToday(): string {
  return WITA_YMD.format(new Date());
}

/**
 * "Now" as a Date whose UTC components equal the current WITA calendar day
 * (anchored at midnight). Pass this to date-only APIs (tenure/anniversary math)
 * so they stay on the WITA day regardless of the server's own timezone.
 */
export function witaNow(): Date {
  return new Date(`${witaToday()}T00:00:00Z`);
}

export function formatTime(input?: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  // Always WITA — attendance times must read the same regardless of device tz.
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Makassar" });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function minutesToHM(min: number, locale: "id" | "en" = "id"): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hu = locale === "en" ? "h" : "j"; // jam vs hours
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}${hu}`;
  return `${h}${hu} ${m}m`;
}

/** Deterministic colour for an avatar from a name. */
export function avatarTone(name: string): string {
  const tones = ["bg-forest-600", "bg-olive", "bg-matcha", "bg-sky", "bg-gold", "bg-clay"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % tones.length;
  return tones[h];
}

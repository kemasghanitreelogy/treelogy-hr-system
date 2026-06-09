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

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatDate(input: string | Date, style: "short" | "long" = "short"): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  if (style === "long") {
    return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_ID[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function monthLabel(period: string): string {
  // period = "2026-05"
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS_ID[m - 1]} ${y}`;
}

export function formatTime(input?: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function minutesToHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}j`;
  return `${h}j ${m}m`;
}

/** Deterministic colour for an avatar from a name. */
export function avatarTone(name: string): string {
  const tones = ["bg-forest-600", "bg-olive", "bg-matcha", "bg-sky", "bg-gold", "bg-clay"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % tones.length;
  return tones[h];
}

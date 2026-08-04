import type { Locale } from "./i18n";
import type { TravelRequest, TravelTransport } from "./types";

/* ============================================================
   Perjalanan dinas — label + perhitungan turunan.

   Fungsi hitung di bawah adalah SATU-SATUNYA sumber kebenaran: dipakai form
   (pratinjau saat mengetik) dan API (nilai yang benar-benar disimpan). Jadi
   angka yang dilihat pengaju persis sama dengan yang masuk database.
   ============================================================ */

export const TRANSPORTS: TravelTransport[] = ["company_vehicle", "flight", "train", "other"];

export const TRANSPORT_LABEL: Record<Locale, Record<TravelTransport, string>> = {
  id: {
    company_vehicle: "Kendaraan kantor",
    flight: "Pesawat",
    train: "Kereta",
    other: "Lainnya",
  },
  en: {
    company_vehicle: "Company vehicle",
    flight: "Flight",
    train: "Train",
    other: "Others",
  },
};

/**
 * Lama perjalanan dalam hari, INKLUSIF: berangkat & kembali di hari yang sama
 * = 1 hari. Dihitung pada tengah malam UTC supaya tidak terpengaruh zona waktu
 * server (Indonesia tanpa DST, jadi tidak ada pergeseran jam dinding).
 */
export function travelDuration(departure: string, ret: string): number {
  if (!departure || !ret) return 0;
  const a = Date.parse(`${departure}T00:00:00Z`);
  const b = Date.parse(`${ret}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export interface CostParts {
  costTransport: number;
  costAccommodation: number;
  costPerDiem: number;
  costOther: number;
}

/** Total estimasi biaya = jumlah keempat komponen. Nilai negatif dianggap 0. */
export function travelTotal(c: CostParts): number {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return (
    safe(c.costTransport) + safe(c.costAccommodation) + safe(c.costPerDiem) + safe(c.costOther)
  );
}

/** Uang muka yang benar-benar berlaku — 0 bila karyawan tidak memintanya. */
export function effectiveAdvance(req: Pick<TravelRequest, "advanceRequired" | "advanceAmount">): number {
  return req.advanceRequired ? req.advanceAmount : 0;
}

/** Perjalanan yang sedang berlangsung hari ini (sudah disetujui). */
export function isOngoing(req: TravelRequest, today: string): boolean {
  return req.status === "approved" && req.departureDate <= today && req.returnDate >= today;
}

/** Perjalanan disetujui yang belum berangkat. */
export function isUpcoming(req: TravelRequest, today: string): boolean {
  return req.status === "approved" && req.departureDate > today;
}

import type { Locale } from "./i18n";
import type { ReimbursementCategory } from "./types";

/* ============================================================
   Travel reimbursement — label & batas.
   Nilai enum mengikuti pilihan pada Google Form aslinya supaya rekap lama
   tetap bisa dicocokkan; label tampilan diurus terpisah di bawah.
   ============================================================ */

export const REIMB_CATEGORIES: ReimbursementCategory[] = [
  "transportation",
  "accommodation",
  "meals",
  "per_diem",
  "fuel",
  "parking_toll",
  "other",
];

/** Teks kategori seperti di Google Form (dipakai untuk ekspor/rekap). */
export const REIMB_CATEGORY_FORM: Record<ReimbursementCategory, string> = {
  transportation: "Transportation",
  accommodation: "Accommodation",
  meals: "Meals",
  per_diem: "Per Diem",
  fuel: "Fuel",
  parking_toll: "Parking/Toll",
  other: "Other",
};

export const REIMB_CATEGORY_LABEL: Record<Locale, Record<ReimbursementCategory, string>> = {
  id: {
    transportation: "Transportasi",
    accommodation: "Penginapan",
    meals: "Makan",
    per_diem: "Uang harian",
    fuel: "Bahan bakar",
    parking_toll: "Parkir / tol",
    other: "Lainnya",
  },
  en: { ...REIMB_CATEGORY_FORM },
};

/** Maksimal bukti per klaim — mengikuti "Upload up to 5 files" di form asli. */
export const MAX_RECEIPTS = 5;

/** Ekstensi bukti yang diterima (PDF, dokumen, gambar). */
export const RECEIPT_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "pdf", "doc", "docx"];

/** Lama perjalanan (inklusif) — dihitung sama di form & server. */
export function tripDuration(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

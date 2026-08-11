import type { Locale } from "./i18n";
import type { CompanyDocument, DocumentCategory } from "./types";

/* ============================================================
   Dokumen perusahaan — label, tone, dan helper masa berlaku.
   Satu sumber kebenaran untuk enum → teks/warna, dipakai form,
   daftar, dan detail.
   ============================================================ */

export const DOC_CATEGORIES: DocumentCategory[] = [
  "legal",
  "perizinan",
  "kontrak",
  "keuangan",
  "pajak",
  "sdm",
  "sop",
  "sertifikat",
  "lainnya",
];

export const DOC_CATEGORY_LABEL: Record<Locale, Record<DocumentCategory, string>> = {
  id: {
    legal: "Legalitas",
    perizinan: "Perizinan",
    kontrak: "Kontrak & Perjanjian",
    keuangan: "Keuangan",
    pajak: "Pajak",
    sdm: "SDM",
    sop: "SOP & Kebijakan",
    sertifikat: "Sertifikat",
    lainnya: "Lainnya",
  },
  en: {
    legal: "Legal",
    perizinan: "Permits",
    kontrak: "Contracts & Agreements",
    keuangan: "Finance",
    pajak: "Tax",
    sdm: "HR",
    sop: "SOP & Policies",
    sertifikat: "Certificates",
    lainnya: "Other",
  },
};

/** Ekstensi berkas yang diterima untuk dokumen (validasi server & accept form). */
export const DOC_EXTS = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx", "pptx"];

type Tone = "forest" | "olive" | "matcha" | "gold" | "clay" | "sky" | "neutral";

/** Status masa berlaku. Dokumen tanpa tanggal kedaluwarsa dianggap `berlaku`. */
export type ExpiryStatus = "berlaku" | "segera" | "kedaluwarsa";

/** Izin/sertifikat butuh waktu perpanjangan — 60 hari sebelum habis sudah "segera". */
export const EXPIRING_SOON_DAYS = 60;

export function expiryStatus(doc: Pick<CompanyDocument, "expiryDate">, today: string): ExpiryStatus {
  if (!doc.expiryDate) return "berlaku";
  if (doc.expiryDate < today) return "kedaluwarsa";
  const days = Math.round((Date.parse(doc.expiryDate) - Date.parse(today)) / 86_400_000);
  return days <= EXPIRING_SOON_DAYS ? "segera" : "berlaku";
}

export const EXPIRY_STATUSES: ExpiryStatus[] = ["berlaku", "segera", "kedaluwarsa"];

export const EXPIRY_LABEL: Record<Locale, Record<ExpiryStatus, string>> = {
  id: { berlaku: "Berlaku", segera: "Segera berakhir", kedaluwarsa: "Kedaluwarsa" },
  en: { berlaku: "Valid", segera: "Expiring soon", kedaluwarsa: "Expired" },
};

export const EXPIRY_TONE: Record<ExpiryStatus, Tone> = {
  berlaku: "matcha",
  segera: "gold",
  kedaluwarsa: "clay",
};

/** Warna teks status saat ditulis polos (tanpa chip) — sejalan dengan tone di atas. */
export const EXPIRY_TEXT: Record<ExpiryStatus, string> = {
  berlaku: "text-forest-600",
  segera: "text-[#8a6512]",
  kedaluwarsa: "text-clay",
};

/** Ekstensi berkas dari path storage ("files/<uuid>.pdf" → "pdf"). */
export function fileExt(path: string | null | undefined): string | null {
  if (!path) return null;
  const dot = path.lastIndexOf(".");
  return dot > 0 ? path.slice(dot + 1).toLowerCase() : null;
}

/** Dokumen yang butuh perhatian HR: kedaluwarsa atau segera berakhir. */
export function docNeedsAttention(doc: Pick<CompanyDocument, "expiryDate">, today: string): boolean {
  return expiryStatus(doc, today) !== "berlaku";
}

import type { Locale } from "./i18n";
import type {
  LetterCategory,
  LetterDelivery,
  LetterStatus,
  LetterUrgency,
  OutgoingLetter,
} from "./types";

/* ============================================================
   Surat keluar — label, tone, dan helper turunan.
   Satu sumber kebenaran untuk enum → teks/warna, dipakai form,
   daftar, dan detail.
   ============================================================ */

export const LETTER_CATEGORIES: LetterCategory[] = [
  "undangan",
  "penawaran",
  "permohonan",
  "pemberitahuan",
  "perjanjian",
  "surat_tugas",
  "surat_keterangan",
  "penagihan",
  "lainnya",
];

export const LETTER_CATEGORY_LABEL: Record<Locale, Record<LetterCategory, string>> = {
  id: {
    undangan: "Undangan",
    penawaran: "Penawaran",
    permohonan: "Permohonan",
    pemberitahuan: "Pemberitahuan",
    perjanjian: "Perjanjian / Kontrak",
    surat_tugas: "Surat Tugas",
    surat_keterangan: "Surat Keterangan",
    penagihan: "Penagihan",
    lainnya: "Lainnya",
  },
  en: {
    undangan: "Invitation",
    penawaran: "Quotation",
    permohonan: "Request",
    pemberitahuan: "Notice",
    perjanjian: "Agreement / Contract",
    surat_tugas: "Assignment Letter",
    surat_keterangan: "Certificate Letter",
    penagihan: "Collection",
    lainnya: "Other",
  },
};

export const LETTER_STATUSES: LetterStatus[] = ["draft", "terkirim", "dibatalkan"];

export const LETTER_STATUS_LABEL: Record<Locale, Record<LetterStatus, string>> = {
  id: { draft: "Draft", terkirim: "Terkirim", dibatalkan: "Dibatalkan" },
  en: { draft: "Draft", terkirim: "Sent", dibatalkan: "Cancelled" },
};

type Tone = "forest" | "olive" | "matcha" | "gold" | "clay" | "sky" | "neutral";

export const LETTER_STATUS_TONE: Record<LetterStatus, Tone> = {
  draft: "gold",
  terkirim: "matcha",
  dibatalkan: "neutral",
};

export const LETTER_URGENCIES: LetterUrgency[] = ["biasa", "segera", "sangat_segera", "rahasia"];

export const LETTER_URGENCY_LABEL: Record<Locale, Record<LetterUrgency, string>> = {
  id: { biasa: "Biasa", segera: "Segera", sangat_segera: "Sangat segera", rahasia: "Rahasia" },
  en: { biasa: "Normal", segera: "Urgent", sangat_segera: "Very urgent", rahasia: "Confidential" },
};

export const LETTER_URGENCY_TONE: Record<LetterUrgency, Tone> = {
  biasa: "neutral",
  segera: "gold",
  sangat_segera: "clay",
  rahasia: "sky",
};

/** Warna teks sifat surat saat ditulis polos (tanpa chip). */
export const LETTER_URGENCY_TEXT: Record<LetterUrgency, string> = {
  biasa: "text-faint",
  segera: "text-[#8a6512]",
  sangat_segera: "text-clay",
  rahasia: "text-sky",
};

export const LETTER_DELIVERIES: LetterDelivery[] = ["email", "kurir", "pos", "langsung", "whatsapp"];

export const LETTER_DELIVERY_LABEL: Record<Locale, Record<LetterDelivery, string>> = {
  id: {
    email: "Email",
    kurir: "Kurir / ekspedisi",
    pos: "Pos",
    langsung: "Diantar langsung",
    whatsapp: "WhatsApp",
  },
  en: {
    email: "Email",
    kurir: "Courier",
    pos: "Post",
    langsung: "Hand-delivered",
    whatsapp: "WhatsApp",
  },
};

/** Ekstensi berkas yang diterima untuk arsip surat. */
export const LETTER_EXTS = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"];

/** Ekstensi dari path storage — helper yang sama dengan modul dokumen. */
export { fileExt as fileExtOf } from "./documents";

/**
 * Surat yang butuh perhatian: masih draft padahal tanggal suratnya sudah
 * lewat — artinya surat sudah bertanggal tapi belum tercatat terkirim.
 */
export function letterNeedsAttention(
  letter: Pick<OutgoingLetter, "status" | "letterDate">,
  today: string,
): boolean {
  return letter.status === "draft" && letter.letterDate < today;
}

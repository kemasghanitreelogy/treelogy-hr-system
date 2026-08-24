import type { TokopediaReview } from "./types";

/* ============================================================
   Review Tokopedia → satu baris CSV Judge.me.

   Kolomnya mengikuti "Judge.me format" (Settings ▸ Import reviews ▸ Import
   from a spreadsheet). Dua kolom terakhir sengaja BUKAN kolom Judge.me:
   `cf_variant` & `cf_source` hanya catatan internal — biarkan tanpa pemetaan
   saat wizard import bertanya, jangan dipetakan ke apa pun.
   ============================================================ */

export const JUDGEME_COLUMNS = [
  "title",
  "body",
  "rating",
  "review_date",
  "reviewer_name",
  "reviewer_email",
  "product_handle",
  "picture_urls",
  "reply",
  "curated",
  "cf_variant",
  "cf_source",
] as const;

export type JudgeMeRow = Record<(typeof JUDGEME_COLUMNS)[number], string>;

/** Judge.me menerima paling banyak 5 foto per review. */
const MAX_PICTURES = 5;

/**
 * Bagaimana nama penulis ditulis di CSV.
 *
 * `isAnonymous` ternyata menentukan segalanya, dan korelasinya sempurna pada
 * 359 review yang ditarik: yang memilih anonim namanya disamarkan Tokopedia
 * jadi "M***c" (222 baris), yang tidak memilih anonim namanya utuh dan bersih —
 * Vita, Wara, Irvan, Theresia (137 baris).
 *
 *   "respect"   — ikuti pilihan pembeli. Nama asli dipakai apa adanya; yang
 *                 memilih anonim ditulis "Anonymous". Ini bawaannya, karena
 *                 "M***c" di widget toko terbaca seperti data hasil scrape,
 *                 sedangkan "Anonymous" adalah label yang sudah dikenal orang.
 *   "masked"    — tulis apa adanya dari Tokopedia, bintang dan semua.
 *   "anonymous" — semua jadi "Anonymous". Membuang 137 nama asli, jadi hampir
 *                 tidak pernah pilihan yang tepat; disediakan untuk kalau ada
 *                 alasan privasi yang menuntutnya.
 */
export type NameStyle = "respect" | "masked" | "anonymous";

/** dd/mm/yyyy menurut WIB — satu-satunya jalur Judge.me yang bisa backdate. */
export function judgemeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

export function reviewerName(review: TokopediaReview, style: NameStyle): string {
  if (style === "anonymous") return "Anonymous";
  const name = (review.reviewerName || "").trim();
  if (!name) return "Anonymous";
  // Yang memilih anonim tidak punya nama untuk ditampilkan — yang ada hanya
  // sisa huruf dari nama yang sengaja disembunyikan. Menuliskannya sebagai
  // "Anonymous" bukan membuang informasi, justru menyebutnya dengan benar.
  if (style === "respect" && (review.isAnonymous || name.includes("*"))) return "Anonymous";
  return name;
}

/** Berapa baris yang akan tampil bernama asli dengan gaya ini — untuk layar. */
export function namedCount(reviews: TokopediaReview[], style: NameStyle): number {
  return reviews.reduce((n, r) => n + (reviewerName(r, style) === "Anonymous" ? 0 : 1), 0);
}

export function toJudgeMeRow(review: TokopediaReview, style: NameStyle): JudgeMeRow {
  return {
    // Tokopedia tidak punya judul review — dibiarkan kosong, bukan diisi
    // potongan body, supaya widget tidak menampilkan kalimat yang sama dua kali.
    title: "",
    body: review.body.trim(),
    rating: String(review.rating),
    review_date: judgemeDate(review.reviewAt),
    reviewer_name: reviewerName(review, style),
    // Tidak tersedia di data publik, dan tidak boleh dikarang: Judge.me memakai
    // alamat email untuk mengirim permintaan foto/balasan ke orangnya.
    reviewer_email: "",
    product_handle: review.shopifyHandle,
    picture_urls: review.pictureUrls.slice(0, MAX_PICTURES).join(","),
    reply: (review.reply ?? "").trim(),
    curated: "ok",
    cf_variant: review.variantName ?? "",
    cf_source: `tokopedia:${review.feedbackId}`,
  };
}

/** Review tanpa teks (bintang-saja) — Judge.me menolak body kosong. */
export function hasBody(review: TokopediaReview): boolean {
  return review.body.trim().length > 0;
}

/**
 * Apakah tautan foto baris ini sudah mati?
 *
 * Judge.me mengunduh foto saat import DIPROSES (±5 menit setelah unggah),
 * bukan saat CSV dibuat. Tautan yang sudah lewat masa berlakunya akan gagal
 * diam-diam: reviewnya masuk, fotonya tidak, tanpa pesan galat.
 */
export function picturesExpired(review: TokopediaReview, now = new Date()): boolean {
  if (!review.picturesExpireAt) return false;
  return new Date(review.picturesExpireAt).getTime() <= now.getTime();
}

const csvEscape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function buildJudgeMeCsv(reviews: TokopediaReview[], style: NameStyle): string {
  const lines = [
    JUDGEME_COLUMNS.join(","),
    ...reviews.map((r) => {
      const row = toJudgeMeRow(r, style);
      return JUDGEME_COLUMNS.map((c) => csvEscape(row[c])).join(",");
    }),
  ];
  // BOM supaya Excel membuka UTF-8 dengan benar — review Indonesia penuh
  // tanda kutip lengkung dan emoji.
  return "﻿" + lines.join("\r\n");
}

/**
 * Versi TAB untuk ditempel langsung ke Google Sheet.
 *
 * Bukan sekadar kenyamanan: mengunggah berkas ke Google Drive lewat Safari
 * kerap gagal apa pun formatnya, dan menempel tidak melewati pengunggah itu
 * sama sekali. Tab dipilih karena Sheet membagi kolomnya tanpa dialog impor,
 * sementara teks review hampir selalu memuat koma.
 */
export function buildJudgeMeTsv(reviews: TokopediaReview[], style: NameStyle): string {
  const clean = (v: string) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return [
    JUDGEME_COLUMNS.join("\t"),
    ...reviews.map((r) => {
      const row = toJudgeMeRow(r, style);
      return JUDGEME_COLUMNS.map((c) => clean(row[c])).join("\t");
    }),
  ].join("\n");
}

"use client";

import type { Locale } from "../i18n";
import { saveBlobAsFile } from "../download";
import { witaToday } from "../utils";
import {
  JUDGEME_COLUMNS, buildJudgeMeCsv, picturesExpired, toJudgeMeRow,
  type NameStyle,
} from "./judgeme";
import type { TokopediaReview } from "./types";

/* Unduhan hasil tarik review. Semua lewat saveBlobAsFile() — satu jalur yang
   sudah menutup dua celah unduhan khas Safari; jangan buat tautan sendiri. */

/** Nama berkas yang aman dipakai sistem berkas mana pun. */
function slug(s: string): string {
  return (s || "produk").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "produk";
}

/**
 * CSV siap unggah ke wizard import Judge.me — SATU BERKAS PER PRODUK.
 *
 * Wizard Judge.me mengimport satu berkas sebagai satu batch, dan pembatalan
 * hanya bisa se-batch. Memisahkan per produk berarti kesalahan pada satu
 * produk tidak menyeret produk lain ikut dibatalkan — dan berkasnya bisa
 * diunggah bertahap, satu per satu, sambil diperiksa hasilnya.
 *
 * Berkas diunduh berurutan dengan jeda: browser memperlakukan beberapa
 * unduhan beruntun sebagai perilaku mencurigakan dan diam-diam membatalkan
 * sebagiannya kalau dipicu serentak.
 */
export async function exportJudgeMeCsv(reviews: TokopediaReview[], style: NameStyle): Promise<number> {
  if (!reviews.length) return 0;

  const perProduk = new Map<string, TokopediaReview[]>();
  for (const r of reviews) {
    const kunci = r.shopifyHandle || r.productId;
    perProduk.set(kunci, [...(perProduk.get(kunci) ?? []), r]);
  }

  const tgl = witaToday();
  let ke = 0;
  for (const [handle, baris] of perProduk) {
    if (ke++) await new Promise((r) => setTimeout(r, 450));
    saveBlobAsFile(
      new Blob([buildJudgeMeCsv(baris, style)], { type: "text/csv;charset=utf-8" }),
      `judgeme-${slug(handle)}-${tgl}.csv`,
    );
  }
  return reviews.length;
}

/** Berapa berkas yang akan terunduh — dipakai layar untuk memberi tahu dulu. */
export function jumlahBerkasEkspor(reviews: TokopediaReview[]): number {
  return new Set(reviews.map((r) => r.shopifyHandle || r.productId)).size;
}

/** Review bintang-saja: tidak bisa diimport, disimpan sebagai catatan. */
export function exportSkippedCsv(reviews: TokopediaReview[], style: NameStyle): number {
  if (!reviews.length) return 0;
  saveBlobAsFile(
    new Blob([buildJudgeMeCsv(reviews, style)], { type: "text/csv;charset=utf-8" }),
    `skipped-no-body-${witaToday()}.csv`,
  );
  return reviews.length;
}

const C = {
  ink: "FF1F3D2B", slate: "FF334155", muted: "FF64748B", line: "FF000000",
  headBg: "FF14532D", headText: "FFFFFFFF", zebra: "FFF8FAF7",
  warn: "FFFDF0C8", warnTx: "FF8A6512",
} as const;

const STR: Record<Locale, { sheet: string; title: string; generated: string; by: string; rows: string }> = {
  id: { sheet: "Review", title: "REVIEW TOKOPEDIA", generated: "Dibuat", by: "Treelogy Workspace", rows: "baris" },
  en: { sheet: "Reviews", title: "TOKOPEDIA REVIEWS", generated: "Generated", by: "Treelogy Workspace", rows: "rows" },
};

/**
 * Salinan Excel untuk dibaca manusia sebelum import — sanity check §9.6.
 *
 * Kolomnya sama persis dengan CSV-nya supaya yang dilihat di layar adalah yang
 * akan diunggah; yang ditambahkan hanya penandaan, bukan isi.
 */
export async function exportReviewsXlsx(
  reviews: TokopediaReview[],
  style: NameStyle,
  locale: Locale,
): Promise<number> {
  if (!reviews.length) return 0;
  const t = STR[locale];

  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Treelogy Workspace";

  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, right: thin, bottom: thin };

  const ws = wb.addWorksheet(t.sheet, {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const widths: Record<string, number> = {
    title: 10, body: 60, rating: 8, review_date: 13, reviewer_name: 16,
    reviewer_email: 14, product_handle: 26, picture_urls: 30, reply: 30,
    curated: 9, cf_variant: 12, cf_source: 24,
  };
  JUDGEME_COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = widths[c] ?? 16));
  const lastCol = JUDGEME_COLUMNS.length;

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = "TREELOGY REGENERATIVE MORINGA";
  title.font = { name: "Calibri", bold: true, size: 16, color: { argb: C.ink } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `${t.title} · ${reviews.length} ${t.rows}`;
  ws.getCell(2, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.slate } };

  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value = `${t.generated} ${witaToday()} · ${t.by}`;
  ws.getCell(3, 1).font = { name: "Calibri", size: 9, color: { argb: C.muted } };

  const HEAD = 5;
  JUDGEME_COLUMNS.forEach((c, i) => {
    const cell = ws.getCell(HEAD, i + 1);
    cell.value = c;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });
  ws.getRow(HEAD).height = 24;

  const now = new Date();
  reviews.forEach((review, i) => {
    const data = toJudgeMeRow(review, style);
    const row = ws.getRow(HEAD + 1 + i);
    const dead = picturesExpired(review, now);
    JUDGEME_COLUMNS.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = data[c];
      cell.border = border;
      cell.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: "top", wrapText: c === "body" || c === "reply" };
      // Tanggal ditulis Judge.me sebagai teks dd/mm/yyyy — biarkan teks, jangan
      // biarkan Excel menafsirkannya jadi tanggal lokal lalu menulisnya ulang.
      if (c === "review_date" || c === "cf_source") cell.numFmt = "@";
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
      // Tautan foto yang sudah lewat masa berlaku: reviewnya tetap masuk, tapi
      // fotonya akan hilang tanpa pesan galat. Ditandai supaya terlihat.
      if (c === "picture_urls" && dead) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warn } };
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.warnTx } };
      }
    });
  });

  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: HEAD, column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  saveBlobAsFile(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `review-marketplace-${witaToday()}.xlsx`,
  );
  return reviews.length;
}

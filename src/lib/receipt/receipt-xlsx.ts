// Ekspor hasil baca resi.
//
// Isinya sengaja hanya TIGA kolom — nomor resi, nama penerima, nomor HP. Itulah
// yang dipakai orang gudang dan tim yang menghubungi pembeli; kolom lain (biaya,
// berat, kode order) hanya menambah lebar tanpa dipakai, dan membuat berkasnya
// sulit ditempel ke sistem lain. Rinciannya tetap ada di layar Periksa hasil.
import type { Locale } from "../i18n";
import { saveBlobAsFile } from "../download";
import { witaToday } from "../utils";

export interface ReceiptExportRow {
  awb: string;
  recipientName: string;
  phone: string;
}

const C = {
  ink: "FF1F3D2B", slate: "FF334155", muted: "FF64748B", line: "FF000000",
  headBg: "FF14532D", headText: "FFFFFFFF", zebra: "FFF8FAF7",
  warn: "FFFDF0C8", warnTx: "FF8A6512",
} as const;

const STR: Record<Locale, Record<string, string>> = {
  id: {
    sheet: "Resi",
    title: "REKAP RESI",
    generated: "Dibuat",
    by: "Treelogy HR",
    awb: "No. Resi",
    name: "Nama Penerima",
    phone: "No. HP",
    rows: "baris",
  },
  en: {
    sheet: "Labels",
    title: "SHIPPING LABEL LIST",
    generated: "Generated",
    by: "Treelogy HR",
    awb: "Tracking No.",
    name: "Recipient Name",
    phone: "Phone",
    rows: "rows",
  },
};

/** Unduh rekap sebagai XLSX. Mengembalikan jumlah baris yang diekspor. */
export async function exportReceiptXlsx(rows: ReceiptExportRow[], locale: Locale): Promise<number> {
  if (!rows.length) return 0;
  const t = STR[locale];

  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Treelogy HR";

  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, right: thin, bottom: thin };

  const ws = wb.addWorksheet(t.sheet, {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const cols: { label: string; width: number; key: keyof ReceiptExportRow }[] = [
    { label: t.awb, width: 24, key: "awb" },
    { label: t.name, width: 32, key: "recipientName" },
    { label: t.phone, width: 20, key: "phone" },
  ];
  const lastCol = cols.length;
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = "TREELOGY REGENERATIVE MORINGA";
  title.font = { name: "Calibri", bold: true, size: 16, color: { argb: C.ink } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `${t.title} · ${rows.length} ${t.rows}`;
  ws.getCell(2, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.slate } };

  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value = `${t.generated} ${witaToday()} · ${t.by}`;
  ws.getCell(3, 1).font = { name: "Calibri", size: 9, color: { argb: C.muted } };

  const HEAD = 5;
  cols.forEach((c, i) => {
    const cell = ws.getCell(HEAD, i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });
  ws.getRow(HEAD).height = 24;

  rows.forEach((r, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    cols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = r[c.key];
      cell.border = border;
      cell.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: "middle" };
      // Resi & nomor HP dibaca digit demi digit saat dicocokkan manual — simpan
      // sebagai teks supaya nol di depan tidak hilang dan tidak jadi notasi ilmiah.
      if (c.key === "awb" || c.key === "phone") {
        cell.numFmt = "@";
        cell.font = { name: "Consolas", size: 10, color: { argb: C.ink } };
      }
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
    });
    // Baris tanpa nomor HP adalah yang masih harus dikejar manual — ditandai
    // supaya terlihat langsung di berkasnya, bukan hanya di layar.
    if (!r.phone) {
      const cell = row.getCell(cols.findIndex((c) => c.key === "phone") + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warn } };
      cell.font = { name: "Consolas", size: 10, bold: true, color: { argb: C.warnTx } };
    }
  });

  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: HEAD, column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  saveBlobAsFile(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `resi-${witaToday()}.xlsx`,
  );
  return rows.length;
}

/** Unduh rekap sebagai CSV — untuk ditempel ke sheet/sistem lain. */
export function exportReceiptCsv(rows: ReceiptExportRow[], locale: Locale): number {
  if (!rows.length) return 0;
  const t = STR[locale];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    [t.awb, t.name, t.phone].map(esc).join(","),
    ...rows.map((r) => [r.awb, r.recipientName, r.phone].map(esc).join(",")),
  ];
  // BOM supaya Excel membuka UTF-8 dengan benar (nama sering beraksen).
  saveBlobAsFile(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `resi-${witaToday()}.csv`);
  return rows.length;
}

/**
 * Salin rekap ke papan klip sebagai TSV, siap ditempel ke Google Sheet.
 *
 * Ini jalan ketiga, dan untuk sebagian orang justru yang paling langsung:
 * mengunggah berkas ke Google Drive lewat Safari kerap gagal ("Upload failed")
 * apa pun format berkasnya — XLSX maupun CSV sama saja, karena yang bermasalah
 * pengunggahnya, bukan berkasnya. Menempel tidak melewati pengunggah itu sama
 * sekali: klik satu sel di Sheet, tekan tempel, selesai.
 *
 * Pemisah TAB dipilih, bukan koma: Google Sheet membagi kolom dari tab tanpa
 * bertanya apa pun, sementara teks berkoma memunculkan dialog impor — dan
 * alamat maupun nama sering memuat koma.
 */
export function copyReceiptRows(rows: ReceiptExportRow[], locale: Locale): string {
  const t = STR[locale];
  // Tab dan baris baru di dalam sel akan merusak bentuk tabelnya saat ditempel.
  const bersih = (v: string) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return [
    [t.awb, t.name, t.phone].join("\t"),
    ...rows.map((r) => [bersih(r.awb), bersih(r.recipientName), bersih(r.phone)].join("\t")),
  ].join("\n");
}

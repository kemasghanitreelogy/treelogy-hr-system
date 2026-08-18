// Ekspor hasil baca resi — satu sheet rincian, mengikuti gaya ekspor modul lain
// (ExcelJS di-import dinamis supaya tidak membebani bundle halaman).
import type { Locale } from "../i18n";
import { witaToday } from "../utils";

export interface ReceiptExportRow {
  page: number;
  /** Nama berkas asal — penting saat satu rekap berasal dari banyak unggahan. */
  sourceFile: string;
  pageInFile: number;
  courier: string;
  awb: string;
  phone: string;
  recipientName: string;
  recipientAddress: string;
  orderCode: string;
  serviceCode: string;
  shippingCost: string;
  weight: string;
  paymentMethod: string;
  item: string;
  shipDate: string;
  /** "Shopify" atau "Manual / WA". */
  source: string;
  order: string;
  verified: boolean;
}

const C = {
  ink: "FF1F3D2B", slate: "FF334155", muted: "FF64748B", line: "FF000000",
  headBg: "FF14532D", headText: "FFFFFFFF", zebra: "FFF8FAF7",
  ok: "FFCDEAD2", okTx: "FF166534", warn: "FFFDF0C8", warnTx: "FF8A6512",
} as const;

const STR: Record<Locale, Record<string, string>> = {
  id: {
    sheet: "Resi", title: "REKAP RESI — KURIR · AWB · NO. HP",
    generated: "Dibuat", by: "Treelogy HR",
    page: "No", sourceFile: "Berkas", pageInFile: "Hal", courier: "Kurir", awb: "AWB / Resi", phone: "No. HP",
    name: "Penerima", address: "Alamat", orderCode: "Kode Order", service: "Layanan",
    cost: "Biaya", weight: "Berat", pay: "Bayar", item: "Barang", shipDate: "Tgl Kirim",
    source: "Sumber HP", order: "Order Shopify", verified: "Diperiksa",
    yes: "Ya", no: "Belum",
  },
  en: {
    sheet: "Labels", title: "SHIPPING LABEL REPORT — COURIER · AWB · PHONE",
    generated: "Generated", by: "Treelogy HR",
    page: "No", sourceFile: "File", pageInFile: "Pg", courier: "Courier", awb: "AWB", phone: "Phone",
    name: "Recipient", address: "Address", orderCode: "Order Code", service: "Service",
    cost: "Cost", weight: "Weight", pay: "Payment", item: "Item", shipDate: "Ship Date",
    source: "Phone Source", order: "Shopify Order", verified: "Verified",
    yes: "Yes", no: "Not yet",
  },
};

function stamp(): string {
  return witaToday();
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const cols: { label: string; width: number; key: keyof ReceiptExportRow }[] = [
    { label: t.page, width: 6, key: "page" },
    { label: t.sourceFile, width: 26, key: "sourceFile" },
    { label: t.pageInFile, width: 6, key: "pageInFile" },
    { label: t.courier, width: 14, key: "courier" },
    { label: t.awb, width: 20, key: "awb" },
    { label: t.phone, width: 16, key: "phone" },
    { label: t.name, width: 24, key: "recipientName" },
    { label: t.address, width: 46, key: "recipientAddress" },
    { label: t.source, width: 13, key: "source" },
    { label: t.order, width: 12, key: "order" },
    { label: t.orderCode, width: 18, key: "orderCode" },
    { label: t.service, width: 10, key: "serviceCode" },
    { label: t.cost, width: 12, key: "shippingCost" },
    { label: t.weight, width: 10, key: "weight" },
    { label: t.pay, width: 12, key: "paymentMethod" },
    { label: t.item, width: 16, key: "item" },
    { label: t.shipDate, width: 12, key: "shipDate" },
    { label: t.verified, width: 11, key: "verified" },
  ];
  const lastCol = cols.length;
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = "TREELOGY REGENERATIVE MORINGA";
  title.font = { name: "Calibri", bold: true, size: 16, color: { argb: C.ink } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `${t.title} · ${rows.length}`;
  ws.getCell(2, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.slate } };

  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value = `${t.generated} ${stamp()} · ${t.by}`;
  ws.getCell(3, 1).font = { name: "Calibri", size: 9, color: { argb: C.muted } };

  const HEAD = 5;
  cols.forEach((c, i) => {
    const cell = ws.getCell(HEAD, i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  ws.getRow(HEAD).height = 24;

  rows.forEach((r, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    cols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const raw = r[c.key];
      cell.value = c.key === "verified" ? (r.verified ? t.yes : t.no) : (raw as string | number);
      cell.border = border;
      cell.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: "top", wrapText: c.key === "recipientAddress" };
      // Nomor resi & HP dibaca digit demi digit saat dicocokkan manual —
      // biarkan sebagai teks agar nol di depan tidak hilang.
      if (c.key === "awb" || c.key === "phone") {
        cell.numFmt = "@";
        cell.font = { name: "Consolas", size: 10, color: { argb: C.ink } };
      }
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
    });
    // Baris tanpa nomor HP adalah yang masih harus dikejar manual — ditandai
    // supaya terlihat langsung di file, bukan hanya di layar.
    const sourceCell = row.getCell(cols.findIndex((c) => c.key === "source") + 1);
    const ok = !!r.phone;
    sourceCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ok ? C.ok : C.warn } };
    sourceCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: ok ? C.okTx : C.warnTx } };
  });

  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: HEAD, column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `resi-${stamp()}.xlsx`,
  );
  return rows.length;
}

/** Unduh rekap sebagai CSV — untuk ditempel ke sheet/tool lain. */
export function exportReceiptCsv(rows: ReceiptExportRow[], locale: Locale): number {
  if (!rows.length) return 0;
  const t = STR[locale];
  const cols: [string, (r: ReceiptExportRow) => string | number][] = [
    [t.page, (r) => r.page],
    [t.sourceFile, (r) => r.sourceFile],
    [t.pageInFile, (r) => r.pageInFile],
    [t.courier, (r) => r.courier],
    [t.awb, (r) => r.awb],
    [t.phone, (r) => r.phone],
    [t.name, (r) => r.recipientName],
    [t.address, (r) => r.recipientAddress],
    [t.source, (r) => r.source],
    [t.order, (r) => r.order],
    [t.orderCode, (r) => r.orderCode],
    [t.service, (r) => r.serviceCode],
    [t.cost, (r) => r.shippingCost],
    [t.weight, (r) => r.weight],
    [t.pay, (r) => r.paymentMethod],
    [t.item, (r) => r.item],
    [t.shipDate, (r) => r.shipDate],
    [t.verified, (r) => (r.verified ? t.yes : t.no)],
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    cols.map(([label]) => esc(label)).join(","),
    ...rows.map((r) => cols.map(([, get]) => esc(get(r))).join(",")),
  ];
  // BOM supaya Excel membuka UTF-8 dengan benar (nama & alamat sering beraksen).
  saveBlob(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `resi-${stamp()}.csv`);
  return rows.length;
}

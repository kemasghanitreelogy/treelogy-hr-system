// XLSX export untuk Inventaris — satu sheet rincian per barang + satu sheet
// ringkasan per kategori & per status. Pola & palet sama dengan ekspor
// perjalanan dinas/absensi supaya semua berkas terasa satu keluarga.
// ExcelJS di-import dinamis (hanya dimuat saat pengguna menekan Ekspor).
import type { InventoryItem } from "./types";
import type { Locale } from "./i18n";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  COMPANY_LABEL,
  CONDITION_LABEL,
  STATUSES,
  STATUS_LABEL,
  itemValue,
} from "./inventory";
import { witaToday } from "./utils";
import { saveBlobAsFile } from "./download";

export interface InventoryXlsxOptions {
  items: InventoryItem[];
  /** employee id → nama, untuk kolom pemegang. */
  employeeNames: Map<string, string>;
  locale: Locale;
  title?: string;
}

const C = {
  ink: "FF1F3D2B",
  slate: "FF334155",
  muted: "FF64748B",
  line: "FF000000",
  headBg: "FF14532D",
  headText: "FFFFFFFF",
  zebra: "FFF8FAF7",
  good: "FFCDEAD2",
  goodTx: "FF166534",
  warn: "FFFBE8B0",
  warnTx: "FF92600A",
  bad: "FFF6C7C3",
  badTx: "FFB91C1C",
  totalBg: "FFEAF2E8",
} as const;

const STR: Record<
  Locale,
  {
    sheetDetail: string; sheetSummary: string; title: string;
    generated: (d: string) => string; count: (n: number) => string;
    no: string; code: string; name: string; company: string; category: string;
    brand: string; serial: string; qty: string; unit: string; condition: string;
    status: string; location: string; holder: string; purchaseDate: string;
    price: string; value: string; note: string; updated: string;
    grandTotal: string; byCategory: string; byStatus: string;
    sumItems: string; sumUnits: string; sumValue: string;
  }
> = {
  id: {
    sheetDetail: "Inventaris", sheetSummary: "Ringkasan", title: "DAFTAR INVENTARIS",
    generated: (d) => `Dibuat ${d} · Treelogy Workspace`, count: (n) => `${n} barang`,
    no: "No", code: "Kode aset", name: "Nama barang", company: "Company", category: "Kategori",
    brand: "Merk", serial: "No. seri", qty: "Jumlah", unit: "Satuan", condition: "Kondisi",
    status: "Status", location: "Lokasi", holder: "Pemegang", purchaseDate: "Tgl beli",
    price: "Harga satuan", value: "Nilai aset", note: "Catatan", updated: "Terakhir diubah",
    grandTotal: "TOTAL", byCategory: "Per kategori", byStatus: "Per status",
    sumItems: "Jumlah barang", sumUnits: "Jumlah unit", sumValue: "Nilai aset",
  },
  en: {
    sheetDetail: "Inventory", sheetSummary: "Summary", title: "INVENTORY LIST",
    generated: (d) => `Generated ${d} · Treelogy Workspace`, count: (n) => `${n} items`,
    no: "No", code: "Asset code", name: "Item name", company: "Company", category: "Category",
    brand: "Brand", serial: "Serial no.", qty: "Qty", unit: "Unit", condition: "Condition",
    status: "Status", location: "Location", holder: "Holder", purchaseDate: "Purchase date",
    price: "Unit price", value: "Asset value", note: "Note", updated: "Last updated",
    grandTotal: "TOTAL", byCategory: "By category", byStatus: "By status",
    sumItems: "Items", sumUnits: "Units", sumValue: "Asset value",
  },
};

const RP = '"Rp"#,##0';

const CONDITION_FILL: Record<InventoryItem["condition"], { bg: string; tx: string }> = {
  baik: { bg: C.good, tx: C.goodTx },
  perlu_servis: { bg: C.warn, tx: C.warnTx },
  rusak: { bg: C.bad, tx: C.badTx },
  hilang: { bg: C.bad, tx: C.badTx },
};

/**
 * Bangun & unduh berkas .xlsx. Mengembalikan jumlah baris yang diekspor (0 =
 * tidak ada data, pemanggil menampilkan pesan, berkas tidak dibuat).
 */
export async function exportInventoryXlsx(opts: InventoryXlsxOptions): Promise<number> {
  const { locale, employeeNames } = opts;
  const t = STR[locale];
  const rows = opts.items.slice().sort((a, b) => a.code.localeCompare(b.code));
  if (rows.length === 0) return 0;

  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Treelogy Workspace";

  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, right: thin, bottom: thin };

  /* ══════════════════ Sheet 1 — rincian ══════════════════ */
  const ws = wb.addWorksheet(t.sheetDetail, {
    views: [{ state: "frozen", ySplit: 5, xSplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const cols: { label: string; width: number; money?: boolean; num?: boolean; wrap?: boolean }[] = [
    { label: t.no, width: 5, num: true },
    { label: t.code, width: 16 },
    { label: t.name, width: 30, wrap: true },
    { label: t.company, width: 16 },
    { label: t.category, width: 26 },
    { label: t.brand, width: 16 },
    { label: t.serial, width: 16 },
    { label: t.qty, width: 8, num: true },
    { label: t.unit, width: 9 },
    { label: t.condition, width: 13 },
    { label: t.status, width: 12 },
    { label: t.location, width: 20 },
    { label: t.holder, width: 22 },
    { label: t.purchaseDate, width: 12 },
    { label: t.price, width: 16, money: true },
    { label: t.value, width: 17, money: true },
    { label: t.note, width: 30, wrap: true },
    { label: t.updated, width: 12 },
  ];
  const lastCol = cols.length;
  const COL_COND = 10;
  const COL_QTY = 8;
  const COL_VALUE = 16;
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  // ── Blok judul ──
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = (opts.title ?? "TREELOGY REGENERATIVE MORINGA").toUpperCase();
  title.font = { name: "Calibri", bold: true, size: 16, color: { argb: C.ink } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  const sub = ws.getCell(2, 1);
  sub.value = `${t.title} · ${t.count(rows.length)}`;
  sub.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.slate } };

  ws.mergeCells(3, 1, 3, lastCol);
  const meta = ws.getCell(3, 1);
  meta.value = t.generated(witaToday());
  meta.font = { name: "Calibri", size: 9, color: { argb: C.muted } };

  // ── Header tabel (baris 5) ──
  const HEAD = 5;
  cols.forEach((c, i) => {
    const cell = ws.getCell(HEAD, i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  ws.getRow(HEAD).height = 28;

  rows.forEach((r, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    const values: (string | number)[] = [
      i + 1,
      r.code,
      r.name,
      `${r.company} — ${COMPANY_LABEL[locale][r.company]}`,
      CATEGORY_LABEL[locale][r.category],
      r.brand ?? "",
      r.serialNo ?? "",
      r.quantity,
      r.unit,
      CONDITION_LABEL[locale][r.condition],
      STATUS_LABEL[locale][r.status],
      r.location ?? "",
      r.assignedTo ? (employeeNames.get(r.assignedTo) ?? "") : "",
      r.purchaseDate ?? "",
      r.purchasePrice,
      itemValue(r),
      r.note ?? "",
      r.updatedAt ? r.updatedAt.slice(0, 10) : "",
    ];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      const col = cols[ci];
      cell.value = v;
      cell.border = border;
      cell.font = { name: "Calibri", size: 10, color: { argb: C.slate } };
      cell.alignment = { vertical: "middle", wrapText: !!col.wrap };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
      if (col.money) { cell.numFmt = RP; cell.alignment = { ...cell.alignment, horizontal: "right" }; }
      if (col.num) cell.alignment = { ...cell.alignment, horizontal: "center" };
    });
    // Kondisi diberi warna agar barang bermasalah terbaca sekilas.
    const cond = row.getCell(COL_COND);
    const f = CONDITION_FILL[r.condition];
    cond.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f.bg } };
    cond.font = { name: "Calibri", bold: true, size: 10, color: { argb: f.tx } };
    cond.alignment = { horizontal: "center", vertical: "middle" };
    row.height = 20;
  });

  // ── Baris TOTAL ──
  const totalRow = HEAD + 1 + rows.length;
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(totalRow, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
    cell.border = border;
  }
  ws.mergeCells(totalRow, 1, totalRow, COL_QTY - 1);
  const lbl = ws.getCell(totalRow, 1);
  lbl.value = t.grandTotal;
  lbl.alignment = { horizontal: "right", vertical: "middle" };
  const qtyCell = ws.getCell(totalRow, COL_QTY);
  qtyCell.value = rows.reduce((s, r) => s + r.quantity, 0);
  qtyCell.alignment = { horizontal: "center", vertical: "middle" };
  const valCell = ws.getCell(totalRow, COL_VALUE);
  valCell.value = rows.reduce((s, r) => s + itemValue(r), 0);
  valCell.numFmt = RP;
  valCell.alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(totalRow).height = 22;

  // Filter otomatis pada header → bisa disaring langsung di Excel.
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: totalRow - 1, column: lastCol } };

  /* ══════════════════ Sheet 2 — ringkasan ══════════════════ */
  const ws2 = wb.addWorksheet(t.sheetSummary);
  [32, 16, 14, 20].forEach((w, i) => (ws2.getColumn(i + 1).width = w));

  ws2.mergeCells(1, 1, 1, 4);
  const t2 = ws2.getCell(1, 1);
  t2.value = `${t.title} — ${t.sheetSummary}`;
  t2.font = { name: "Calibri", bold: true, size: 14, color: { argb: C.ink } };
  ws2.mergeCells(2, 1, 2, 4);
  ws2.getCell(2, 1).value = t.generated(witaToday());
  ws2.getCell(2, 1).font = { name: "Calibri", size: 10, color: { argb: C.muted } };

  const head2 = (r: number, labels: string[]) => {
    labels.forEach((l, i) => {
      const c = ws2.getCell(r, i + 1);
      c.value = l;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
      c.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = border;
    });
  };
  const dataRow = (r: number, vals: (string | number)[], bold = false) => {
    vals.forEach((v, i) => {
      const c = ws2.getCell(r, i + 1);
      c.value = v;
      c.border = border;
      c.font = { name: "Calibri", bold, size: 10, color: { argb: bold ? C.ink : C.slate } };
      if (bold) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
      if (i === 3) { c.numFmt = RP; c.alignment = { horizontal: "right" }; }
      else if (typeof v === "number") c.alignment = { horizontal: "center" };
    });
  };
  const agg = (sub: InventoryItem[]): (string | number)[] => [
    sub.length,
    sub.reduce((s, r) => s + r.quantity, 0),
    sub.reduce((s, r) => s + itemValue(r), 0),
  ];

  // Ditulis berurutan ke bawah; baris berikutnya dihitung dari yang sudah ada.
  let r = 4;
  const section = <K extends string>(heading: string, colLabel: string, keys: K[], label: (k: K) => string, pick: (i: InventoryItem) => K) => {
    ws2.mergeCells(r, 1, r, 4);
    ws2.getCell(r, 1).value = heading;
    ws2.getCell(r, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
    r++;
    head2(r++, [colLabel, t.sumItems, t.sumUnits, t.sumValue]);
    for (const k of keys) {
      const sub2 = rows.filter((i) => pick(i) === k);
      if (sub2.length > 0) dataRow(r++, [label(k), ...agg(sub2)]);
    }
    dataRow(r++, [t.grandTotal, ...agg(rows)], true);
    r++;
  };
  section(t.byCategory, t.category, CATEGORIES, (k) => `${k} — ${CATEGORY_LABEL[locale][k]}`, (i) => i.category);
  section(t.byStatus, t.status, STATUSES, (k) => STATUS_LABEL[locale][k], (i) => i.status);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveBlobAsFile(blob, `inventaris-${witaToday()}.xlsx`);
  return rows.length;
}

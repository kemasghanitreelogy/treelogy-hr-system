// XLSX export untuk Pengajuan Pembayaran — sheet rincian + sheet ringkasan.
// ExcelJS di-import dinamis agar tidak membebani bundle halaman.
import type { PaymentFlow, PaymentRequest } from "./types";
import type { Locale } from "./i18n";
import { APPROVAL_LABEL, DEPT_LABEL, FLOW_LABEL, KIND_LABEL } from "./payment-request";
import { witaToday } from "./utils";
import { saveBlobAsFile } from "./download";

/** Baris + tautan berkas yang sudah ditandatangani server (bisa dibuka siapa pun). */
export interface PaymentRow extends PaymentRequest {
  invoiceUrls?: string[];
  approvalUrl?: string;
}

/** Jalur yang diekspor: satu jalur saja, atau keduanya. */
export type FlowFilter = PaymentFlow | "all";

export interface PaymentXlsxOptions {
  requests: PaymentRow[];
  /** null = semua tanggal. Disaring menurut TANGGAL PENGAJUAN. */
  from: string | null;
  to: string | null;
  /** Reimburse biasa saja, dinas saja, atau semuanya. */
  flow: FlowFilter;
  locale: Locale;
  title?: string;
}

const C = {
  ink: "FF1F3D2B", slate: "FF334155", muted: "FF64748B", line: "FF000000",
  headBg: "FF14532D", headText: "FFFFFFFF", zebra: "FFF8FAF7",
  ok: "FFCDEAD2", okTx: "FF166534", bad: "FFF6C7C3", badTx: "FFB91C1C",
  totalBg: "FFEAF2E8",
} as const;

const RP = '"Rp"#,##0';

const STR: Record<Locale, Record<string, string>> = {
  id: {
    sheetDetail: "Pengajuan Pembayaran", sheetSummary: "Ringkasan",
    title: "REKAP PENGAJUAN PEMBAYARAN",
    periodAll: "Seluruh periode",
    generated: "Dibuat", by: "Treelogy HR",
    no: "No", submitted: "Waktu ajukan", dept: "Departemen", requester: "Pengaju",
    email: "Email", kind: "Jenis", flow: "Jalur", approval: "Status persetujuan",
    invoiceDate: "Tgl invoice", desc: "Deskripsi",
    vendor: "Vendor", amount: "Nominal", due: "Jatuh tempo", more: "Detail tambahan",
    files: "Jml lampiran", invoiceLink: "Tautan faktur", approvalLink: "Tautan persetujuan",
    grandTotal: "TOTAL",
    byDept: "Per departemen", byKind: "Per jenis", byFlow: "Per jalur",
    count: "Jumlah", sum: "Total nominal",
    allFlows: "Semua jalur", noApproval: "Tanpa persetujuan",
  },
  en: {
    sheetDetail: "Payment Requests", sheetSummary: "Summary",
    title: "PAYMENT REQUESTS REPORT",
    periodAll: "All periods",
    generated: "Generated", by: "Treelogy HR",
    no: "No", submitted: "Submitted", dept: "Department", requester: "Requester",
    email: "Email", kind: "Type", flow: "Flow", approval: "Approval status",
    invoiceDate: "Invoice date", desc: "Description",
    vendor: "Vendor", amount: "Amount", due: "Due date", more: "More details",
    files: "Files", invoiceLink: "Invoice link", approvalLink: "Approval link",
    grandTotal: "TOTAL",
    byDept: "By department", byKind: "By type", byFlow: "By flow",
    count: "Count", sum: "Total amount",
    allFlows: "All flows", noApproval: "No approval needed",
  },
};

/** Saring menurut TANGGAL PENGAJUAN — itu yang dipakai batas tutup tiap tanggal 28. */
export function filterPaymentRange(rows: PaymentRow[], from: string | null, to: string | null): PaymentRow[] {
  return rows.filter((r) => {
    const hari = (r.submittedAt || "").slice(0, 10);
    return (!from || hari >= from) && (!to || hari <= to);
  });
}

/**
 * Baris yang benar-benar diekspor: rentang tanggal DAN jalur.
 *
 * Dipakai pratinjau maupun penulis berkas, supaya jumlah yang terbaca di layar
 * tidak mungkin berbeda dengan isi file yang terunduh.
 */
export function selectPaymentRows(
  rows: PaymentRow[],
  from: string | null,
  to: string | null,
  flow: FlowFilter,
): PaymentRow[] {
  const seRentang = filterPaymentRange(rows, from, to);
  return flow === "all" ? seRentang : seRentang.filter((r) => r.flow === flow);
}

export async function exportPaymentXlsx(opts: PaymentXlsxOptions): Promise<number> {
  const { from, to, locale, flow } = opts;
  const t = STR[locale];
  const rows = selectPaymentRows(opts.requests, from, to, flow)
    .slice()
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  if (rows.length === 0) return 0;
  const flowLabel = flow === "all" ? t.allFlows : FLOW_LABEL[locale][flow];

  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Treelogy HR";

  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, right: thin, bottom: thin };

  /* ── Sheet 1: rincian ── */
  const ws = wb.addWorksheet(t.sheetDetail, {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const cols: { label: string; width: number; money?: boolean; num?: boolean }[] = [
    { label: t.no, width: 5 },
    { label: t.submitted, width: 18 },
    { label: t.dept, width: 16 },
    { label: t.requester, width: 22 },
    { label: t.email, width: 26 },
    { label: t.kind, width: 20 },
    // Jalur & status persetujuan ikut diekspor walau sedang menyaring satu
    // jalur saja — file yang beredar lepas dari layar harus bisa berdiri
    // sendiri, tanpa perlu mengingat filter apa yang dipakai saat mengunduh.
    { label: t.flow, width: 18 },
    { label: t.approval, width: 18 },
    { label: t.invoiceDate, width: 12 },
    { label: t.desc, width: 38 },
    { label: t.vendor, width: 20 },
    { label: t.amount, width: 16, money: true },
    { label: t.due, width: 12 },
    { label: t.more, width: 24 },
    { label: t.files, width: 8, num: true },
    { label: t.invoiceLink, width: 40 },
    { label: t.approvalLink, width: 40 },
  ];
  const lastCol = cols.length;
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  // Nomor kolom dicari dari label, bukan ditulis tetap: menyisipkan satu kolom
  // saja sudah cukup untuk menggeser sel total & hyperlink ke tempat yang salah.
  const kolom = (label: string) => cols.findIndex((c) => c.label === label) + 1;
  const colAmount = kolom(t.amount);
  const colInvoiceLink = kolom(t.invoiceLink);
  const colApprovalLink = kolom(t.approvalLink);
  const colDesc = kolom(t.desc);
  const colMore = kolom(t.more);

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = (opts.title ?? "TREELOGY REGENERATIVE MORINGA").toUpperCase();
  title.font = { name: "Calibri", bold: true, size: 16, color: { argb: C.ink } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value =
    `${t.title} · ${from && to ? `${from} — ${to}` : t.periodAll} · ${flowLabel}`;
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
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  ws.getRow(HEAD).height = 26;

  rows.forEach((r, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    const values: (string | number)[] = [
      i + 1,
      r.submittedAt ? r.submittedAt.slice(0, 19).replace("T", " ") : "",
      DEPT_LABEL[locale][r.department],
      r.requesterName,
      r.email,
      KIND_LABEL[locale][r.kind] + (r.kind === "other" && r.kindOther ? `: ${r.kindOther}` : ""),
      FLOW_LABEL[locale][r.flow],
      // Reimburse biasa tidak melewati antrean persetujuan; menuliskan
      // "Disetujui" di sana akan terbaca seolah ada yang menyetujuinya.
      r.flow === "dinas" ? APPROVAL_LABEL[locale][r.approvalStatus] : t.noApproval,
      r.invoiceDate ?? "",
      r.description,
      r.vendorName ?? "",
      r.totalAmount,
      r.dueDate ?? "",
      r.moreDetails ?? "",
      (r.invoicePaths ?? []).length,
      (r.invoiceUrls ?? []).join("\n"),
      r.approvalUrl ?? "",
    ];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.border = border;
      cell.font = { name: "Calibri", size: 10, color: { argb: C.slate } };
      cell.alignment = { vertical: "middle", wrapText: ci + 1 === colDesc || ci + 1 === colMore };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
      if (cols[ci].money) { cell.numFmt = RP; cell.alignment = { ...cell.alignment, horizontal: "right" }; }
      if (cols[ci].num) cell.alignment = { ...cell.alignment, horizontal: "center" };
    });
    // Tautan dibuat benar-benar bisa diklik di Excel, bukan sekadar teks panjang.
    const inv = (r.invoiceUrls ?? [])[0];
    if (inv) row.getCell(colInvoiceLink).value = { text: `${(r.invoicePaths ?? []).length} berkas`, hyperlink: inv };
    if (r.approvalUrl) row.getCell(colApprovalLink).value = { text: "Buka", hyperlink: r.approvalUrl };
    for (const c of [colInvoiceLink, colApprovalLink]) {
      const cell = row.getCell(c);
      if (typeof cell.value === "object") {
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF1D4ED8" }, underline: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }
    row.height = 20;
  });

  const totalRow = HEAD + 1 + rows.length;
  ws.mergeCells(totalRow, 1, totalRow, colAmount - 1);
  const lbl = ws.getCell(totalRow, 1);
  lbl.value = t.grandTotal;
  lbl.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
  lbl.alignment = { horizontal: "right", vertical: "middle" };
  lbl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
  lbl.border = border;
  const totalCell = ws.getCell(totalRow, colAmount);
  totalCell.value = rows.reduce((s, r) => s + r.totalAmount, 0);
  totalCell.numFmt = RP;
  totalCell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
  totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
  totalCell.alignment = { horizontal: "right", vertical: "middle" };
  totalCell.border = border;
  for (let c = colAmount + 1; c <= lastCol; c++) {
    const cell = ws.getCell(totalRow, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
    cell.border = border;
  }
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: totalRow - 1, column: lastCol } };

  /* ── Sheet 2: ringkasan ── */
  const ws2 = wb.addWorksheet(t.sheetSummary);
  [26, 12, 20].forEach((w, i) => (ws2.getColumn(i + 1).width = w));
  ws2.mergeCells(1, 1, 1, 3);
  ws2.getCell(1, 1).value = `${t.title} — ${t.sheetSummary}`;
  ws2.getCell(1, 1).font = { name: "Calibri", bold: true, size: 14, color: { argb: C.ink } };
  ws2.mergeCells(2, 1, 2, 3);
  ws2.getCell(2, 1).value = `${from && to ? `${from} — ${to}` : t.periodAll} · ${flowLabel}`;
  ws2.getCell(2, 1).font = { name: "Calibri", size: 10, color: { argb: C.muted } };

  const head2 = (r: number, labels: string[]) =>
    labels.forEach((l, i) => {
      const c = ws2.getCell(r, i + 1);
      c.value = l;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
      c.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = border;
    });
  const dataRow = (r: number, v: (string | number)[], tebal = false) =>
    v.forEach((x, i) => {
      const c = ws2.getCell(r, i + 1);
      c.value = x;
      c.border = border;
      c.font = { name: "Calibri", size: 10, bold: tebal, color: { argb: tebal ? C.ink : C.slate } };
      if (i === 2) { c.numFmt = RP; c.alignment = { horizontal: "right" }; }
      if (i === 1) c.alignment = { horizontal: "center" };
      if (tebal) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
    });

  const kelompok = (ambil: (r: PaymentRow) => string) => {
    const m = new Map<string, { n: number; total: number }>();
    for (const r of rows) {
      const k = ambil(r);
      const cur = m.get(k) ?? { n: 0, total: 0 };
      cur.n++; cur.total += r.totalAmount;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };

  let baris = 4;
  ws2.getCell(baris, 1).value = t.byDept;
  ws2.getCell(baris, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
  baris++;
  head2(baris, [t.dept, t.count, t.sum]); baris++;
  for (const [k, v] of kelompok((r) => DEPT_LABEL[locale][r.department])) {
    dataRow(baris, [k, v.n, v.total]); baris++;
  }
  dataRow(baris, [t.grandTotal, rows.length, rows.reduce((s, r) => s + r.totalAmount, 0)], true);
  baris += 3;

  ws2.getCell(baris, 1).value = t.byKind;
  ws2.getCell(baris, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
  baris++;
  head2(baris, [t.kind, t.count, t.sum]); baris++;
  for (const [k, v] of kelompok((r) => KIND_LABEL[locale][r.kind])) {
    dataRow(baris, [k, v.n, v.total]); baris++;
  }

  // Rekap per jalur hanya bermakna saat keduanya ikut terekspor.
  if (flow === "all") {
    baris += 3;
    ws2.getCell(baris, 1).value = t.byFlow;
    ws2.getCell(baris, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
    baris++;
    head2(baris, [t.flow, t.count, t.sum]); baris++;
    for (const [k, v] of kelompok((r) => FLOW_LABEL[locale][r.flow])) {
      dataRow(baris, [k, v.n, v.total]); baris++;
    }
  }

  /* ── Unduh ── */
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  // Jalur ikut ke nama berkas: mengunduh biasa lalu dinas di hari yang sama
  // tidak boleh menghasilkan dua file bernama sama di folder Unduhan.
  const namaJalur = flow === "all" ? "" : `-${flow}`;
  const namaBerkas = from && to
    ? `pengajuan-pembayaran${namaJalur}-${from}_${to}.xlsx`
    : `pengajuan-pembayaran${namaJalur}-semua-${witaToday()}.xlsx`;
  saveBlobAsFile(blob, namaBerkas);
  return rows.length;
}

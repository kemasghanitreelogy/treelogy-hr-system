// XLSX export untuk Perjalanan Dinas — satu sheet rincian + satu sheet ringkasan.
// ExcelJS di-import dinamis agar tidak membebani bundle halaman (hanya dimuat
// saat pengguna benar-benar menekan Ekspor).
import type { TravelRequest } from "./types";
import type { Locale } from "./i18n";
import { TRANSPORT_LABEL } from "./travel";
import { witaToday } from "./utils";
import { saveBlobAsFile } from "./download";

export interface TravelXlsxEmp {
  id: string;
  name: string;
}

export interface TravelXlsxOptions {
  requests: TravelRequest[];
  employees: TravelXlsxEmp[];
  /** null = semua tanggal (tanpa penyaringan). */
  from: string | null;
  to: string | null;
  locale: Locale;
  title?: string;
}

// Palet sama dengan ekspor absensi supaya kedua berkas terasa satu keluarga.
const C = {
  ink: "FF1F3D2B",
  slate: "FF334155",
  muted: "FF64748B",
  line: "FF000000",
  headBg: "FF14532D",
  headText: "FFFFFFFF",
  zebra: "FFF8FAF7",
  approved: "FFCDEAD2",
  approvedTx: "FF166534",
  pending: "FFFBE8B0",
  pendingTx: "FF92600A",
  rejected: "FFF6C7C3",
  rejectedTx: "FFB91C1C",
  totalBg: "FFEAF2E8",
} as const;

const STR: Record<
  Locale,
  {
    sheetDetail: string; sheetSummary: string; title: string;
    periodAll: string; period: (a: string, b: string) => string;
    generated: (d: string) => string;
    no: string; requestedAt: string; employee: string; jobTitle: string;
    destination: string; purpose: string; depart: string; ret: string; days: string;
    transport: string; lodging: string; yes: string; no2: string;
    costTransport: string; costLodging: string; costPerDiem: string; costOther: string;
    total: string; advance: string; status: string; approver: string; remarks: string;
    grandTotal: string;
    sumStatus: string; sumCount: string; sumDays: string; sumTotal: string; sumAdvance: string;
    sPending: string; sApproved: string; sRejected: string;
    byEmployee: string; all: string;
  }
> = {
  id: {
    sheetDetail: "Perjalanan Dinas", sheetSummary: "Ringkasan", title: "REKAP PERJALANAN DINAS",
    periodAll: "Seluruh periode", period: (a, b) => `Periode ${a} s/d ${b}`,
    generated: (d) => `Dibuat ${d} · Treelogy Workspace`,
    no: "No", requestedAt: "Tgl ajukan", employee: "Karyawan", jobTitle: "Jabatan",
    destination: "Tujuan", purpose: "Keperluan", depart: "Berangkat", ret: "Kembali", days: "Lama (hari)",
    transport: "Moda transportasi", lodging: "Perlu penginapan", yes: "Ya", no2: "Tidak",
    costTransport: "Biaya transportasi", costLodging: "Biaya penginapan", costPerDiem: "Biaya uang harian", costOther: "Biaya lain-lain",
    total: "Total estimasi", advance: "Uang muka", status: "Status", approver: "Disetujui oleh", remarks: "Catatan",
    grandTotal: "TOTAL",
    sumStatus: "Status", sumCount: "Jumlah pengajuan", sumDays: "Total hari", sumTotal: "Total estimasi", sumAdvance: "Total uang muka",
    sPending: "Menunggu", sApproved: "Disetujui", sRejected: "Ditolak",
    byEmployee: "Per karyawan", all: "Semua",
  },
  en: {
    sheetDetail: "Business Travel", sheetSummary: "Summary", title: "BUSINESS TRAVEL REPORT",
    periodAll: "All periods", period: (a, b) => `Period ${a} to ${b}`,
    generated: (d) => `Generated ${d} · Treelogy Workspace`,
    no: "No", requestedAt: "Submitted", employee: "Employee", jobTitle: "Job title",
    destination: "Destination", purpose: "Purpose", depart: "Departure", ret: "Return", days: "Days",
    transport: "Mode of transport", lodging: "Lodging needed", yes: "Yes", no2: "No",
    costTransport: "Cost: transport", costLodging: "Cost: lodging", costPerDiem: "Cost: per diem", costOther: "Cost: other",
    total: "Estimated total", advance: "Advance", status: "Status", approver: "Approved by", remarks: "Remarks",
    grandTotal: "TOTAL",
    sumStatus: "Status", sumCount: "Requests", sumDays: "Total days", sumTotal: "Estimated total", sumAdvance: "Total advance",
    sPending: "Pending", sApproved: "Approved", sRejected: "Rejected",
    byEmployee: "By employee", all: "All",
  },
};

const RP = '"Rp"#,##0';

/** Saring menurut TANGGAL BERANGKAT — itu yang dipakai keuangan untuk membukukan. */
export function filterByRange(rows: TravelRequest[], from: string | null, to: string | null): TravelRequest[] {
  return rows.filter((r) => (!from || r.departureDate >= from) && (!to || r.departureDate <= to));
}

/**
 * Bangun & unduh berkas .xlsx. Mengembalikan jumlah baris yang diekspor (0 =
 * tidak ada data, pemanggil menampilkan pesan, berkas tidak dibuat).
 */
export async function exportTravelXlsx(opts: TravelXlsxOptions): Promise<number> {
  const { from, to, locale } = opts;
  const t = STR[locale];
  const rows = filterByRange(opts.requests, from, to).slice().sort(
    (a, b) => a.departureDate.localeCompare(b.departureDate) || a.destination.localeCompare(b.destination),
  );
  if (rows.length === 0) return 0;

  const nameOf = new Map(opts.employees.map((e) => [e.id, e.name]));
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Treelogy Workspace";

  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, right: thin, bottom: thin };

  /* ══════════════════ Sheet 1 — rincian ══════════════════ */
  const ws = wb.addWorksheet(t.sheetDetail, {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const cols: { key: string; label: string; width: number; money?: boolean; num?: boolean }[] = [
    { key: "no", label: t.no, width: 5 },
    { key: "req", label: t.requestedAt, width: 12 },
    { key: "emp", label: t.employee, width: 24 },
    { key: "job", label: t.jobTitle, width: 18 },
    { key: "dest", label: t.destination, width: 26 },
    { key: "purpose", label: t.purpose, width: 34 },
    { key: "dep", label: t.depart, width: 12 },
    { key: "ret", label: t.ret, width: 12 },
    { key: "days", label: t.days, width: 10, num: true },
    { key: "trans", label: t.transport, width: 16 },
    { key: "lodge", label: t.lodging, width: 11 },
    { key: "c1", label: t.costTransport, width: 15, money: true },
    { key: "c2", label: t.costLodging, width: 15, money: true },
    { key: "c3", label: t.costPerDiem, width: 15, money: true },
    { key: "c4", label: t.costOther, width: 14, money: true },
    { key: "tot", label: t.total, width: 17, money: true },
    { key: "adv", label: t.advance, width: 15, money: true },
    { key: "status", label: t.status, width: 12 },
    { key: "appr", label: t.approver, width: 20 },
    { key: "note", label: t.remarks, width: 30 },
  ];
  const lastCol = cols.length;
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  // ── Blok judul ──
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = (opts.title ?? "TREELOGY REGENERATIVE MORINGA").toUpperCase();
  title.font = { name: "Calibri", bold: true, size: 16, color: { argb: C.ink } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  const sub = ws.getCell(2, 1);
  sub.value = `${t.title} · ${from && to ? t.period(from, to) : t.periodAll}`;
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

  const statusText: Record<TravelRequest["status"], string> = {
    pending: t.sPending, approved: t.sApproved, rejected: t.sRejected,
  };
  const statusFill: Record<TravelRequest["status"], { bg: string; tx: string }> = {
    pending: { bg: C.pending, tx: C.pendingTx },
    approved: { bg: C.approved, tx: C.approvedTx },
    rejected: { bg: C.rejected, tx: C.rejectedTx },
  };

  rows.forEach((r, i) => {
    const rowIdx = HEAD + 1 + i;
    const row = ws.getRow(rowIdx);
    const values: (string | number)[] = [
      i + 1,
      r.requestedAt ? r.requestedAt.slice(0, 10) : "",
      nameOf.get(r.employeeId) ?? "—",
      r.jobTitle,
      r.destination,
      r.purpose,
      r.departureDate,
      r.returnDate,
      r.durationDays,
      TRANSPORT_LABEL[locale][r.transport] + (r.transport === "other" && r.transportOther ? ` (${r.transportOther})` : ""),
      r.accommodationRequired ? t.yes : t.no2,
      r.costTransport, r.costAccommodation, r.costPerDiem, r.costOther,
      r.costTotal,
      r.advanceRequired ? r.advanceAmount : 0,
      statusText[r.status],
      r.approver ?? r.hrApprover ?? "",
      r.status === "rejected" ? (r.rejectionReason ?? "") : (r.remarks ?? ""),
    ];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.border = border;
      cell.font = { name: "Calibri", size: 10, color: { argb: C.slate } };
      cell.alignment = { vertical: "middle", wrapText: ci === 5 || ci === 19 };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
      const col = cols[ci];
      if (col.money) { cell.numFmt = RP; cell.alignment = { ...cell.alignment, horizontal: "right" }; }
      if (col.num) cell.alignment = { ...cell.alignment, horizontal: "center" };
    });
    // Status diberi warna agar terbaca sekilas, sama seperti di aplikasi.
    const st = row.getCell(18);
    const f = statusFill[r.status];
    st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f.bg } };
    st.font = { name: "Calibri", bold: true, size: 10, color: { argb: f.tx } };
    st.alignment = { horizontal: "center", vertical: "middle" };
    row.height = 20;
  });

  // ── Baris TOTAL ──
  const totalRow = HEAD + 1 + rows.length;
  ws.mergeCells(totalRow, 1, totalRow, 11);
  const lbl = ws.getCell(totalRow, 1);
  lbl.value = t.grandTotal;
  lbl.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
  lbl.alignment = { horizontal: "right", vertical: "middle" };
  lbl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
  lbl.border = border;

  const sums = [
    rows.reduce((s, r) => s + r.costTransport, 0),
    rows.reduce((s, r) => s + r.costAccommodation, 0),
    rows.reduce((s, r) => s + r.costPerDiem, 0),
    rows.reduce((s, r) => s + r.costOther, 0),
    rows.reduce((s, r) => s + r.costTotal, 0),
    rows.reduce((s, r) => s + (r.advanceRequired ? r.advanceAmount : 0), 0),
  ];
  sums.forEach((v, i) => {
    const cell = ws.getCell(totalRow, 12 + i);
    cell.value = v;
    cell.numFmt = RP;
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = border;
  });
  for (let c = 18; c <= lastCol; c++) {
    const cell = ws.getCell(totalRow, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
    cell.border = border;
  }
  ws.getRow(totalRow).height = 22;

  // Filter otomatis pada header → HR bisa menyaring langsung di Excel.
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: totalRow - 1, column: lastCol } };

  /* ══════════════════ Sheet 2 — ringkasan ══════════════════ */
  const ws2 = wb.addWorksheet(t.sheetSummary);
  [22, 18, 14, 20, 20].forEach((w, i) => (ws2.getColumn(i + 1).width = w));

  ws2.mergeCells(1, 1, 1, 5);
  const t2 = ws2.getCell(1, 1);
  t2.value = `${t.title} — ${t.sheetSummary}`;
  t2.font = { name: "Calibri", bold: true, size: 14, color: { argb: C.ink } };
  ws2.mergeCells(2, 1, 2, 5);
  ws2.getCell(2, 1).value = from && to ? t.period(from, to) : t.periodAll;
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
  const dataRow = (r: number, vals: (string | number)[], money: number[]) => {
    vals.forEach((v, i) => {
      const c = ws2.getCell(r, i + 1);
      c.value = v;
      c.border = border;
      c.font = { name: "Calibri", size: 10, color: { argb: C.slate } };
      if (money.includes(i)) { c.numFmt = RP; c.alignment = { horizontal: "right" }; }
      else if (typeof v === "number") c.alignment = { horizontal: "center" };
    });
  };

  head2(4, [t.sumStatus, t.sumCount, t.sumDays, t.sumTotal, t.sumAdvance]);
  (["pending", "approved", "rejected"] as const).forEach((st, i) => {
    const sub2 = rows.filter((r) => r.status === st);
    dataRow(5 + i, [
      statusText[st], sub2.length,
      sub2.reduce((s, r) => s + r.durationDays, 0),
      sub2.reduce((s, r) => s + r.costTotal, 0),
      sub2.reduce((s, r) => s + (r.advanceRequired ? r.advanceAmount : 0), 0),
    ], [3, 4]);
  });
  dataRow(8, [t.grandTotal, rows.length,
    rows.reduce((s, r) => s + r.durationDays, 0),
    rows.reduce((s, r) => s + r.costTotal, 0),
    rows.reduce((s, r) => s + (r.advanceRequired ? r.advanceAmount : 0), 0)], [3, 4]);
  for (let c = 1; c <= 5; c++) {
    const cell = ws2.getCell(8, c);
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.ink } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
  }

  // Per karyawan
  ws2.mergeCells(10, 1, 10, 5);
  ws2.getCell(10, 1).value = t.byEmployee;
  ws2.getCell(10, 1).font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
  head2(11, [t.employee, t.sumCount, t.sumDays, t.sumTotal, t.sumAdvance]);

  const perEmp = new Map<string, { n: number; days: number; total: number; adv: number }>();
  for (const r of rows) {
    const k = nameOf.get(r.employeeId) ?? "—";
    const cur = perEmp.get(k) ?? { n: 0, days: 0, total: 0, adv: 0 };
    cur.n++; cur.days += r.durationDays; cur.total += r.costTotal;
    cur.adv += r.advanceRequired ? r.advanceAmount : 0;
    perEmp.set(k, cur);
  }
  [...perEmp.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([nama, v], i) => dataRow(12 + i, [nama, v.n, v.days, v.total, v.adv], [3, 4]));

  /* ══════════════════ Unduh ══════════════════ */
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const namaBerkas = from && to
    ? `perjalanan-dinas-${from}_${to}.xlsx`
    : `perjalanan-dinas-semua-${witaToday()}.xlsx`;
  saveBlobAsFile(blob, namaBerkas);
  return rows.length;
}

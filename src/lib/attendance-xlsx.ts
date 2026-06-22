// XLSX export untuk Rekap Absensi — layout grid kalender bulanan (karyawan × tanggal)
// dengan sel berwarna, legend, Overtime List, dan sheet Ringkasan.
// Dipakai oleh attendance-view.tsx. ExcelJS di-import dinamis agar tidak membebani
// bundle utama (hanya dimuat saat user menekan "Ekspor rekap").
import type { AttendanceRecord, AttendanceStatus, Team } from "./types";
import { TEAM_META } from "./constants";
import { monthLabel, witaToday } from "./utils";
import type { Locale } from "./i18n";

export interface XlsxEmp {
  id: string;
  nik: string;
  name: string;
  team: Team;
  position: string;
  workDays: number[]; // 0=Min..6=Sab
}
export interface XlsxOvertime {
  employeeId: string;
  date: string; // YYYY-MM-DD
  hours: number;
}

export interface ExportXlsxOptions {
  records: AttendanceRecord[];
  employees: XlsxEmp[];
  overtime: XlsxOvertime[];
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  team: "all" | Team;
  locale: Locale;
  title?: string;
}

// ── Palet warna (ARGB "FFRRGGBB") — lembut, kontras cukup, jelas dibaca ──────────
const C = {
  ink: "FF1F3D2B", // hijau tua (judul)
  slate: "FF334155", // teks utama
  muted: "FF64748B", // teks sekunder
  line: "FF000000", // garis grid (hitam, tegas)
  headBg: "FF14532D", // header gelap
  headText: "FFFFFFFF",
  zebra: "FFF8FAF7", // baris selang-seling
  present: "FFCDEAD2", // hijau — hadir
  presentTx: "FF166534",
  late: "FFFBE8B0", // amber muda — telat (keluarga "hadir" + penanda T)
  lateTx: "FF92600A",
  sick: "FFFAD9A6", // oranye lembut — sakit
  sickTx: "FF9A3412",
  leave: "FFCBDFF7", // biru lembut — cuti/izin
  leaveTx: "FF1E40AF",
  absent: "FFF6C7C3", // merah lembut — alpa
  absentTx: "FFB91C1C",
  off: "FFEDF0F3", // abu — libur / bukan jadwal
  weekendHd: "FFFCEBEA", // header akhir pekan
  weekendTx: "FFB91C1C",
} as const;

const WD: Record<Locale, string[]> = {
  id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const STR: Record<Locale, Record<string, string>> = {
  id: {
    site: "Umalas Site · Premium Organic Moringa",
    recap: "Rekap Absensi",
    generated: "Dibuat",
    team: "Tim",
    all: "Semua tim",
    no: "No",
    name: "Nama",
    legend: "Keterangan",
    present: "Hadir",
    late: "Terlambat",
    sick: "Sakit",
    leave: "Cuti / Izin",
    absent: "Alpa",
    off: "Libur / Bukan jadwal",
    overtimeList: "Daftar Lembur",
    otHours: "Lembur (jam)",
    summary: "Ringkasan",
    workdays: "Hari kerja",
    attendPct: "Kehadiran",
    totalOt: "Total lembur (jam)",
    sheetRecap: "Rekap",
  },
  en: {
    site: "Umalas Site · Premium Organic Moringa",
    recap: "Attendance Recap",
    generated: "Generated",
    team: "Team",
    all: "All teams",
    no: "No",
    name: "Name",
    legend: "Legend",
    present: "Present",
    late: "Late",
    sick: "Sick",
    leave: "Leave",
    absent: "Absent",
    off: "Off / Not scheduled",
    overtimeList: "Overtime List",
    otHours: "Overtime (h)",
    summary: "Summary",
    workdays: "Workdays",
    attendPct: "Attendance",
    totalOt: "Total overtime (h)",
    sheetRecap: "Recap",
  },
};

// Visual untuk tiap status di sel grid: { fill, letter, textColor }
function cellStyle(status: AttendanceStatus | "future"): { fill?: string; letter?: string; tx?: string } {
  switch (status) {
    case "present": return { fill: C.present };
    case "late": return { fill: C.late, letter: "T", tx: C.lateTx };
    case "sick": return { fill: C.sick, letter: "S", tx: C.sickTx };
    case "leave": return { fill: C.leave, letter: "C", tx: C.leaveTx };
    case "absent": return { fill: C.absent, letter: "A", tx: C.absentTx };
    case "off":
    case "holiday": return { fill: C.off };
    default: return {}; // future / no-data → kosong
  }
}

// Iterasi tanggal [from..to] inklusif (UTC agar tidak bergeser timezone).
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    const dt = new Date(cur);
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`);
    cur += 86_400_000;
  }
  return out;
}
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export async function exportAttendanceXlsx(opts: ExportXlsxOptions): Promise<number> {
  const { records, overtime, from, to, team, locale } = opts;
  const t = STR[locale];
  const today = witaToday();

  const employees = opts.employees
    .filter((e) => team === "all" || e.team === team)
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  if (employees.length === 0) return 0;

  const days = dateRange(from, to);
  // index attendance: empId|date -> record
  const recMap = new Map<string, AttendanceRecord>();
  for (const r of records) recMap.set(`${r.employeeId}|${r.date}`, r);
  // overtime jam per karyawan dalam rentang
  const otByEmp = new Map<string, number>();
  for (const o of overtime) {
    if (o.date < from || o.date > to) continue;
    otByEmp.set(o.employeeId, (otByEmp.get(o.employeeId) ?? 0) + (Number(o.hours) || 0));
  }

  // Browser build (lihat field "browser" di exceljs/package.json) — webpack memilihnya
  // untuk bundle client; fallback `?? mod` menjaga andai interop tidak menyetel default.
  const mod = await import("exceljs");
  const ExcelJS = (mod.default ?? (mod as unknown as typeof mod.default));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Treelogy HR";

  // ════════════════════════════════ Sheet: Rekap ════════════════════════════════
  const FIRST_DAY_COL = 4; // A=No, B=Nama, C=Tim, D.. = hari
  const lastCol = FIRST_DAY_COL + days.length - 1;
  const ws = wb.addWorksheet(t.sheetRecap, {
    views: [{ state: "frozen", xSplit: 3, ySplit: 8 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const thin = { style: "thin" as const, color: { argb: C.line } };
  const border = { top: thin, left: thin, right: thin, bottom: thin };

  // Lebar kolom
  ws.getColumn(1).width = 4.5;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 9;
  for (let c = FIRST_DAY_COL; c <= lastCol; c++) ws.getColumn(c).width = 4.2;

  // ── Blok judul ──
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = (opts.title ?? "TREELOGY REGENERATIVE MORINGA").toUpperCase();
  title.font = { name: "Calibri", bold: true, size: 16, color: { argb: C.ink } };
  title.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  const sub = ws.getCell(2, 1);
  const teamLabel = team === "all" ? t.all : TEAM_META[team].label;
  sub.value = `${t.recap} · ${monthLabel(from.slice(0, 7), locale)} · ${teamLabel}`;
  sub.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.slate } };

  ws.mergeCells(3, 1, 3, lastCol);
  const meta = ws.getCell(3, 1);
  meta.value = `${t.site}   ·   ${t.generated}: ${today}`;
  meta.font = { name: "Calibri", size: 9, color: { argb: C.muted } };

  // ── Legend (baris 5) ──
  const legendItems: [string, string, string?, string?][] = [
    [t.present, C.present],
    [t.late, C.late, "T", C.lateTx],
    [t.sick, C.sick, "S", C.sickTx],
    [t.leave, C.leave, "C", C.leaveTx],
    [t.absent, C.absent, "A", C.absentTx],
    [t.off, C.off],
  ];
  ws.getCell(5, 1).value = `${t.legend}:`;
  ws.getCell(5, 1).font = { name: "Calibri", bold: true, size: 9, color: { argb: C.muted } };
  let lc = 2;
  for (const [label, fill, letter, tx] of legendItems) {
    const sw = ws.getCell(5, lc);
    sw.value = letter ?? "";
    sw.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    sw.font = { name: "Calibri", bold: true, size: 9, color: { argb: tx ?? C.slate } };
    sw.alignment = { horizontal: "center", vertical: "middle" };
    sw.border = border;
    const lab = ws.getCell(5, lc + 1);
    lab.value = label;
    lab.font = { name: "Calibri", size: 9, color: { argb: C.slate } };
    lab.alignment = { horizontal: "left", vertical: "middle" };
    lc += 3; // swatch + label + jeda
  }
  ws.getRow(5).height = 16;

  // ── Header tabel (baris 7 = hari, baris 8 = tanggal) ──
  const HEAD_DOW = 7, HEAD_NUM = 8;
  // kolom No / Nama / Tim — merge dua baris header
  for (const [col, label] of [[1, t.no], [2, t.name], [3, t.team]] as const) {
    ws.mergeCells(HEAD_DOW, col, HEAD_NUM, col);
    const cell = ws.getCell(HEAD_DOW, col);
    cell.value = label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
    cell.alignment = { horizontal: col === 2 ? "left" : "center", vertical: "middle" };
    cell.border = border;
  }
  days.forEach((d, i) => {
    const col = FIRST_DAY_COL + i;
    const wknd = dow(d) === 0 || dow(d) === 6;
    const wcell = ws.getCell(HEAD_DOW, col);
    wcell.value = WD[locale][dow(d)];
    wcell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: wknd ? C.weekendHd : C.headBg } };
    wcell.font = { name: "Calibri", bold: true, size: 8, color: { argb: wknd ? C.weekendTx : C.headText } };
    wcell.alignment = { horizontal: "center", vertical: "middle" };
    wcell.border = border;
    const ncell = ws.getCell(HEAD_NUM, col);
    ncell.value = Number(d.slice(8, 10));
    ncell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: wknd ? C.weekendHd : C.headBg } };
    ncell.font = { name: "Calibri", bold: true, size: 9, color: { argb: wknd ? C.weekendTx : C.headText } };
    ncell.alignment = { horizontal: "center", vertical: "middle" };
    ncell.border = border;
  });
  ws.getRow(HEAD_DOW).height = 14;
  ws.getRow(HEAD_NUM).height = 16;

  // ── Baris karyawan ──
  let row = HEAD_NUM + 1;
  employees.forEach((e, idx) => {
    const zebra = idx % 2 === 1;
    const rNo = ws.getCell(row, 1);
    rNo.value = idx + 1;
    rNo.alignment = { horizontal: "center", vertical: "middle" };
    rNo.font = { name: "Calibri", size: 9, color: { argb: C.muted } };
    const rName = ws.getCell(row, 2);
    rName.value = e.name;
    rName.alignment = { horizontal: "left", vertical: "middle" };
    rName.font = { name: "Calibri", size: 10, color: { argb: C.slate } };
    const rTeam = ws.getCell(row, 3);
    rTeam.value = TEAM_META[e.team].label;
    rTeam.alignment = { horizontal: "center", vertical: "middle" };
    rTeam.font = { name: "Calibri", size: 8, color: { argb: C.muted } };
    for (const c of [1, 2, 3]) {
      const cell = ws.getCell(row, c);
      cell.border = border;
      if (zebra && !cell.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
    }

    days.forEach((d, i) => {
      const col = FIRST_DAY_COL + i;
      const cell = ws.getCell(row, col);
      const rec = recMap.get(`${e.id}|${d}`);
      let st: AttendanceStatus | "future";
      if (rec) st = rec.status;
      else if (!e.workDays.includes(dow(d))) st = "off"; // bukan jadwal (libur / akhir pekan)
      else if (d > today) st = "future"; // belum terjadi
      else st = "off"; // hari kerja tanpa catatan = libur nasional (data sudah ter-sync)
      const s = cellStyle(st);
      if (s.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.fill } };
      else if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
      if (s.letter) cell.value = s.letter;
      cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: s.tx ?? C.slate } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = border;
    });
    ws.getRow(row).height = 18;
    row++;
  });

  // ── Overtime List ──
  row += 1;
  const otRows = employees
    .map((e) => ({ e, h: otByEmp.get(e.id) ?? 0 }))
    .filter((x) => x.h > 0)
    .sort((a, b) => b.h - a.h);
  if (otRows.length > 0) {
    ws.mergeCells(row, 1, row, 3);
    const otTitle = ws.getCell(row, 1);
    otTitle.value = t.overtimeList;
    otTitle.font = { name: "Calibri", bold: true, size: 11, color: { argb: C.ink } };
    otTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    otTitle.alignment = { horizontal: "left", vertical: "middle" };
    row++;
    for (const [c, label] of [[1, t.no], [2, t.name], [3, t.otHours]] as const) {
      const cell = ws.getCell(row, c);
      cell.value = label;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
      cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: C.headText } };
      cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
      cell.border = border;
    }
    row++;
    otRows.forEach((x, i) => {
      ws.getCell(row, 1).value = i + 1;
      ws.getCell(row, 1).alignment = { horizontal: "center" };
      ws.getCell(row, 2).value = x.e.name;
      ws.getCell(row, 3).value = x.h;
      ws.getCell(row, 3).alignment = { horizontal: "center" };
      for (const c of [1, 2, 3]) {
        const cell = ws.getCell(row, c);
        cell.border = border;
        cell.font = { name: "Calibri", size: 10, color: { argb: C.slate } };
      }
      row++;
    });
  }

  // ════════════════════════════════ Sheet: Ringkasan ════════════════════════════
  const sum = wb.addWorksheet(t.summary, { views: [{ state: "frozen", ySplit: 1 }] });
  const sumHead = [t.no, t.name, t.team, t.present, t.late, t.sick, t.leave, t.absent, t.workdays, t.attendPct, t.totalOt];
  sumHead.forEach((h, i) => {
    const cell = sum.getCell(1, i + 1);
    cell.value = h;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headBg } };
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: C.headText } };
    cell.alignment = { horizontal: i <= 2 ? "left" : "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  sum.getColumn(1).width = 4.5;
  sum.getColumn(2).width = 26;
  sum.getColumn(3).width = 10;
  for (let c = 4; c <= 11; c++) sum.getColumn(c).width = 10;
  sum.getRow(1).height = 28;

  employees.forEach((e, idx) => {
    let present = 0, late = 0, sick = 0, leave = 0, absent = 0, workdays = 0;
    for (const d of days) {
      const rec = recMap.get(`${e.id}|${d}`);
      const scheduled = e.workDays.includes(dow(d));
      if (rec) {
        if (rec.status === "present") { present++; workdays++; }
        else if (rec.status === "late") { present++; late++; workdays++; }
        else if (rec.status === "sick") { sick++; workdays++; }
        else if (rec.status === "leave") { leave++; workdays++; }
        else if (rec.status === "absent") { absent++; workdays++; }
      } else if (scheduled && d <= today) {
        // hari kerja terjadwal tanpa catatan dianggap libur nasional (tidak dihitung)
      }
    }
    const pct = workdays > 0 ? Math.round((present / workdays) * 100) : 0;
    const r = idx + 2;
    const vals: (string | number)[] = [
      idx + 1, e.name, TEAM_META[e.team].label, present, late, sick, leave, absent, workdays,
      `${pct}%`, otByEmp.get(e.id) ?? 0,
    ];
    vals.forEach((v, i) => {
      const cell = sum.getCell(r, i + 1);
      cell.value = v;
      cell.alignment = { horizontal: i <= 1 ? "left" : "center", vertical: "middle" };
      cell.font = { name: "Calibri", size: 10, color: { argb: C.slate } };
      cell.border = border;
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
    });
  });

  // ── Unduh ──
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fname = from.slice(0, 7) === to.slice(0, 7)
    ? `rekap-absensi-${from.slice(0, 7)}.xlsx`
    : `rekap-absensi-${from}_${to}.xlsx`;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
  return employees.length;
}

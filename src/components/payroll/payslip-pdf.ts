import type { Employee, Payslip } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { jkkRate } from "@/lib/payroll";
import { monthLabel, rupiah } from "@/lib/utils";

// Palet mengikuti tema app (bark/forest/cream).
const BARK: [number, number, number] = [38, 51, 30];
const FOREST: [number, number, number] = [61, 90, 46];
const SOFT: [number, number, number] = [233, 240, 216];
const INK: [number, number, number] = [40, 40, 36];
const MUTED: [number, number, number] = [120, 120, 110];
const LINE: [number, number, number] = [225, 222, 210];

/** rupiah() memakai NBSP dari Intl — ganti spasi biasa agar aman di font PDF. */
const rp = (v: number) => rupiah(v).replace(/ /g, " ");

/**
 * Slip gaji sebagai dokumen PDF (A4), digenerate di sisi klien.
 * jspdf di-import dinamis supaya tidak ikut bundle awal halaman.
 */
async function buildPayslipPdf(slip: Payslip, emp: Employee) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const W = 210;
  const M = 18; // margin kiri/kanan
  const R = W - M; // tepi kanan
  let y = 0;

  // ---- Header brand ----
  doc.setFillColor(...BARK);
  doc.rect(0, 0, W, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("TREELOGY", M, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 190);
  doc.text("HR SYSTEM", M, 21);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("SLIP GAJI", R, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 190);
  doc.text(monthLabel(slip.period), R, 21, { align: "right" });

  // ---- Identitas karyawan ----
  y = 46;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(emp.name, M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${emp.nik} · ${emp.position} · ${TEAM_META[emp.team].label}`, M, y + 5.5);
  doc.text(`${slip.presentDays} hari hadir dari ${slip.workingDays} hari kerja`, R, y + 5.5, { align: "right" });

  // ---- Kotak gaji bersih ----
  y += 12;
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, R - M, 18, 3, 3, "F");
  doc.setTextColor(...FOREST);
  doc.setFontSize(9);
  doc.text("Gaji bersih (take-home pay)", M + 6, y + 7.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(rp(slip.netPay), R - 6, y + 12, { align: "right" });
  y += 27;

  // ---- Helper baris & seksi ----
  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(title.toUpperCase(), M, y);
    y += 2;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, y, R, y);
    y += 6;
  };
  const line = (label: string, value: string, opts: { strong?: boolean; muted?: boolean } = {}) => {
    doc.setFont("helvetica", opts.strong ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(...(opts.muted ? MUTED : opts.strong ? INK : INK));
    doc.text(label, M, y);
    doc.text(value, R, y, { align: "right" });
    y += 6.5;
  };
  const note = (text: string) => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(text, M, y);
    y += 7;
  };

  // ---- Pendapatan ----
  const b = slip.bpjs;
  section("Pendapatan");
  line("Gaji pokok", rp(slip.baseSalary));
  line("Tunjangan tetap", rp(slip.allowance));
  line("Bruto", rp(slip.grossPay), { strong: true });
  note("Lembur dibayar terpisah lewat modul Lembur — tidak termasuk slip ini.");

  // ---- Potongan BPJS ----
  section("Potongan — BPJS (karyawan)");
  line("BPJS Kesehatan (1%)", `- ${rp(b.kesEmployee)}`);
  line("JHT (2%)", `- ${rp(b.jhtEmployee)}`);
  line("Jaminan Pensiun (1%)", `- ${rp(b.jpEmployee)}`);
  line("Total BPJS karyawan", `- ${rp(slip.bpjsEmployeeTotal)}`, { strong: true });
  y += 2;

  // ---- Potongan pajak ----
  section("Potongan — Pajak");
  line(`PPh 21 (TER ${emp.ptkp})`, `- ${rp(slip.pph21)}`);
  y += 2;

  // ---- Ditanggung perusahaan ----
  section("Ditanggung perusahaan (informasi)");
  line("BPJS Kesehatan (4%)", rp(b.kesEmployer), { muted: true });
  line("JHT (3.7%)", rp(b.jhtEmployer), { muted: true });
  line("Jaminan Pensiun (2%)", rp(b.jpEmployer), { muted: true });
  line(`JKK (${(jkkRate(emp.team) * 100).toFixed(2)}%)`, rp(b.jkk), { muted: true });
  line("JKM (0.3%)", rp(b.jkm), { muted: true });
  y += 3;

  // ---- Take-home pay box ----
  doc.setDrawColor(...FOREST);
  doc.setLineWidth(0.5);
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, R - M, 14, 3, 3, "FD");
  doc.setTextColor(...FOREST);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TAKE-HOME PAY", M + 6, y + 9);
  doc.setFontSize(13);
  doc.text(rp(slip.netPay), R - 6, y + 9, { align: "right" });
  y += 22;

  // ---- Footer ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(`Transfer ke ${emp.bankName} · ${emp.bankAccount}`, W / 2, y, { align: "center" });
  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  const generated = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  }).format(new Date());
  doc.text(`Dokumen dihasilkan otomatis oleh Treelogy HR System · ${generated} WITA`, W / 2, y, { align: "center" });

  return doc;
}

/** Unduh slip sebagai file PDF. */
export async function downloadPayslipPdf(slip: Payslip, emp: Employee): Promise<void> {
  const doc = await buildPayslipPdf(slip, emp);
  doc.save(`slip-gaji-${emp.nik}-${slip.period}.pdf`);
}

/**
 * Blob URL untuk pratinjau PDF di iframe — pemanggil WAJIB
 * URL.revokeObjectURL() saat pratinjau ditutup.
 */
export async function payslipPdfPreviewUrl(slip: Payslip, emp: Employee): Promise<string> {
  const doc = await buildPayslipPdf(slip, emp);
  return URL.createObjectURL(doc.output("blob"));
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, FileDown, Loader2, Printer, X } from "lucide-react";
import type { Employee, Payslip } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { monthLabel, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";
import { downloadPayslipPdf, payslipPdfPreviewUrl } from "./payslip-pdf";

const STR: Record<
  Locale,
  {
    pdfDownloaded: string;
    pdfFailed: string;
    previewFailed: string;
    previewPdf: string;
    download: string;
    print: string;
    payslip: string;
    netPay: string;
    attendance: (present: number, working: number) => string;
    earnings: string;
    baseSalary: string;
    fixedAllowance: string;
    gross: string;
    overtimeNote: string;
    overtimeLine: (hours: number) => string;
    absenceLine: (days: number) => string;
    bpjsDeductions: string;
    bpjsKes1: string;
    jht2: string;
    jp1: string;
    bpjsEmployeeTotal: string;
    taxDeductions: string;
    pph21: (ptkp: string) => string;
    employerPaid: string;
    bpjsKes4: string;
    jht37: string;
    jp2: string;
    jkk: (pct: string) => string;
    jkm: string;
    takeHome: string;
    transferTo: (bank: string, account: string) => string;
    closePreview: string;
    previewFallback: string;
  }
> = {
  id: {
    pdfDownloaded: "Slip gaji PDF terunduh ✓",
    pdfFailed: "Gagal membuat PDF. Coba lagi.",
    previewFailed: "Gagal membuat pratinjau PDF. Coba lagi.",
    previewPdf: "Pratinjau PDF",
    download: "Unduh",
    print: "Cetak",
    payslip: "Slip Gaji",
    netPay: "Gaji bersih",
    attendance: (present, working) => `${present} hari hadir dari ${working} hari kerja`,
    earnings: "Pendapatan",
    baseSalary: "Gaji pokok",
    fixedAllowance: "Tunjangan tetap",
    gross: "Total pendapatan",
    overtimeNote: "Lembur yang disetujui pada bulan ini sudah termasuk di gaji.",
    overtimeLine: (hours: number) => `Lembur (${hours} jam)`,
    absenceLine: (days: number) => `Potongan absen (${days} hari)`,
    bpjsDeductions: "Potongan — BPJS (karyawan)",
    bpjsKes1: "BPJS Kesehatan (1%)",
    jht2: "JHT (2%)",
    jp1: "Jaminan Pensiun (1%)",
    bpjsEmployeeTotal: "Total BPJS karyawan",
    taxDeductions: "Potongan — Pajak",
    pph21: (ptkp) => `PPh 21 (TER ${ptkp})`,
    employerPaid: "Ditanggung perusahaan (info)",
    bpjsKes4: "BPJS Kesehatan (4%)",
    jht37: "JHT (3.7%)",
    jp2: "Jaminan Pensiun (2%)",
    jkk: (pct) => `JKK (${pct}%)`,
    jkm: "JKM (0.3%)",
    takeHome: "Take-home pay",
    transferTo: (bank, account) => `Transfer ke ${bank} · ${account}`,
    closePreview: "Tutup pratinjau",
    previewFallback: "Jika pratinjau tidak tampil di browser HP Anda, gunakan tombol Unduh.",
  },
  en: {
    pdfDownloaded: "Payslip PDF downloaded ✓",
    pdfFailed: "Failed to generate PDF. Please try again.",
    previewFailed: "Failed to generate PDF preview. Please try again.",
    previewPdf: "Preview PDF",
    download: "Download",
    print: "Print",
    payslip: "Payslip",
    netPay: "Net pay",
    attendance: (present, working) => `${present} days present of ${working} working days`,
    earnings: "Earnings",
    baseSalary: "Base salary",
    fixedAllowance: "Fixed allowance",
    gross: "Total earnings",
    overtimeNote: "Approved overtime this month is already included in the salary.",
    overtimeLine: (hours: number) => `Overtime (${hours} h)`,
    absenceLine: (days: number) => `Absence deduction (${days} days)`,
    bpjsDeductions: "Deductions — BPJS (employee)",
    bpjsKes1: "BPJS Kesehatan (1%)",
    jht2: "JHT (2%)",
    jp1: "Pension (JP) (1%)",
    bpjsEmployeeTotal: "Total employee BPJS",
    taxDeductions: "Deductions — Tax",
    pph21: (ptkp) => `PPh 21 (TER ${ptkp})`,
    employerPaid: "Employer-paid (info)",
    bpjsKes4: "BPJS Kesehatan (4%)",
    jht37: "JHT (3.7%)",
    jp2: "Pension (JP) (2%)",
    jkk: (pct) => `JKK (${pct}%)`,
    jkm: "JKM (0.3%)",
    takeHome: "Take-home pay",
    transferTo: (bank, account) => `Transfer to ${bank} · ${account}`,
    closePreview: "Close preview",
    previewFallback: "If the preview does not appear in your mobile browser, use the Download button.",
  },
};

export function PayslipDetail({ slip, emp }: { slip: Payslip; emp: Employee }) {
  const toast = useToast();
  const locale = useLocale();
  const t = STR[locale];
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function downloadPdf() {
    setDownloading(true);
    try {
      await downloadPayslipPdf(slip, emp, locale);
      toast.success(t.pdfDownloaded);
    } catch {
      toast.error(t.pdfFailed);
    } finally {
      setDownloading(false);
    }
  }

  async function openPreview() {
    setPreviewing(true);
    try {
      setPreviewUrl(await payslipPdfPreviewUrl(slip, emp, locale));
    } catch {
      toast.error(t.previewFailed);
    } finally {
      setPreviewing(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={emp.name} />
          <div>
            <p className="font-semibold text-ink">{emp.name}</p>
            <p className="text-xs text-faint">{emp.nik} · {emp.position}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={openPreview} disabled={previewing}>
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {t.previewPdf}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {t.download}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} aria-label={t.print}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <PdfPreviewOverlay
        url={previewUrl}
        title={`${t.payslip} · ${emp.name} · ${monthLabel(slip.period, locale)}`}
        onDownload={downloadPdf}
        onClose={closePreview}
      />

      <div className="rounded-2xl bg-bark p-4 text-cream">
        <p className="text-sm text-forest-100/70">{t.netPay} · {monthLabel(slip.period, locale)}</p>
        <p className="font-display text-3xl font-bold">{rupiah(slip.netPay)}</p>
        <p className="mt-1 text-xs text-forest-100/60">
          {t.attendance(slip.presentDays, slip.workingDays)}
        </p>
      </div>

      <Section title={t.earnings}>
        <Line label={t.baseSalary} value={rupiah(slip.baseSalary)} />
        <Line label={t.fixedAllowance} value={rupiah(slip.allowance)} />
        {slip.overtimePay > 0 && <Line label={t.overtimeLine(slip.overtimeHours)} value={rupiah(slip.overtimePay)} />}
        <Line label={t.gross} value={rupiah(slip.grossPay)} strong />
        <p className="pt-1 text-xs text-faint">{t.overtimeNote}</p>
      </Section>

      {slip.absenceDeduction > 0 && (
        <Section title={locale === "en" ? "Deductions" : "Potongan"}>
          <Line label={t.absenceLine(slip.workingDays - slip.presentDays)} value={`- ${rupiah(slip.absenceDeduction)}`} />
        </Section>
      )}

      <div className="flex items-center justify-between rounded-2xl border-2 border-forest-200 bg-[#e9f0d8] px-4 py-3">
        <span className="font-semibold text-forest-700">{t.takeHome}</span>
        <span className="font-display text-xl font-bold text-forest-700">{rupiah(slip.netPay)}</span>
      </div>

      <p className="text-center text-xs text-faint">
        {t.transferTo(emp.bankName, emp.bankAccount)}
      </p>
    </div>
  );
}

/**
 * Pratinjau PDF dalam overlay. Mobile-first: layar penuh di HP (iframe PDF
 * butuh ruang), kartu di tengah pada layar ≥sm. Portal ke body (di atas Sheet,
 * z-[70] vs z-[60]) — ingat: transform pada ancestor merusak position:fixed.
 */
function PdfPreviewOverlay({
  url,
  title,
  onDownload,
  onClose,
}: {
  url: string | null;
  title: string;
  onDownload: () => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!url) return;
    // Capture phase + stopPropagation: Escape menutup pratinjau saja,
    // bukan Sheet slip gaji di belakangnya (listener Sheet di bubble phase).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [url, onClose]);

  if (!url || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-bark/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-0 flex flex-col overflow-hidden bg-cream sm:inset-y-6 sm:left-1/2 sm:right-auto sm:w-[min(760px,92vw)] sm:-translate-x-1/2 sm:rounded-2xl sm:shadow-pop"
      >
        <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</p>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">{t.download}</span>
          </Button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-sand"
            aria-label={t.closePreview}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <iframe src={url} title={title} className="w-full flex-1 border-0 bg-white" />
        <p className="border-t border-line bg-panel px-4 py-2 text-center text-[11px] text-faint sm:hidden">
          {t.previewFallback}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-faint" : "text-muted"}>{label}</span>
      <span className={strong ? "font-semibold text-ink" : muted ? "text-faint" : "font-medium text-ink"}>{value}</span>
    </div>
  );
}

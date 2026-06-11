"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, FileDown, Loader2, Printer, X } from "lucide-react";
import type { Employee, Payslip } from "@/lib/types";
import { jkkRate } from "@/lib/payroll";
import { monthLabel, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { downloadPayslipPdf, payslipPdfPreviewUrl } from "./payslip-pdf";

export function PayslipDetail({ slip, emp }: { slip: Payslip; emp: Employee }) {
  const b = slip.bpjs;
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function downloadPdf() {
    setDownloading(true);
    try {
      await downloadPayslipPdf(slip, emp);
      toast.success("Slip gaji PDF terunduh ✓");
    } catch {
      toast.error("Gagal membuat PDF. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  }

  async function openPreview() {
    setPreviewing(true);
    try {
      setPreviewUrl(await payslipPdfPreviewUrl(slip, emp));
    } catch {
      toast.error("Gagal membuat pratinjau PDF. Coba lagi.");
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
            Pratinjau PDF
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Unduh
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} aria-label="Cetak">
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <PdfPreviewOverlay
        url={previewUrl}
        title={`Slip Gaji · ${emp.name} · ${monthLabel(slip.period)}`}
        onDownload={downloadPdf}
        onClose={closePreview}
      />

      <div className="rounded-2xl bg-bark p-4 text-cream">
        <p className="text-sm text-forest-100/70">Gaji bersih · {monthLabel(slip.period)}</p>
        <p className="font-display text-3xl font-bold">{rupiah(slip.netPay)}</p>
        <p className="mt-1 text-xs text-forest-100/60">
          {slip.presentDays} hari hadir dari {slip.workingDays} hari kerja
        </p>
      </div>

      <Section title="Pendapatan">
        <Line label="Gaji pokok" value={rupiah(slip.baseSalary)} />
        <Line label="Tunjangan tetap" value={rupiah(slip.allowance)} />
        <Line label="Bruto" value={rupiah(slip.grossPay)} strong />
        <p className="pt-1 text-xs text-faint">Lembur dibayar terpisah lewat menu Lembur — tidak termasuk slip ini.</p>
      </Section>

      <Section title="Potongan — BPJS (karyawan)">
        <Line label="BPJS Kesehatan (1%)" value={`- ${rupiah(b.kesEmployee)}`} />
        <Line label="JHT (2%)" value={`- ${rupiah(b.jhtEmployee)}`} />
        <Line label="Jaminan Pensiun (1%)" value={`- ${rupiah(b.jpEmployee)}`} />
        <Line label="Total BPJS karyawan" value={`- ${rupiah(slip.bpjsEmployeeTotal)}`} strong />
      </Section>

      <Section title="Potongan — Pajak">
        <Line label={`PPh 21 (TER ${emp.ptkp})`} value={`- ${rupiah(slip.pph21)}`} />
      </Section>

      <Section title="Ditanggung perusahaan (info)">
        <Line label="BPJS Kesehatan (4%)" value={rupiah(b.kesEmployer)} muted />
        <Line label="JHT (3.7%)" value={rupiah(b.jhtEmployer)} muted />
        <Line label="Jaminan Pensiun (2%)" value={rupiah(b.jpEmployer)} muted />
        <Line label={`JKK (${(jkkRate(emp.team) * 100).toFixed(2)}%)`} value={rupiah(b.jkk)} muted />
        <Line label="JKM (0.3%)" value={rupiah(b.jkm)} muted />
      </Section>

      <div className="flex items-center justify-between rounded-2xl border-2 border-forest-200 bg-[#e9f0d8] px-4 py-3">
        <span className="font-semibold text-forest-700">Take-home pay</span>
        <span className="font-display text-xl font-bold text-forest-700">{rupiah(slip.netPay)}</span>
      </div>

      <p className="text-center text-xs text-faint">
        Transfer ke {emp.bankName} · {emp.bankAccount}
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
            <span className="hidden sm:inline">Unduh</span>
          </Button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-sand"
            aria-label="Tutup pratinjau"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <iframe src={url} title={title} className="w-full flex-1 border-0 bg-white" />
        <p className="border-t border-line bg-panel px-4 py-2 text-center text-[11px] text-faint sm:hidden">
          Jika pratinjau tidak tampil di browser HP Anda, gunakan tombol Unduh.
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

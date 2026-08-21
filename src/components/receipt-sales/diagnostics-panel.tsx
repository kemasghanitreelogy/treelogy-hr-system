"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, ClipboardCopy } from "lucide-react";
import type { Diagnostic } from "@/lib/receipt/browser-ocr";
import { environmentReport } from "@/lib/receipt/browser-ocr";
import type { Locale } from "@/lib/i18n";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    title: "Detail teknis",
    lead: "Catatan kejadian saat membaca berkas. Salin dan kirimkan kalau perlu ditelusuri.",
    show: "Lihat detail",
    hide: "Sembunyikan detail",
    copy: "Salin laporan",
    copied: "Laporan tersalin — tinggal tempel di chat ✓",
    copyFail: "Tidak bisa menyalin otomatis. Blok teksnya lalu salin manual.",
    collecting: "Menyiapkan…",
    events: "kejadian",
    device: "Keterangan perangkat",
  },
  en: {
    title: "Technical details",
    lead: "What happened while reading the files. Copy and send this if it needs investigating.",
    show: "Show details",
    hide: "Hide details",
    copy: "Copy report",
    copied: "Report copied — just paste it in chat ✓",
    copyFail: "Couldn't copy automatically. Select the text and copy it manually.",
    collecting: "Preparing…",
    events: "events",
    device: "Device information",
  },
};

/**
 * Panel diagnosis.
 *
 * Kegagalan di sini terjadi di perangkat orang lain — perangkat yang tidak bisa
 * saya buka konsolnya. Notifikasi sekilas tidak cukup: pesannya hilang sebelum
 * sempat dibaca, apalagi disalin. Jadi kejadiannya dikumpulkan di satu tempat
 * yang tetap, lengkap dengan keterangan perangkat, dan bisa disalin sekali
 * ketuk untuk dikirim.
 */
export function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!diagnostics.length) return null;

  async function salin() {
    setBusy(true);
    try {
      const lingkungan = await environmentReport();
      const isi = [
        "=== Receipt Sales — laporan kejadian ===",
        new Date().toString(),
        "",
        ...diagnostics.map(
          (d, i) => `${i + 1}. [${d.tahap}] ${d.file}\n   ${d.message}\n${d.detail.split("\n").map((l) => "   " + l).join("\n")}`,
        ),
        "",
        "=== " + t.device + " ===",
        lingkungan,
      ].join("\n");

      await navigator.clipboard.writeText(isi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyFail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gold bg-gold-soft/30">
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6512]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {t.title}
              <span className="ml-1.5 font-normal text-[#8a6512]">
                · {diagnostics.length} {t.events}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">{t.lead}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? t.hide : t.show}
          </Button>
          <Button size="sm" onClick={salin} disabled={busy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {busy ? t.collecting : t.copy}
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-2 border-t border-gold/50 px-4 py-3">
          {diagnostics.map((d, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel p-3">
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-ink">
                <span className="rounded-md bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a6512]">
                  {d.tahap}
                </span>
                <span className="min-w-0 truncate font-normal text-muted">{d.file}</span>
              </p>
              <p className="mt-1 break-words text-xs text-ink">{d.message}</p>
              {/* Teks teknis dibiarkan bisa diseleksi & digulir — sebagian orang
                  lebih suka menyalin baris tertentu daripada seluruh laporan. */}
              <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-sand/60 p-2 font-mono text-[10px] leading-relaxed text-muted">
                {d.detail}
              </pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

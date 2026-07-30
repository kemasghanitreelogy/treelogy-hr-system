"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, FileImage, Printer } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { itemQrPayload, qrPngDataUrl, qrSvgMarkup } from "@/lib/qr";
import { useLocale } from "@/components/layout/locale-context";
import { useToast } from "@/components/ui/toast";
import { QrCode } from "./qr-code";
import { downloadInventoryLabels } from "./labels-pdf";

const STR: Record<
  Locale,
  {
    heading: string;
    hint: string;
    png: string;
    svg: string;
    label: string;
    copy: string;
    copied: string;
    copyFailed: string;
    labelBusy: string;
    labelFailed: string;
  }
> = {
  id: {
    heading: "QR barang",
    hint: "Tempel di barang. Dipindai kamera HP → langsung membuka detail ini.",
    png: "PNG",
    svg: "SVG",
    label: "Cetak label",
    copy: "Salin tautan",
    copied: "Tautan disalin ✓",
    copyFailed: "Gagal menyalin tautan.",
    labelBusy: "Menyiapkan…",
    labelFailed: "Gagal membuat label PDF.",
  },
  en: {
    heading: "Item QR",
    hint: "Stick it on the item. Scanned with a phone camera → opens this detail.",
    png: "PNG",
    svg: "SVG",
    label: "Print label",
    copy: "Copy link",
    copied: "Link copied ✓",
    copyFailed: "Failed to copy the link.",
    labelBusy: "Preparing…",
    labelFailed: "Failed to build the label PDF.",
  },
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Panel QR satu barang: pratinjau + empat cara membawanya keluar (PNG, SVG,
 * label PDF siap tempel, dan tautan mentah). Semua dibuat di klien dari kode
 * aset yang sama — tidak ada gambar QR yang disimpan di server.
 */
export function QrPanel({ item }: { item: InventoryItem }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);

  // Origin dibaca dari browser → QR selalu menunjuk deployment yang sedang dipakai.
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const payload = origin ? itemQrPayload(origin, item.code) : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyFailed);
    }
  }

  function downloadPng() {
    const dataUrl = qrPngDataUrl(payload, { scale: 14 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${item.code}.png`;
    a.click();
  }

  function downloadSvg() {
    saveBlob(new Blob([qrSvgMarkup(payload)], { type: "image/svg+xml" }), `qr-${item.code}.svg`);
  }

  async function printLabel() {
    setLabelBusy(true);
    try {
      await downloadInventoryLabels([item], origin, locale);
    } catch {
      toast.error(t.labelFailed);
    } finally {
      setLabelBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-sm font-semibold text-ink">{t.heading}</p>
      <p className="mt-0.5 text-xs text-muted">{t.hint}</p>

      <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {payload ? (
          <QrCode value={payload} size={168} scanline className="shrink-0 ring-1 ring-line" title={`QR ${item.code}`} />
        ) : (
          <div className="h-[168px] w-[168px] shrink-0 animate-pulse rounded-xl bg-sand" />
        )}

        <div className="w-full min-w-0 space-y-2">
          <div className="rounded-xl bg-cream/70 px-3 py-2">
            <p className="font-display text-lg font-bold tracking-tight text-ink tabular-nums">{item.code}</p>
            <p className="mt-0.5 break-all text-[11px] leading-snug text-faint">{payload || "…"}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadPng}
              disabled={!payload}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand/60 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> {t.png}
            </button>
            <button
              onClick={downloadSvg}
              disabled={!payload}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand/60 disabled:opacity-50"
            >
              <FileImage className="h-3.5 w-3.5" /> {t.svg}
            </button>
            <button
              onClick={printLabel}
              disabled={!payload || labelBusy}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand/60 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" /> {labelBusy ? t.labelBusy : t.label}
            </button>
            <button
              onClick={copyLink}
              disabled={!payload}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand/60 disabled:opacity-50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-forest-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t.copied.replace(" ✓", "") : t.copy}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

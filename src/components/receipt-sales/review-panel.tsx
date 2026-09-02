"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Loader2,
  ScanBarcode, ShoppingBag, X,
} from "lucide-react";
import type { LabelRecord } from "@/lib/receipt/label-core";
import type { PageImageStore } from "@/lib/receipt/browser-ocr";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";

export type Edits = Record<number, Record<string, string>>;

/** Isian utama — inilah hasil yang dipakai gudang: kurir, resi, nomor HP. */
export const PRIMARY_FIELDS = [
  "courier", "tracking_number", "phone", "recipient_name", "recipient_address",
] as const;

/** Isian sekunder dari OCR — jarang dipakai, disembunyikan sampai dibutuhkan. */
export const SECONDARY_FIELDS = [
  "order_code", "service_code", "shipping_cost", "weight", "payment_method", "item", "ship_date",
] as const;

export const ALL_FIELDS = [...PRIMARY_FIELDS, ...SECONDARY_FIELDS] as const;

export const FIELD_LABEL: Record<Locale, Record<string, string>> = {
  id: {
    courier: "Kurir",
    tracking_number: "AWB / No. Resi",
    phone: "No. HP",
    recipient_name: "Penerima",
    recipient_address: "Alamat penerima",
    order_code: "Kode order",
    service_code: "Layanan",
    shipping_cost: "Biaya kirim",
    weight: "Berat",
    payment_method: "Pembayaran",
    item: "Barang",
    ship_date: "Tanggal kirim",
  },
  en: {
    courier: "Courier",
    tracking_number: "AWB / Tracking no.",
    phone: "Phone",
    recipient_name: "Recipient",
    recipient_address: "Recipient address",
    order_code: "Order code",
    service_code: "Service",
    shipping_cost: "Shipping cost",
    weight: "Weight",
    payment_method: "Payment",
    item: "Item",
    ship_date: "Ship date",
  },
};

const STR: Record<Locale, Record<string, string>> = {
  id: {
    page: "Halaman",
    fromFile: "dari",
    barcode: "barcode",
    fromPdf: "teks PDF",
    shopify: "Shopify",
    manual: "Manual / WA",
    orderPdf: "Dari PDF pesanan",
    checkingLabel: "Memeriksa di Shopify…",
    verified: "Sudah diperiksa",
    markVerified: "Tandai sudah diperiksa",
    more: "Detail lain dari label",
    less: "Sembunyikan detail lain",
    zoom: "Perbesar gambar label",
    close: "Tutup",
    needsReview: "Perlu dicek",
  },
  en: {
    page: "Page",
    fromFile: "from",
    barcode: "barcode",
    fromPdf: "PDF text",
    shopify: "Shopify",
    manual: "Manual / WA",
    orderPdf: "From order PDF",
    checkingLabel: "Checking in Shopify…",
    verified: "Verified",
    markVerified: "Mark as verified",
    more: "Other details from the label",
    less: "Hide other details",
    zoom: "Zoom label image",
    close: "Close",
    needsReview: "Needs a look",
  },
};

/** Pratinjau label ukuran penuh. Di-portal ke body: induknya memakai transform
 *  (.fade-up/stagger), dan transform mematahkan position:fixed. */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-bark/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-xl shadow-pop" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-panel text-ink shadow-pop transition-colors hover:bg-sand"
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}

/**
 * Pratinjau label yang baru dirender saat kartunya mendekati layar.
 *
 * Dengan ratusan halaman, merender semua pratinjau di depan menghabiskan detik
 * demi detik untuk gambar yang sebagian besar tidak pernah dilihat. Halaman
 * PDF-nya masih terbuka, jadi gambarnya bisa dibuat tepat pada saat dibutuhkan.
 */
function LazyThumb({
  page,
  images,
  alt,
  onOpen,
}: {
  page: number;
  images: PageImageStore | null;
  alt: string;
  onOpen: (src: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !images || src) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        images.get(page).then((url) => {
          if (alive && url) setSrc(url);
        });
      },
      // Mulai merender sedikit sebelum kartunya terlihat, supaya gambarnya
      // sudah siap saat sampai di mata.
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [images, page, src]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => src && onOpen(src)}
      aria-label={alt}
      disabled={!src}
      className="group relative h-28 w-20 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 disabled:cursor-default sm:h-36 sm:w-24"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-5 w-5 text-faint" />
        </span>
      )}
    </button>
  );
}

function SourceBadge({ record, locale }: { record: LabelRecord; locale: Locale }) {
  const t = STR[locale];
  if (record.matchStatus === "shopify") {
    return (
      <Badge tone="matcha" dot>
        <ShoppingBag className="h-3 w-3" /> {t.shopify}
        {record.matchedOrder ? ` ${record.matchedOrder}` : ""}
      </Badge>
    );
  }
  // Packing slip: namanya dan HP-nya tercetak di halaman itu sendiri. Menandai
  // ini "Manual / WA" akan menyuruh orang memeriksa sesuatu yang justru paling
  // pasti di seluruh berkas.
  if (record.matchStatus === "pdf") {
    return (
      <Badge tone="sky" dot>
        <FileText className="h-3 w-3" /> {t.orderPdf}
      </Badge>
    );
  }
  return (
    <Badge tone="gold" dot>
      {t.manual}
    </Badge>
  );
}

function FieldRow({
  fieldKey,
  record,
  value,
  onChange,
  locale,
}: {
  fieldKey: string;
  record: LabelRecord;
  value: string;
  onChange: (v: string) => void;
  locale: Locale;
}) {
  const t = STR[locale];
  const f = record.fields[fieldKey];
  const low = f?.confidence === "low";
  const certain = f?.confidence === "certain";
  const id = `f-${record.page}-${fieldKey}`;
  const mono = fieldKey === "tracking_number" || fieldKey === "phone";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {FIELD_LABEL[locale][fieldKey] ?? fieldKey}
        </label>
        {certain && f?.source === "barcode" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-1.5 py-0.5 text-[10px] font-semibold text-forest-700">
            <ScanBarcode className="h-3 w-3" /> {t.barcode} ✓
          </span>
        )}
        {certain && f?.source === "pdf" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-soft px-1.5 py-0.5 text-[10px] font-semibold text-[#2c5775]">
            <FileText className="h-3 w-3" /> {t.fromPdf} ✓
          </span>
        )}
        {certain && f?.source === "shopify" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f0d8] px-1.5 py-0.5 text-[10px] font-semibold text-forest-700">
            <Check className="h-3 w-3" /> {t.shopify} ✓
          </span>
        )}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 text-sm",
          mono && "font-mono tracking-tight",
          low && "border-gold bg-gold-soft/40 focus:border-gold",
          certain && "border-forest-300",
        )}
      />
      {f?.flag && (
        <p className="flex items-start gap-1 text-[11px] leading-snug text-[#8a6512]">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          {f.flag}
        </p>
      )}
    </div>
  );
}

export function ReviewPanel({
  records,
  images,
  edits,
  verified,
  onEdit,
  onVerify,
  fulfillResult = {},
  checkingPages,
}: {
  records: LabelRecord[];
  /** Sumber pratinjau; null saat batch sudah dilepas. */
  images: PageImageStore | null;
  edits: Edits;
  verified: Record<number, boolean>;
  onEdit: (page: number, key: string, value: string) => void;
  onVerify: (page: number, value: boolean) => void;
  /** Hasil fulfill per halaman — ditempel di kartunya masing-masing. */
  fulfillResult?: Record<number, { ok: boolean; text: string; seq?: number }>;
  /** Halaman yang sedang ditanyakan ke Shopify — fase "memeriksa". */
  checkingPages?: Set<number>;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const [zoom, setZoom] = useState<{ src: string; record: LabelRecord } | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const multiFile = new Set(records.map((r) => r.origin.file)).size > 1;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {records.map((r, i) => {
          const isVerified = !!verified[r.page];
          const flagged = r.needsReview && !isVerified;
          const open = !!expanded[r.page];
          return (
            <section
              key={r.page}
              style={{ ["--i" as string]: Math.min(i, 8) }}
              className={cn(
                "stagger-item overflow-hidden rounded-2xl border bg-panel transition-colors",
                isVerified ? "border-forest-300" : flagged ? "border-gold" : "border-line",
              )}
              aria-label={`${t.page} ${r.page}`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-line bg-cream/50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold text-ink">
                    {t.page} {r.page}
                  </span>
                  {/* Asal halaman hanya berguna saat satu batch berisi beberapa
                      berkas — kalau cuma satu, keterangannya jadi kebisingan. */}
                  {multiFile && (
                    <span className="min-w-0 truncate text-[11px] text-faint" title={r.origin.file}>
                      {t.fromFile} {r.origin.file} · {t.page.toLowerCase()} {r.origin.pageInFile}
                    </span>
                  )}
                  {flagged && (
                    <Badge tone="gold">
                      <AlertTriangle className="h-3 w-3" /> {t.needsReview}
                    </Badge>
                  )}
                </div>
                <SourceBadge record={r} locale={locale} />
              </div>

              {/* Hasil fulfill halaman ini. Ditaruh di kartunya sendiri, bukan
                  hanya sebagai notifikasi sekilas: kalau 3 dari 20 order gagal,
                  yang dibutuhkan adalah tahu YANG MANA. */}
              {/* Fase MEMERIKSA — sheen berjalan selagi potongan halaman ini
                  sedang ditanyakan ke Shopify; berganti badge begitu hasil
                  aslinya pulang. */}
              {!fulfillResult[r.page] && checkingPages?.has(r.page) && (
                <div className="hf-checking mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-forest-700" role="status">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{t.checkingLabel}</span>
                </div>
              )}

              {fulfillResult[r.page] && (
                <div
                  // Jenjang dihitung dari urutan DI DALAM potongannya (modulo 20).
                  // 25 ms × 20 = 0,5 dtk — batas doktrin agar satu gelombang
                  // terbaca sebagai SATU ketukan, gelombang berikut mulai
                  // begitu potongan berikutnya pulang — sapuan yang mengikuti
                  // verifikasi asli, bukan menunggunya.
                  style={{ animationDelay: `${((fulfillResult[r.page].seq ?? 0) % 20) * 25}ms` }}
                  className={cn(
                    "fulfill-pop mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium",
                    fulfillResult[r.page].ok
                      ? "bg-[#e9f0d8] text-forest-700"
                      : "bg-clay-soft text-[#8c3c1f]",
                  )}
                >
                  {fulfillResult[r.page].ok ? (
                    <span className="hf-check-draw mt-0.5 shrink-0">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{fulfillResult[r.page].text}</span>
                </div>
              )}

              <div className="flex gap-3 p-3">
                <LazyThumb
                  page={r.page}
                  images={images}
                  alt={`${t.zoom} — ${t.page} ${r.page}`}
                  onOpen={(src) => setZoom({ src, record: r })}
                />

                <div className="min-w-0 flex-1 space-y-2.5">
                  {PRIMARY_FIELDS.map((key) => (
                    <FieldRow
                      key={key}
                      fieldKey={key}
                      record={r}
                      value={edits[r.page]?.[key] ?? ""}
                      onChange={(v) => onEdit(r.page, key, v)}
                      locale={locale}
                    />
                  ))}
                </div>
              </div>

              {open && (
                <div className="grid gap-2.5 border-t border-line px-3 py-3 sm:grid-cols-2">
                  {SECONDARY_FIELDS.map((key) => (
                    <FieldRow
                      key={key}
                      fieldKey={key}
                      record={r}
                      value={edits[r.page]?.[key] ?? ""}
                      onChange={(v) => onEdit(r.page, key, v)}
                      locale={locale}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [r.page]: !open }))}
                  aria-expanded={open}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-sand hover:text-ink"
                >
                  {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {open ? t.less : t.more}
                </button>

                <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand">
                  <input
                    type="checkbox"
                    checked={isVerified}
                    onChange={(e) => onVerify(r.page, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-forest-600"
                  />
                  {isVerified ? t.verified : t.markVerified}
                </label>
              </div>

              {(r.matchReasons?.length ?? 0) > 0 && (
                <p className="border-t border-line px-3 py-1.5 text-[11px] text-faint">
                  {r.matchReasons!.join(" · ")}
                </p>
              )}
            </section>
          );
        })}
      </div>

      {zoom && (
        <Lightbox
          src={zoom.src}
          alt={`${zoom.record.origin.file} · ${t.page} ${zoom.record.origin.pageInFile}`}
          onClose={() => setZoom(null)}
        />
      )}
    </>
  );
}

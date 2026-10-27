"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowLeftRight, Check, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Link2, Loader2,
  MessageCircle, ScanBarcode, Search, ShoppingBag, Unlink, X,
} from "lucide-react";
import type { AltOrder, LabelRecord } from "@/lib/receipt/label-core";
import type { PageImageStore } from "@/lib/receipt/browser-ocr";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";

export type Edits = Record<number, Record<string, string>>;

/** Jawaban rekomendasi / pencarian order untuk satu kartu. */
export interface OrderLookup {
  orders: (AltOrder & { similarity?: number })[];
  error?: string;
}

/** Status pencocokan ulang dari nomor HP yang diketik di kartu. */
export type RematchState =
  | { status: "searching" }
  | { status: "found"; order: string | null }
  | { status: "none" }
  | { status: "error"; text: string };

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
    heldAwb: "Ditahan dari fulfill — nomor resinya kembar dengan",
    heldAwbHint: "Salah satu pasti salah baca: cocokkan dengan gambar labelnya, lalu perbaiki nomor yang keliru.",
    heldOrder: "Ditahan dari fulfill — tercocok ke order Shopify yang SAMA dengan",
    heldSkipped: "Dilewati — resi untuk order ini dipakai dari",
    pickThis: "Pakai resi halaman ini",
    seeTwin: "Lihat",
    heldOrderHint: "Kalau pembelinya memesan dua kali, pasang halaman ini ke order satunya di bawah. Kalau satu pesanan memang dikirim dua paket, fulfill cukup dari salah satu halaman. Kalau bukan keduanya, salah satu pencocokannya keliru — bandingkan nama & alamat kedua kartu dengan order-nya.",
    altTitle: "Order lain milik pembeli ini yang juga cocok:",
    altPick: "Pasang ke",
    altUnfulfilled: "belum terkirim",
    altFulfilled: "sudah terkirim",
    twinTitle: "Pembeli yang sama punya {n} order yang sama-sama cocok — dibagi otomatis:",
    twinThis: "Halaman ini dipasang ke",
    twinSwapHint: "Kalau terbalik, pasang ke order satunya — kartu pasangannya ikut ditukar.",
    verified: "Sudah diperiksa",
    markVerified: "Tandai sudah diperiksa",
    more: "Detail lain dari label",
    less: "Sembunyikan detail lain",
    zoom: "Perbesar gambar label",
    close: "Tutup",
    needsReview: "Perlu dicek",
    rematchSearching: "Mencari order Shopify untuk nomor ini…",
    rematchFound: "ditemukan dari nomor HP yang diketik — ikut tombol fulfill.",
    rematchNone:
      "Tidak ada order Shopify dengan nomor ini atas nama penerima ini. Kalau pesanannya lewat WhatsApp, ini wajar — nomornya tetap masuk ke unduhan.",
    rematchError: "Gagal mencari ulang order:",
    origin: "Asal pesanan",
    originWa: "WhatsApp / langsung",
    originShop: "Order Shopify",
    originWaHint: "Tidak ikut fulfill Shopify — nomornya cukup untuk unduhan.",
    suggestTitle: "Order paling mirip",
    suggestHint: "Diurutkan dari nama, HP, kodepos & tanggal di label. Label kurir bisa salah tulis — cocokkan dengan gambar labelnya.",
    suggestNone: "Tidak ada order mirip di sekitar tanggal label ini.",
    searchPh: "Tidak ketemu? Cari kode order, mis. 8496",
    searchNone: "Tidak ada order dengan kode itu.",
    pick: "Pilih",
    match: "mirip",
    unfulfilled: "Belum terkirim",
    fulfilled: "Sudah terkirim",
    usedBy: "dipakai hlm",
    linkedTo: "Dipasang manual ke",
    linkedHint: "Ikut tombol “Tandai terkirim di Shopify”.",
    change: "Ganti",
    unlink: "Lepas",
    cancel: "Batal",
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
    heldAwb: "Held from fulfill — its tracking number duplicates",
    heldAwbHint: "One of them must be misread: compare with the label image and correct the wrong one.",
    heldOrder: "Held from fulfill — matched to the SAME Shopify order as",
    heldSkipped: "Skipped — this order\u2019s tracking comes from",
    pickThis: "Use this page\u2019s tracking",
    seeTwin: "View",
    heldOrderHint: "If the buyer ordered twice, assign this page to their other order below. If one order genuinely shipped as two parcels, fulfilling from either page is enough. If neither, one match is wrong — compare both cards\u2019 name & address against the order.",
    altTitle: "This buyer\u2019s other orders that also match:",
    altPick: "Assign to",
    altUnfulfilled: "unfulfilled",
    altFulfilled: "fulfilled",
    twinTitle: "The same buyer has {n} orders that all match — split automatically:",
    twinThis: "This page is assigned to",
    twinSwapHint: "If that\u2019s the wrong one, assign the other order — the partner card swaps with it.",
    verified: "Verified",
    markVerified: "Mark as verified",
    more: "Other details from the label",
    less: "Hide other details",
    zoom: "Zoom label image",
    close: "Close",
    needsReview: "Needs a look",
    rematchSearching: "Looking up the Shopify order for this number…",
    rematchFound: "found from the typed phone number — included in fulfill.",
    rematchNone:
      "No Shopify order with this number for this recipient. If it came via WhatsApp that\u2019s expected — the number still goes into the download.",
    rematchError: "Couldn\u2019t look the order up again:",
    origin: "Order source",
    originWa: "WhatsApp / direct",
    originShop: "Shopify order",
    originWaHint: "Not fulfilled in Shopify — the number is just for the download.",
    suggestTitle: "Closest orders",
    suggestHint: "Ranked by the label\u2019s name, phone, postcode & date. Courier labels can be mistyped — check against the label image.",
    suggestNone: "No similar orders around this label\u2019s date.",
    searchPh: "Not here? Search order code, e.g. 8496",
    searchNone: "No order with that code.",
    pick: "Pick",
    match: "match",
    unfulfilled: "Unfulfilled",
    fulfilled: "Fulfilled",
    usedBy: "used by p.",
    linkedTo: "Manually linked to",
    linkedHint: "Included in “Mark shipped in Shopify”.",
    change: "Change",
    unlink: "Unlink",
    cancel: "Cancel",
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

/**
 * Pilihan "pasang ke order lain" — order-order pembeli yang sama yang lolos
 * penjaga keras. Yang belum terkirim ditaruh di depan: itulah yang hampir
 * pasti dimaksud; yang sudah terkirim tetap ditampilkan (label bisa dicetak
 * ulang) tetapi ditandai, supaya tidak dipilih tanpa sadar.
 */
function AltChooser({
  page, alternates, onPick, locale,
}: {
  page: number;
  alternates: AltOrder[];
  onPick: (page: number, legacyId: string) => void;
  locale: Locale;
}) {
  const t = STR[locale];
  if (!alternates.length) return null;
  const urut = [...alternates].sort((a, b) => Number(a.fulfilled) - Number(b.fulfilled));
  const tgl = (iso: string) => {
    const d = new Date(iso);
    return Number.isFinite(+d) ? d.toLocaleDateString(locale === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short" }) : "";
  };
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium">{t.altTitle}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {urut.map((a) => (
          <button
            key={a.legacyId}
            type="button"
            onClick={() => onPick(page, a.legacyId)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e8d9a8] bg-panel px-2.5 py-1.5 font-medium text-[#8a6512] transition-colors hover:bg-gold-soft"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
            <span>
              {t.altPick} <span className="font-semibold">{a.orderName}</span>
              <span className="font-normal text-[#a8842a]">
                {" "}· {a.fulfilled ? t.altFulfilled : t.altUnfulfilled}
                {tgl(a.createdAt) ? ` · ${tgl(a.createdAt)}` : ""}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}


/** Lingkar persentase kemiripan — warnanya ikut tingkat keyakinan. */
function SimilarityRing({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  const tone = v >= 70 ? "text-forest-600" : v >= 45 ? "text-[#b8891c]" : "text-faint";
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center" aria-label={`${v}% ${label}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3.5" className="stroke-sand" />
        <circle
          cx="22" cy="22" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
          className={cn("stroke-current transition-[stroke-dashoffset] duration-500", tone)}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <span className="text-[11px] font-bold tabular-nums text-ink">{v}%</span>
    </span>
  );
}

/** Satu baris pilihan order — rekomendasi maupun hasil cari. */
function OrderOption({
  o, locale, usedByPage, onPick,
}: {
  o: AltOrder & { similarity?: number };
  locale: Locale;
  usedByPage?: number;
  onPick: () => void;
}) {
  const t = STR[locale];
  const d = new Date(o.createdAt);
  const tgl = Number.isFinite(+d)
    ? d.toLocaleDateString(locale === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short" })
    : "";
  return (
    <li className="group flex items-start gap-3 rounded-xl border border-line bg-panel p-3 transition-colors duration-200 hover:border-forest-300 hover:bg-forest-50/40">
      {o.similarity != null ? (
        <SimilarityRing value={o.similarity} label={t.match} />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-muted">
          <ShoppingBag className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-ink">{o.orderName}</span>
          {tgl && <span className="text-[11px] text-faint">{tgl}</span>}
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              o.fulfilled ? "bg-clay-soft text-[#8c3c1f]" : "bg-[#e9f0d8] text-forest-700",
            )}
          >
            {o.fulfilled ? t.fulfilled : t.unfulfilled}
          </span>
          {usedByPage != null && (
            <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-[#8a6512]">
              {t.usedBy} {usedByPage}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink">
          {o.name ?? "—"}
          {o.phone && <span className="ml-1.5 font-mono text-muted">{o.phone}</span>}
        </p>
        {o.address && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{o.address}</p>}
        {o.reasons.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {o.reasons.map((x) => (
              <span key={x} className="rounded-md bg-sand px-1.5 py-0.5 text-[10px] font-medium text-muted">
                {x}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onPick}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 self-center rounded-lg bg-forest-600 px-3 text-xs font-semibold text-cream shadow-sm transition-colors duration-200 hover:bg-forest-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 focus-visible:ring-offset-2"
      >
        <Link2 className="h-3.5 w-3.5" /> {t.pick}
      </button>
    </li>
  );
}

function OptionSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line p-3" aria-hidden>
      <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-sand" />
      <span className="flex-1 space-y-2">
        <span className="block h-3 w-1/3 animate-pulse rounded bg-sand" />
        <span className="block h-2.5 w-2/3 animate-pulse rounded bg-sand" />
        <span className="block h-2.5 w-1/2 animate-pulse rounded bg-sand" />
      </span>
    </li>
  );
}

/**
 * Asal pesanan untuk kartu tanpa order: WhatsApp (bawaan) atau order Shopify.
 *
 * Memilih Shopify membuka rekomendasi order yang PALING MIRIP — penjaga ketat
 * dilonggarkan jadi skor, karena justru label yang salah tulis yang sampai ke
 * sini. Bila rekomendasi meleset, kode order bisa dicari langsung. Sistem
 * hanya mengurutkan; memasang tetap keputusan orang yang melihat labelnya.
 */
function OrderLinker({
  record, locale, lookup, onLink, onUnlink, claimedBy,
}: {
  record: LabelRecord;
  locale: Locale;
  lookup: (page: number, q?: string) => Promise<OrderLookup>;
  onLink: (page: number, o: AltOrder) => void;
  onUnlink: (page: number) => void;
  claimedBy: Record<string, number>;
}) {
  const t = STR[locale];
  const page = record.page;
  const [picking, setPicking] = useState(false);
  const [sugg, setSugg] = useState<{ loading: boolean } & OrderLookup>({ loading: false, orders: [] });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ loading: boolean; done: boolean } & OrderLookup>({ loading: false, done: false, orders: [] });
  const seq = useRef(0);
  // Fungsi dari induk dibuat ulang tiap render; lewat ref supaya pencarian
  // tidak ditembak ulang setiap kali kartu lain berubah.
  const lookupRef = useRef(lookup);
  useEffect(() => {
    lookupRef.current = lookup;
  }, [lookup]);

  function buka() {
    setPicking(true);
    setSugg({ loading: true, orders: [] });
    void lookupRef.current(page).then((res) => setSugg({ loading: false, ...res }));
  }

  useEffect(() => {
    const q = query.trim();
    const my = ++seq.current;
    if (q.replace(/\D/g, "").length < 2 && q.length < 3) {
      setFound({ loading: false, done: false, orders: [] });
      return;
    }
    setFound((f) => ({ ...f, loading: true }));
    const timer = setTimeout(() => {
      void lookupRef.current(page, q).then((res) => {
        if (seq.current === my) setFound({ loading: false, done: true, ...res });
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [query, page]);

  const pilih = (o: AltOrder) => {
    onLink(page, o);
    setPicking(false);
    setQuery("");
  };
  const dipakai = (o: AltOrder) => {
    const p = claimedBy[o.legacyId];
    return p != null && p !== page ? p : undefined;
  };

  // Sudah dipasang manual → ringkasan + jalan untuk mengganti/melepas.
  if (record.manualPick && !picking) {
    return (
      <div className="mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-forest-200 bg-[#e9f0d8]/60 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-600 text-cream">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium text-forest-700">
            {t.linkedTo} <span className="font-semibold">{record.matchedOrder}</span>
          </p>
          <p className="text-[11px] text-forest-700/80">{t.linkedHint}</p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={buka}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-forest-200 bg-panel px-2.5 text-xs font-medium text-forest-700 transition-colors hover:bg-forest-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> {t.change}
          </button>
          <button
            type="button"
            onClick={() => onUnlink(page)}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-sand hover:text-ink"
          >
            <Unlink className="h-3.5 w-3.5" /> {t.unlink}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mt-3 rounded-xl border border-line bg-cream/40 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-muted">{t.origin}</span>
        <div className="grid grid-cols-2 rounded-xl bg-sand p-1" role="radiogroup" aria-label={t.origin}>
          {([
            { on: !picking, label: t.originWa, Icon: MessageCircle, act: () => setPicking(false) },
            { on: picking, label: t.originShop, Icon: ShoppingBag, act: () => !picking && buka() },
          ] as const).map(({ on, label, Icon, act }) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={act}
              className={cn(
                "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors duration-200",
                on ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {!picking && !record.manualPick && <p className="mt-2 text-[11px] text-faint">{t.originWaHint}</p>}

      {picking && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink">{t.suggestTitle}</p>
              {record.manualPick && (
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="cursor-pointer text-[11px] font-medium text-muted hover:text-ink"
                >
                  {t.cancel}
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{t.suggestHint}</p>
          </div>

          <ul className="space-y-2" aria-busy={sugg.loading}>
            {sugg.loading ? (
              <>
                <OptionSkeleton />
                <OptionSkeleton />
                <OptionSkeleton />
              </>
            ) : sugg.error ? (
              <li className="flex items-start gap-1.5 rounded-xl bg-clay-soft px-3 py-2 text-xs text-[#8c3c1f]">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {sugg.error}
              </li>
            ) : sugg.orders.length === 0 ? (
              <li className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-muted">{t.suggestNone}</li>
            ) : (
              sugg.orders.map((o) => (
                <OrderOption key={o.legacyId} o={o} locale={locale} usedByPage={dipakai(o)} onPick={() => pilih(o)} />
              ))
            )}
          </ul>

          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPh}
                aria-label={t.searchPh}
                className="h-10 pl-9 text-sm"
              />
              {found.loading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-faint" />
              )}
            </div>
            {found.done && (
              <ul className="space-y-2">
                {found.error ? (
                  <li className="flex items-start gap-1.5 rounded-xl bg-clay-soft px-3 py-2 text-xs text-[#8c3c1f]">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {found.error}
                  </li>
                ) : found.orders.length === 0 ? (
                  <li className="px-1 text-xs text-muted">{t.searchNone}</li>
                ) : (
                  found.orders.map((o) => (
                    <OrderOption key={o.legacyId} o={o} locale={locale} usedByPage={dipakai(o)} onPick={() => pilih(o)} />
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
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
  spotlightPages,
  blockedInfo = {},
  onChooseOrder,
  onPickOrder,
  twinInfo = {},
  onJumpTo,
  rematch = {},
  canLinkOrder = false,
  onLookupOrders,
  onLinkOrder,
  onUnlinkOrder,
  claimedBy = {},
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
  /** Kartu yang disorot sesaat — tombol "tampilkan yang ditahan" melompat kemari. */
  spotlightPages?: Set<number>;
  /** Alasan kartu ditahan dari fulfill: jenis kembar + halaman pasangannya. */
  blockedInfo?: Record<number, { kind: "awb" | "order"; partners: number[]; legacyId?: string; chosen?: number }>;
  /** Pilih halaman mana yang resinya dipakai untuk sebuah order kembar. */
  onChooseOrder?: (legacyId: string, page: number) => void;
  /** Pasang halaman ke order LAIN milik pembeli yang sama (pembeli order dua kali). */
  onPickOrder?: (page: number, legacyId: string) => void;
  /** Kelompok label pembeli yang sama yang ordernya dibagi otomatis: halaman → order terkini. */
  twinInfo?: Record<number, { page: number; orderName: string | null }[]>;
  /** Lompat + sorot kartu lain — untuk membandingkan kembarannya. */
  onJumpTo?: (page: number) => void;
  /** Pencocokan ulang dari nomor HP yang diketik manual, per halaman. */
  rematch?: Record<number, RematchState>;
  /** Kartu tanpa order boleh dipasangkan manual ke order Shopify. */
  canLinkOrder?: boolean;
  onLookupOrders?: (page: number, q?: string) => Promise<OrderLookup>;
  onLinkOrder?: (page: number, o: AltOrder) => void;
  onUnlinkOrder?: (page: number) => void;
  claimedBy?: Record<string, number>;
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
              id={`rs-page-${r.page}`}
              style={{ ["--i" as string]: Math.min(i, 8) }}
              className={cn(
                "stagger-item overflow-hidden rounded-2xl border bg-panel transition-colors",
                isVerified ? "border-forest-300" : flagged ? "border-gold" : "border-line",
                spotlightPages?.has(r.page) && "hf-spotlight",
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
              {/* Kartu ini DITAHAN dari fulfill. Isinya sendiri bisa tampak
                  normal — masalahnya relasional: kembarannya ada di halaman
                  lain, dan keterangan inilah yang menunjuknya. */}
              {blockedInfo[r.page] && !fulfillResult[r.page] && (
                <div className="mt-2 rounded-xl border border-[#e8d9a8] bg-gold-soft px-3 py-2 text-xs leading-relaxed text-[#8a6512]">
                  {blockedInfo[r.page].kind === "order" && blockedInfo[r.page].chosen != null ? (
                    // Kembarannya SUDAH dipilih — kartu ini yang dilewati.
                    <span>
                      <span className="font-semibold">{t.heldSkipped}</span>{" "}
                      {t.page} {blockedInfo[r.page].chosen}.
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold">
                        {blockedInfo[r.page].kind === "awb" ? t.heldAwb : t.heldOrder}{" "}
                        {blockedInfo[r.page].partners.map((x) => `${t.page} ${x}`).join(", ")}.
                      </span>{" "}
                      {blockedInfo[r.page].kind === "awb" ? t.heldAwbHint : t.heldOrderHint}
                    </span>
                  )}

                  {/* Pilihan untuk kembar-order: manusia yang melihat kedua
                      labelnya yang memutuskan resi mana dipakai — satu ketuk,
                      bisa diganti kapan pun sebelum fulfill. */}
                  {blockedInfo[r.page].kind === "order" && blockedInfo[r.page].legacyId && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onChooseOrder?.(blockedInfo[r.page].legacyId!, r.page)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#8a6512] px-2.5 py-1.5 font-semibold text-white transition-colors hover:bg-[#6e510f]"
                      >
                        <Check className="h-3.5 w-3.5" /> {t.pickThis}
                      </button>
                      {blockedInfo[r.page].partners.map((x) => (
                        <button
                          key={x}
                          type="button"
                          onClick={() => onJumpTo?.(x)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#e8d9a8] bg-panel px-2.5 py-1.5 font-medium text-[#8a6512] transition-colors hover:bg-gold-soft"
                        >
                          {t.seeTwin} {t.page} {x}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Pembeli yang memesan dua kali: kembarannya bukan salah
                      cocok, melainkan order kedua yang belum dapat halaman.
                      Di sinilah halaman ini bisa dipasang ke order itu. */}
                  {blockedInfo[r.page].kind === "order" && onPickOrder && (
                    <AltChooser page={r.page} alternates={r.alternates ?? []} onPick={onPickOrder} locale={locale} />
                  )}
                </div>
              )}

              {/* Kelompok label pembeli yang sama yang ordernya DIBAGI otomatis.
                  Pembagiannya tebakan (kedua label isinya identik), jadi
                  disebut terang-terangan beserta cara menukarnya. */}
              {twinInfo[r.page] && !blockedInfo[r.page] && !fulfillResult[r.page] && (
                <div className="mt-2 rounded-xl border border-[#e8d9a8] bg-gold-soft px-3 py-2 text-xs leading-relaxed text-[#8a6512]">
                  <span className="font-semibold">{t.twinTitle.replace("{n}", String(twinInfo[r.page].length))}</span>{" "}
                  {twinInfo[r.page].map((x, i) => (
                    <span key={x.page}>
                      {i > 0 && ", "}
                      {x.page === r.page ? (
                        <span>{x.orderName ?? "?"} → {t.page.toLowerCase()} {x.page}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onJumpTo?.(x.page)}
                          className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-[#6e510f]"
                        >
                          {x.orderName ?? "?"} → {t.page.toLowerCase()} {x.page}
                        </button>
                      )}
                    </span>
                  ))}
                  . {t.twinThis} <span className="font-semibold">{r.matchedOrder}</span>. {t.twinSwapHint}
                  {onPickOrder && (
                    <AltChooser page={r.page} alternates={r.alternates ?? []} onPick={onPickOrder} locale={locale} />
                  )}
                </div>
              )}

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

              {/* Pencocokan ulang dari nomor HP yang diketik di kartu ini. */}
              {rematch[r.page] && !fulfillResult[r.page] && (
                <div
                  role="status"
                  className={cn(
                    "mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium",
                    rematch[r.page].status === "searching" && "hf-checking text-forest-700",
                    rematch[r.page].status === "found" && "bg-[#e9f0d8] text-forest-700",
                    rematch[r.page].status === "none" && "border border-[#e8d9a8] bg-gold-soft text-[#8a6512]",
                    rematch[r.page].status === "error" && "bg-clay-soft text-[#8c3c1f]",
                  )}
                >
                  {(() => {
                    const st = rematch[r.page];
                    if (st.status === "searching") {
                      return (
                        <>
                          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                          <span>{t.rematchSearching}</span>
                        </>
                      );
                    }
                    if (st.status === "found") {
                      return (
                        <>
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <span className="font-semibold">{st.order ?? t.shopify}</span> {t.rematchFound}
                          </span>
                        </>
                      );
                    }
                    if (st.status === "none") {
                      return (
                        <>
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{t.rematchNone}</span>
                        </>
                      );
                    }
                    return (
                      <>
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{t.rematchError} {st.text}</span>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Kartu tanpa order (atau yang ordernya dipilih manual): pilih
                  asal pesanannya. Packing slip & kartu yang sudah terkirim
                  tidak ikut. */}
              {canLinkOrder && onLookupOrders && onLinkOrder && onUnlinkOrder &&
                !fulfillResult[r.page]?.ok &&
                (r.matchStatus === "manual" || r.manualPick) && (
                  <OrderLinker
                    record={r}
                    locale={locale}
                    lookup={onLookupOrders}
                    onLink={onLinkOrder}
                    onUnlink={onUnlinkOrder}
                    claimedBy={claimedBy}
                  />
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

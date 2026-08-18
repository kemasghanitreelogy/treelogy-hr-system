"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, FileDown, FileSpreadsheet, FileText, Loader2, PackageSearch, Plus,
  ScanBarcode, ShieldCheck, Smartphone, Upload, X,
} from "lucide-react";
import type { LabelRecord } from "@/lib/receipt/label-core";
import { flagDuplicateTracking, normalizeShipDate, reconcile } from "@/lib/receipt/label-core";
import { extractZip } from "@/lib/receipt/local-extract";
import { ACCEPTED_TYPES, extractFromFiles, isSupportedLabelFile, type OcrProgress } from "@/lib/receipt/browser-ocr";
import { exportReceiptCsv, exportReceiptXlsx, type ReceiptExportRow } from "@/lib/receipt/receipt-xlsx";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { ALL_FIELDS, ReviewPanel, type Edits } from "./review-panel";
import { JubelioPanel, type JubelioRow } from "./jubelio-panel";

interface MatchResult {
  phone: string | null;
  name: string | null;
  address: string | null;
  orderName: string | null;
  legacyId: string | null;
  confidence: "certain" | "high" | "low";
  reasons: string[];
  flag: string | null;
}

const STR: Record<Locale, Record<string, string>> = {
  id: {
    drop: "Letakkan PDF atau foto label di sini",
    browse: "atau ketuk untuk memilih berkas — boleh beberapa sekaligus",
    hint: "PDF banyak halaman atau foto (JPG/PNG) label pengiriman",
    privacy: "Berkas dibaca langsung di perangkat ini — tidak diunggah ke mana pun.",
    remove: "Hapus berkas",
    removeAll: "Kosongkan daftar",
    addMore: "Tambah berkas",
    files: "berkas",
    fileCounter: "Berkas",
    skipped: "Ada berkas yang dilewati — hanya PDF/JPG/PNG/WebP yang bisa dibaca.",
    duplicate: "Berkas itu sudah ada di daftar.",
    run: "Baca & cocokkan",
    running: "Memproses…",
    stageCompress: "Menyiapkan gambar…",
    stageEngine: "Memuat mesin OCR…",
    stagePages: "Membaca label",
    stageMatch: "Mencocokkan order Shopify…",
    pages: "Halaman",
    awbOk: "AWB terkonfirmasi",
    phoneOk: "No. HP ketemu",
    review: "Perlu dicek",
    elapsed: "Waktu",
    xlsx: "Unduh Excel",
    csv: "Unduh CSV",
    exported: "Berkas terunduh.",
    nothingToExport: "Belum ada data untuk diunduh.",
    unsupported: "Pilih berkas PDF atau gambar (JPG/PNG/WebP).",
    failed: "Gagal membaca berkas. Pastikan berkasnya label pengiriman yang jelas.",
    connection: "Koneksi bermasalah. Coba lagi.",
    emptyTitle: "Belum ada label yang dibaca",
    emptyBody:
      "Unggah PDF label pengiriman (J&T / Lion Parcel) atau fotonya. Nomor resi dibaca dari barcode — bukan tebakan OCR — lalu penerimanya dicocokkan ke order Shopify untuk menarik nomor HP.",
    step1: "Resi dibaca dari barcode",
    step1s: "Nomor AWB diambil eksak dari barcode label, dibaca minimal dua kali.",
    step2: "No. HP dari Shopify",
    step2s: "Penerima dicocokkan lewat 4 digit HP, kodepos, dan nama.",
    step3: "Tidak ada yang diunggah",
    step3s: "Berkas tetap di perangkat; hanya potongan teks kecil dikirim ke server.",
    reviewTitle: "Periksa hasil",
    reviewLead: "Isian bertanda kuning perlu dilihat mata. Perubahan Anda ikut terbawa ke unduhan.",
  },
  en: {
    drop: "Drop label PDFs or photos here",
    browse: "or tap to choose files — several at once is fine",
    hint: "Multi-page PDF or a photo (JPG/PNG) of shipping labels",
    privacy: "Files are read on this device — nothing is uploaded anywhere.",
    remove: "Remove file",
    removeAll: "Clear the list",
    addMore: "Add files",
    files: "files",
    fileCounter: "File",
    skipped: "Some files were skipped — only PDF/JPG/PNG/WebP can be read.",
    duplicate: "That file is already in the list.",
    run: "Read & match",
    running: "Processing…",
    stageCompress: "Preparing the image…",
    stageEngine: "Loading the OCR engine…",
    stagePages: "Reading labels",
    stageMatch: "Matching Shopify orders…",
    pages: "Pages",
    awbOk: "AWB confirmed",
    phoneOk: "Phone found",
    review: "Needs a look",
    elapsed: "Time",
    xlsx: "Download Excel",
    csv: "Download CSV",
    exported: "File downloaded.",
    nothingToExport: "Nothing to download yet.",
    unsupported: "Choose a PDF or an image (JPG/PNG/WebP).",
    failed: "Couldn't read that file. Make sure it's a clear shipping label.",
    connection: "Connection problem. Try again.",
    emptyTitle: "No labels read yet",
    emptyBody:
      "Upload a shipping-label PDF (J&T / Lion Parcel) or a photo of one. The tracking number is decoded from the barcode — never guessed by OCR — then the recipient is matched to a Shopify order to pull the phone number.",
    step1: "AWB from the barcode",
    step1s: "The tracking number is decoded exactly from the label barcode, read at least twice.",
    step2: "Phone from Shopify",
    step2s: "Recipients are matched by phone last-4, postcode, and name.",
    step3: "Nothing is uploaded",
    step3s: "The file stays on your device; only a few text fields go to the server.",
    reviewTitle: "Review the results",
    reviewLead: "Amber fields want a human look. Your edits carry through to the download.",
  },
};

interface RunResult {
  records: LabelRecord[];
  /** Jumlah berkas yang menghasilkan halaman di batch ini. */
  fileCount: number;
  barcodeConfirmed: number;
  phoneMatched: number;
  reviewCount: number;
  elapsedMs: number;
}

function initialEdits(records: LabelRecord[]): Edits {
  const init: Edits = {};
  for (const r of records) {
    init[r.page] = {};
    for (const key of ALL_FIELDS) init[r.page][key] = r.fields[key]?.value ?? "";
  }
  return init;
}

export function ReceiptSalesView({ canSync }: { canSync: boolean }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [verified, setVerified] = useState<Record<number, boolean>>({});
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Tambahkan berkas ke antrean — menjatuhkan berkas baru MENAMBAH, tidak
   *  menimpa, supaya batch bisa dikumpulkan sedikit demi sedikit. */
  const addFiles = useCallback(
    (picked: FileList | File[] | null) => {
      const list = Array.from(picked ?? []);
      if (!list.length) return;

      const ok = list.filter(isSupportedLabelFile);
      if (!ok.length) {
        toast.error(t.unsupported);
        return;
      }
      if (ok.length < list.length) toast.error(t.skipped);

      setFiles((cur) => {
        // Nama + ukuran + waktu ubah = tanda pengenal yang cukup; memilih
        // berkas yang sama dua kali akan menghasilkan halaman kembar yang
        // membingungkan saat dicocokkan ke order.
        const seen = new Set(cur.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
        const fresh = ok.filter((f) => !seen.has(`${f.name}|${f.size}|${f.lastModified}`));
        if (!fresh.length) {
          toast.error(t.duplicate);
          return cur;
        }
        return [...cur, ...fresh];
      });
      setResult(null);
      setEdits({});
      setVerified({});
    },
    [t.duplicate, t.skipped, t.unsupported, toast],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((cur) => cur.filter((_, i) => i !== index));
    setResult(null);
  }, []);

  const run = useCallback(async () => {
    if (!files.length) return;
    setBusy(true);
    setResult(null);
    setProgress(null);
    const started = Date.now();
    try {
      // 1) OCR sepenuhnya di browser — berkasnya tidak pernah meninggalkan perangkat.
      const { visuals, rows } = await extractFromFiles(files, setProgress);
      const records = reconcile(rows, visuals);

      // 2) Cocokkan penerima ke order Shopify (permintaan kecil & cepat).
      setProgress({ stage: "match" });
      const shipDate = normalizeShipDate(rows.find((r) => r.ship_date)?.ship_date);
      const inputs = records.map((r) => ({
        page: r.page,
        name: r.fields.recipient_name?.value || "",
        zip: extractZip(r.fields.recipient_address?.value || "") || "",
        phoneLast4: r.phoneLast4 || "",
        shipDate,
      }));

      let matches: Record<number, MatchResult> = {};
      try {
        const res = await fetch("/api/receipt-sales/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Pencocokan gagal bukan alasan membuang hasil bacaan barcode/OCR —
          // tampilkan apa adanya, tandai semua barisnya manual.
          toast.error(apiErrorMessage(data?.error, locale, res.status));
        } else {
          matches = (data.matches ?? {}) as Record<number, MatchResult>;
        }
      } catch {
        toast.error(t.connection);
      }

      // 3) Gabungkan — data Shopify hanya dipakai kalau kecocokannya "certain".
      //    Lebih baik kosong daripada memasang nomor HP milik orang lain.
      for (const r of records) {
        const m = matches[r.page];
        if (m && m.confidence === "certain") {
          r.fields.phone = { value: m.phone, source: "shopify", confidence: "certain", flag: null };
          r.matchedOrder = m.orderName;
          r.matchReasons = m.reasons;
          r.matchStatus = "shopify";
          r.legacyId = m.legacyId;
          if (m.name) r.fields.recipient_name = { value: m.name, source: "shopify", confidence: "certain", flag: null };
          if (m.address) r.fields.recipient_address = { value: m.address, source: "shopify", confidence: "certain", flag: null };
        } else {
          r.fields.phone = {
            value: null,
            source: "none",
            confidence: "low",
            flag:
              locale === "en"
                ? "Not in Shopify — likely a direct/WhatsApp order. Enter the phone manually."
                : "Tidak ada di Shopify — kemungkinan order langsung/WA. Isi nomornya manual.",
          };
          r.matchedOrder = null;
          r.matchReasons = [];
          r.matchStatus = "manual";
        }
        r.needsReview = Object.values(r.fields).some((f) => f.confidence === "low");
      }

      // 4) Satu batch bisa memuat label yang sama dua kali (mis. PDF-nya plus
      //    fotonya). Ditandai setelah needsReview dihitung ulang, kalau tidak
      //    penandanya langsung tertimpa.
      flagDuplicateTracking(records);

      setEdits(initialEdits(records));
      setVerified({});
      setResult({
        records,
        fileCount: new Set(records.map((r) => r.origin.file)).size,
        barcodeConfirmed: records.filter((r) => r.fields.tracking_number?.confidence === "certain").length,
        phoneMatched: records.filter((r) => r.matchStatus === "shopify").length,
        reviewCount: records.filter((r) => r.needsReview).length,
        elapsedMs: Date.now() - started,
      });
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [files, locale, t.connection, t.failed, toast]);

  const onEdit = useCallback((page: number, key: string, value: string) => {
    setEdits((e) => ({ ...e, [page]: { ...e[page], [key]: value } }));
  }, []);

  const onVerify = useCallback((page: number, value: boolean) => {
    setVerified((v) => ({ ...v, [page]: value }));
  }, []);

  /** Baris ekspor selalu mengikuti hasil edit, bukan nilai OCR asli. */
  const exportRows = useMemo<ReceiptExportRow[]>(() => {
    if (!result) return [];
    return result.records.map((r) => {
      const e = edits[r.page] ?? {};
      return {
        page: r.page,
        sourceFile: r.origin.file,
        pageInFile: r.origin.pageInFile,
        courier: e.courier ?? "",
        awb: e.tracking_number ?? "",
        phone: e.phone ?? "",
        recipientName: e.recipient_name ?? "",
        recipientAddress: e.recipient_address ?? "",
        orderCode: e.order_code ?? "",
        serviceCode: e.service_code ?? "",
        shippingCost: e.shipping_cost ?? "",
        weight: e.weight ?? "",
        paymentMethod: e.payment_method ?? "",
        item: e.item ?? "",
        shipDate: e.ship_date ?? "",
        source: r.matchStatus === "shopify" ? "Shopify" : "Manual / WA",
        order: r.matchedOrder ?? "",
        verified: !!verified[r.page],
      };
    });
  }, [result, edits, verified]);

  /** Hanya baris cocok-Shopify yang punya legacyId + AWB yang bisa disinkron. */
  const jubelioRows = useMemo<JubelioRow[]>(() => {
    if (!result) return [];
    return result.records
      .filter((r) => r.matchStatus === "shopify" && r.legacyId && (edits[r.page]?.tracking_number ?? "").trim())
      .map((r) => {
        const e = edits[r.page] ?? {};
        return {
          page: r.page,
          name: e.recipient_name ?? "",
          legacyId: r.legacyId ?? "",
          zip: extractZip(e.recipient_address ?? "") ?? "",
          awb: (e.tracking_number ?? "").trim(),
          courier: e.courier ?? "",
        };
      });
  }, [result, edits]);

  async function unduh(kind: "xlsx" | "csv") {
    if (!exportRows.length) {
      toast.error(t.nothingToExport);
      return;
    }
    try {
      if (kind === "xlsx") await exportReceiptXlsx(exportRows, locale);
      else exportReceiptCsv(exportRows, locale);
      toast.success(t.exported);
    } catch {
      toast.error(t.connection);
    }
  }

  const totalBytes = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);

  const stageLabel = !progress
    ? t.running
    : progress.stage === "compress"
      ? t.stageCompress
      : progress.stage === "engine"
        ? t.stageEngine
        : progress.stage === "match"
          ? t.stageMatch
          : `${t.stagePages} ${progress.page}/${progress.total}`;

  /**
   * Kemajuan keseluruhan 0–1. Jumlah halaman seluruh antrean baru diketahui
   * setelah tiap PDF dibuka, jadi bilah ini menghitung "berkas keberapa" plus
   * posisi halaman di dalamnya — cukup jujur dan tidak pernah mundur.
   */
  const overall = (() => {
    if (!progress) return 0;
    const count = progress.fileCount ?? files.length ?? 1;
    const done = Math.max(0, (progress.fileIndex ?? 1) - 1);
    const within =
      progress.stage === "pages" && progress.total ? (progress.page ?? 0) / progress.total : 0;
    if (progress.stage === "match") return 1;
    return Math.min(1, (done + within) / Math.max(1, count));
  })();

  return (
    <div className="space-y-4">
      {/* ── Unggah ── */}
      <section className="card p-4 sm:p-5">
        <div
          role="button"
          tabIndex={0}
          aria-label={t.drop}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!busy && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400",
            drag ? "border-forest-400 bg-forest-50" : "border-line bg-cream/40 hover:border-forest-300 hover:bg-cream/70",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-100 text-forest-700">
            <Upload className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">{t.drop}</p>
          <p className="mt-0.5 text-xs text-muted">{t.browse}</p>
          <p className="mt-2 text-[11px] text-faint">{t.hint}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              // Dikosongkan supaya memilih berkas yang SAMA lagi setelah
              // dihapus dari daftar tetap memicu onChange.
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted">
                <span className="tabular-nums text-ink">{files.length}</span> {t.files} ·{" "}
                <span className="tabular-nums">{(totalBytes / 1024 / 1024).toFixed(2)} MB</span>
              </p>
              {!busy && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-forest-700 transition-colors hover:bg-forest-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t.addMore}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setResult(null);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-clay-soft hover:text-clay"
                  >
                    <X className="h-3.5 w-3.5" /> {t.removeAll}
                  </button>
                </div>
              )}
            </div>

            {/* Daftar dibatasi tingginya: 20 berkas tidak boleh mendorong
                tombol prosesnya keluar layar ponsel. */}
            <ul className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-panel p-2">
              {files.map((f, i) => {
                const sedangDibaca = busy && progress?.file === f.name;
                return (
                  <li
                    key={`${f.name}-${f.size}-${f.lastModified}`}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                      sedangDibaca && "bg-forest-50",
                    )}
                  >
                    {sedangDibaca ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-forest-600" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-forest-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-faint">
                      {(f.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label={`${t.remove}: ${f.name}`}
                        title={t.remove}
                        className="shrink-0 cursor-pointer rounded-lg p-2 text-faint transition-colors hover:bg-clay-soft hover:text-clay"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-forest-600" />
            {t.privacy}
          </p>
          <Button size="lg" onClick={run} disabled={!files.length || busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}
            {busy ? stageLabel : t.run}
          </Button>
        </div>

        {busy && (
          <div className="mt-3 space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="min-w-0 truncate">
                {progress?.file && files.length > 1 && (
                  <span className="text-faint">
                    {t.fileCounter} {progress.fileIndex}/{progress.fileCount} ·{" "}
                  </span>
                )}
                {stageLabel}
              </span>
              {progress?.total ? (
                <span className="shrink-0 tabular-nums">
                  {progress.page}/{progress.total}
                </span>
              ) : null}
            </div>
            <Progress
              value={overall * 100}
              className={cn(overall === 0 && "animate-pulse")}
            />
          </div>
        )}
      </section>

      {/* ── Sebelum ada hasil: penjelasan singkat cara kerjanya ── */}
      {!result && !busy && (
        <section className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-8 text-center">
          <PackageSearch className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm font-semibold text-ink">{t.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-muted">{t.emptyBody}</p>
          <div className="mx-auto mt-5 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            {[
              { icon: ScanBarcode, title: t.step1, sub: t.step1s },
              { icon: Smartphone, title: t.step2, sub: t.step2s },
              { icon: ShieldCheck, title: t.step3, sub: t.step3s },
            ].map(({ icon: Icon, title, sub }) => (
              <div key={title} className="rounded-xl border border-line bg-panel p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-100 text-forest-700">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2 text-xs font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{sub}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Hasil ── */}
      {result && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: t.pages, value: result.records.length, icon: FileText, tone: "sky" as const },
              { label: t.awbOk, value: result.barcodeConfirmed, icon: ScanBarcode, tone: "matcha" as const },
              { label: t.phoneOk, value: result.phoneMatched, icon: Smartphone, tone: "forest" as const },
              { label: t.review, value: result.reviewCount, icon: CheckCircle2, tone: result.reviewCount > 0 ? ("gold" as const) : ("matcha" as const) },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="card flex items-center gap-3 p-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    tone === "sky" && "bg-sky-soft text-[#2c5775]",
                    tone === "matcha" && "bg-[#e9f0d8] text-forest-700",
                    tone === "forest" && "bg-forest-100 text-forest-700",
                    tone === "gold" && "bg-gold-soft text-[#8a6512]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block animate-count-up font-display text-xl font-bold tabular-nums text-ink">
                    {value}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{label}</span>
                </span>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">
                {t.reviewTitle}
                {result.fileCount > 1 && (
                  <span className="ml-1.5 font-normal text-faint">
                    · {result.records.length} {locale === "en" ? "pages from" : "halaman dari"}{" "}
                    {result.fileCount} {t.files}
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-muted">{t.reviewLead}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => unduh("csv")}>
                <FileDown className="h-4 w-4" /> {t.csv}
              </Button>
              <Button variant="outline" onClick={() => unduh("xlsx")}>
                <FileSpreadsheet className="h-4 w-4" /> {t.xlsx}
              </Button>
            </div>
          </section>

          <ReviewPanel
            records={result.records}
            edits={edits}
            verified={verified}
            onEdit={onEdit}
            onVerify={onVerify}
          />

          <JubelioPanel rows={jubelioRows} canSync={canSync} />

          <p className="text-[11px] leading-relaxed text-faint">
            {locale === "en"
              ? "Pages are rendered and read in your browser (pdf.js + Tesseract + barcode decoding). Only the extracted name, postcode, and phone last-4 are sent to the server to look up the order in Shopify — the file and its thumbnails never leave this device."
              : "Halaman dirender dan dibaca di browser Anda (pdf.js + Tesseract + pembacaan barcode). Hanya nama, kodepos, dan 4 digit HP yang dikirim ke server untuk mencari ordernya di Shopify — berkas dan pratinjaunya tidak pernah meninggalkan perangkat ini."}
          </p>
        </>
      )}
    </div>
  );
}

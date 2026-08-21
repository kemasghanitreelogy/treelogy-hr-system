"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, FileDown, FileSpreadsheet, FileText, Loader2, PackageSearch, Plus,
  ScanBarcode, ScanText, ShieldCheck, Smartphone, Upload, X,
} from "lucide-react";
import type { LabelRecord } from "@/lib/receipt/label-core";
import { flagDuplicateTracking, formatPhoneId, normalizeShipDate, reconcile } from "@/lib/receipt/label-core";
import { extractZip } from "@/lib/receipt/local-extract";
import {
  ACCEPTED_TYPES, describeError, extractFromFiles, isSupportedLabelFile,
  type OcrProgress, type PageImageStore,
} from "@/lib/receipt/browser-ocr";
import { exportReceiptCsv, exportReceiptXlsx, type ReceiptExportRow } from "@/lib/receipt/receipt-xlsx";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { ALL_FIELDS, ReviewPanel, type Edits } from "./review-panel";

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
    stageOcr: "Mengubah gambar jadi teks",
    stageServer: "Perangkat ini tidak sanggup — dibacakan di server…",
    serverUsed:
      "Perangkat ini tidak bisa membaca PDF sendiri, jadi berkasnya dibacakan di server. Hasilnya sama; pratinjau labelnya saja yang tidak tersedia.",
    serverWhy: "Sebab di perangkat ini:",
    modeText: "halaman teks langsung",
    modeOcr: "halaman gambar (OCR)",
    stageMatch: "Mencocokkan order Shopify…",
    pages: "Halaman",
    awbOk: "AWB terkonfirmasi",
    phoneOk: "No. HP ketemu",
    review: "Perlu dicek",
    elapsed: "Waktu",
    xlsx: "Unduh Excel",
    csv: "Unduh CSV",
    exported: "Berkas terunduh.",
    xlsxFailed: "Gagal membuat berkas Excel di perangkat ini — coba Unduh CSV.",
    nothingToExport: "Belum ada data untuk diunduh.",
    unsupported: "Pilih berkas PDF atau gambar (JPG/PNG/WebP).",
    failed: "Gagal membaca berkas. Pastikan berkasnya label pengiriman yang jelas.",
    failedFile: "Gagal membaca",
    noPages: "Tidak ada halaman yang bisa dibaca dari berkas itu.",
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
    filterAll: "Semua",
    filterReview: "Perlu diperiksa",
    allClear: "Semua halaman sudah diperiksa.",
    allClearHint: "Tidak ada lagi yang menunggu diperiksa — hasilnya siap diunduh.",
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
    stageOcr: "Converting images to text",
    stageServer: "This device can't read it — reading on the server…",
    serverUsed:
      "This device can't read PDFs on its own, so the file was read on the server. Same results; only the label previews are unavailable.",
    serverWhy: "Reason on this device:",
    modeText: "pages read as text",
    modeOcr: "image pages (OCR)",
    stageMatch: "Matching Shopify orders…",
    pages: "Pages",
    awbOk: "AWB confirmed",
    phoneOk: "Phone found",
    review: "Needs a look",
    elapsed: "Time",
    xlsx: "Download Excel",
    csv: "Download CSV",
    exported: "File downloaded.",
    xlsxFailed: "Couldn't build the Excel file on this device — try Download CSV.",
    nothingToExport: "Nothing to download yet.",
    unsupported: "Choose a PDF or an image (JPG/PNG/WebP).",
    failed: "Couldn't read that file. Make sure it's a clear shipping label.",
    failedFile: "Couldn't read",
    noPages: "No readable pages in that file.",
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
    filterAll: "All",
    filterReview: "Needs a look",
    allClear: "Every page has been reviewed.",
    allClearHint: "Nothing is waiting on you — the results are ready to download.",
    reviewLead: "Amber fields want a human look. Your edits carry through to the download.",
  },
};

interface RunResult {
  records: LabelRecord[];
  /** Jumlah berkas yang menghasilkan halaman di batch ini. */
  fileCount: number;
  /** Halaman yang teksnya bisa dibaca langsung dari PDF. */
  textPages: number;
  /** Halaman gambar yang harus di-OCR dulu. */
  ocrPages: number;
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

export function ReceiptSalesView() {
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
  /** "review" hanya menampilkan kartu yang masih menunggu diperiksa. */
  const [filter, setFilter] = useState<"all" | "review">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  /** Dokumen PDF tetap terbuka selama hasilnya ditampilkan, supaya pratinjau
   *  bisa dirender saat kartunya dilihat. Dilepas saat batch diganti/ditutup. */
  const imagesRef = useRef<PageImageStore | null>(null);
  const [images, setImages] = useState<PageImageStore | null>(null);

  const releaseImages = useCallback(() => {
    const store = imagesRef.current;
    imagesRef.current = null;
    setImages(null);
    void store?.dispose();
  }, []);

  useEffect(() => releaseImages, [releaseImages]);

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
      releaseImages();
      // Pool order Shopify dipanaskan BERSAMAAN dengan pembacaan label: begitu
      // tanggal kirim halaman pertama terbaca, permintaannya dilepas ke server
      // dan ongkos jaringannya habis di belakang layar, bukan setelahnya.
      let warmed: Promise<unknown> | null = null;
      const warm = (shipDate: string) => {
        if (warmed) return;
        warmed = fetch("/api/receipt-sales/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ warm: true, shipDate }),
        }).catch(() => null);
      };

      const { visuals, rows, failures, textPages, ocrPages, serverFallbacks, images: store } = await extractFromFiles(
        files,
        setProgress,
        (row) => warm(normalizeShipDate(row.ship_date) || new Date().toISOString().slice(0, 10)),
      );
      imagesRef.current = store;
      setImages(store);

      // Kegagalan per berkas dilaporkan lengkap dengan sebabnya — pesan umum
      // "berkasnya tidak jelas" pernah menyembunyikan kegagalan yang sebenarnya
      // berasal dari browser lama, dan tidak ada yang bisa menindaklanjutinya.
      for (const f of failures) {
        // Sebab bisa berupa kode mesin dari server ("needs_ocr") atau pesan
        // bebas dari pustaka. Yang pertama diterjemahkan jadi kalimat yang bisa
        // ditindaklanjuti; yang kedua ditampilkan apa adanya karena justru
        // isinya yang dibutuhkan untuk menelusuri masalah.
        const kode = /^[a-z0-9_]+$/.test(f.reason);
        toast.error(`${t.failedFile} ${f.file} — ${kode ? apiErrorMessage(f.reason, locale) : f.reason}`);
      }
      // Berkas yang terpaksa dibaca di server: pengguna berhak tahu, karena
      // janji "berkas tidak meninggalkan perangkat" tidak berlaku untuk itu.
      if (serverFallbacks.length) {
        toast.toast(t.serverUsed, "info");
        // Sebab lokalnya ikut ditampilkan. Sebelumnya ia ditelan diam-diam
        // begitu jalan kedua berhasil — dan kegagalan yang tidak meninggalkan
        // jejak mustahil ditelusuri dari perangkat orang lain.
        for (const f of serverFallbacks) toast.toast(`${t.serverWhy} ${f.reason}`, "info");
      }
      if (!visuals.length) {
        toast.error(t.noPages);
        return;
      }
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
      setFilter("all");
      setResult({
        records,
        fileCount: new Set(records.map((r) => r.origin.file)).size,
        textPages,
        ocrPages,
        barcodeConfirmed: records.filter((r) => r.fields.tracking_number?.confidence === "certain").length,
        phoneMatched: records.filter((r) => r.matchStatus === "shopify").length,
        reviewCount: records.filter((r) => r.needsReview).length,
        elapsedMs: Date.now() - started,
      });
    } catch (e) {
      // Sebabnya ikut ditampilkan: tanpa itu, kegagalan di perangkat orang lain
      // tidak bisa didiagnosis dari jarak jauh.
      const sebab = describeError(e);
      toast.error(`${t.failed} (${sebab})`);
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

  /** Baris ekspor selalu mengikuti hasil edit, bukan nilai hasil baca awal. */
  const exportRows = useMemo<ReceiptExportRow[]>(() => {
    if (!result) return [];
    return result.records.map((r) => {
      const e = edits[r.page] ?? {};
      return {
        awb: (e.tracking_number ?? "").trim(),
        recipientName: (e.recipient_name ?? "").trim(),
        // Diseragamkan ke +62 hanya di sini, bukan di layar: yang diketik
        // manusia biarkan apa adanya saat mengetik, yang keluar berkas rapi.
        phone: formatPhoneId(e.phone),
      };
    });
  }, [result, edits]);

  /**
   * Kartu yang masih menunggu diperiksa: ditandai perlu dicek DAN belum
   * dicentang. Mencentang sebuah kartu membuatnya langsung keluar dari daftar
   * ini, sehingga sisa pekerjaannya menyusut sambil dikerjakan.
   */
  const pendingPages = useMemo(() => {
    if (!result) return [];
    return result.records.filter((r) => r.needsReview && !verified[r.page]);
  }, [result, verified]);

  const shownRecords = useMemo(() => {
    if (!result) return [];
    return filter === "review" ? pendingPages : result.records;
  }, [result, filter, pendingPages]);

  async function unduh(kind: "xlsx" | "csv") {
    if (!exportRows.length) {
      toast.error(t.nothingToExport);
      return;
    }
    try {
      if (kind === "xlsx") await exportReceiptXlsx(exportRows, locale);
      else exportReceiptCsv(exportRows, locale);
      toast.success(t.exported);
    } catch (e) {
      // Pembuatan XLSX memuat pustaka tersendiri; CSV tidak butuh apa-apa.
      // Jadi kegagalan di sini selalu punya jalan keluar yang bisa disebutkan.
      toast.error(kind === "xlsx" ? t.xlsxFailed : describeError(e));
    }
  }

  const totalBytes = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);

  const stageLabel = !progress
    ? t.running
    : progress.stage === "compress"
      ? t.stageCompress
      : progress.stage === "engine"
        ? t.stageEngine
        : progress.stage === "server"
          ? t.stageServer
          : progress.stage === "match"
            ? t.stageMatch
            : `${progress.fast === false ? t.stageOcr : t.stagePages} ${progress.page}/${progress.total}`;

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
              {/* Cara tiap halaman dibaca menentukan seberapa perlu diperiksa:
                  teks PDF tidak bisa salah baca, hasil OCR bisa. */}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
                {result.textPages > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3 text-forest-600" />
                    {result.textPages} {t.modeText}
                  </span>
                )}
                {result.ocrPages > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ScanText className="h-3 w-3 text-[#8a6512]" />
                    {result.ocrPages} {t.modeOcr}
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* Dua keadaan saja: lihat semuanya, atau kerjakan yang tersisa. */}
              <div className="inline-flex rounded-xl bg-sand p-1" role="tablist" aria-label={t.reviewTitle}>
                {(["all", "review"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="tab"
                    aria-selected={filter === opt}
                    onClick={() => setFilter(opt)}
                    className={cn(
                      "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      filter === opt ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
                    )}
                  >
                    {opt === "all" ? t.filterAll : t.filterReview}
                    <span className="ml-1 tabular-nums opacity-70">
                      {opt === "all" ? result.records.length : pendingPages.length}
                    </span>
                  </button>
                ))}
              </div>
              <Button variant="outline" onClick={() => unduh("csv")}>
                <FileDown className="h-4 w-4" /> {t.csv}
              </Button>
              <Button variant="outline" onClick={() => unduh("xlsx")}>
                <FileSpreadsheet className="h-4 w-4" /> {t.xlsx}
              </Button>
            </div>
          </section>

          {shownRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50/60 px-5 py-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-forest-600" />
              <p className="mt-2 text-sm font-semibold text-ink">{t.allClear}</p>
              <p className="mt-1 text-xs text-muted">{t.allClearHint}</p>
            </div>
          ) : (
          <ReviewPanel
            records={shownRecords}
            images={images}
            edits={edits}
            verified={verified}
            onEdit={onEdit}
            onVerify={onVerify}
          />
          )}

        </>
      )}
    </div>
  );
}

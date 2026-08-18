"use client";

/**
 * Pipeline pembacaan label — SEMUANYA jalan di perangkat pengguna, tidak ada
 * berkas yang diunggah: pdf.js membuka halaman, zxing membaca barcode AWB,
 * teksnya dibaca, lalu `local-extract` mem-parsenya. Hanya potongan kecil
 * (nama/kodepos/4 digit HP) yang belakangan dikirim ke server untuk dicocokkan
 * ke Shopify.
 *
 * Ada DUA jalur, dan memilih jalur yang benar adalah keputusan terpenting di
 * berkas ini:
 *
 *   1. **Jalur teks** — label yang dicetak sistem kurir (J&T/Lion) adalah PDF
 *      digital: hurufnya tersimpan sebagai teks, bukan gambar. Teks itu bisa
 *      dibaca langsung dalam ~10 ms per halaman dan hasilnya EKSAK — bukan
 *      tebakan. Untuk berkas seperti ini OCR sama sekali tidak dijalankan.
 *   2. **Jalur OCR** — untuk foto label dan PDF hasil pindai yang memang tidak
 *      punya lapisan teks. Di sini Tesseract dipakai, tetapi beberapa halaman
 *      sekaligus lewat kumpulan worker, dan pada resolusi yang lebih rendah
 *      daripada resolusi barcode.
 *
 * Perbedaannya besar: 125 halaman PDF digital selesai dalam hitungan detik,
 * sementara jalur OCR memakan beberapa menit untuk jumlah halaman yang sama.
 */

import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { createScheduler, createWorker, type Scheduler } from "tesseract.js";
import { compressImageBlob } from "@/lib/image";
import { AWB_RE, type PageVisual } from "./label-core";
import { parseLabelFields, type ParsedRow } from "./local-extract";

export interface OcrProgress {
  stage: "compress" | "engine" | "pages" | "match";
  page?: number;
  total?: number;
  file?: string;
  fileIndex?: number;
  fileCount?: number;
  /** true saat halaman dibaca lewat lapisan teks (tanpa OCR) — dipakai UI. */
  fast?: boolean;
}

// Binary wasm zxing di-host sendiri dari /public (bawaannya menarik dari CDN
// jsDelivr). Pembacaan barcode-lah yang membuat nomor resi eksak — jangan
// gantungkan pada jaringan pihak ketiga yang bisa diblokir jaringan kantor.
// Disalin ulang tiap `npm install` lewat script postinstall.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path,
  },
});

/**
 * pdf.js memanggil `Promise.withResolvers`, yang baru ada di Safari/iOS 17.4.
 * Tanpa tambalan ini, iPhone yang belum diperbarui gagal sejak baris pertama
 * pustaka — dan kegagalannya muncul sebagai "berkas tidak bisa dibaca", seolah
 * berkasnya yang bermasalah. (Worker pdf.js punya salinan tambalan sendiri,
 * disisipkan saat aset disalin ke /public — konteksnya terpisah dari sini.)
 */
if (typeof Promise.withResolvers !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/**
 * Lepaskan memori kanvas segera setelah dipakai.
 *
 * Satu halaman 400 dpi memakan belasan MB, dan Safari di iPhone jauh lebih
 * ketat soal ini daripada browser desktop: menunggu pemulung sampah membuat
 * berkas berpuluh halaman berisiko dihentikan di tengah jalan.
 */
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfjsPromise: Promise<any> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/* ══════════════════════ ukuran & ambang ══════════════════════ */

/** Resolusi render untuk barcode. Code128 di label tipis; di bawah ini zxing
 *  mulai gagal membaca. */
const BARCODE_DPI = 400;
/** Resolusi render untuk OCR. Tesseract tidak butuh setajam barcode, dan
 *  biayanya naik kuadratik terhadap resolusi — separuh dpi = seperempat piksel. */
const OCR_DPI = 200;
/** Lebar pratinjau di kartu review. */
const THUMB_W = 480;
/** Sebuah halaman dianggap punya lapisan teks yang layak kalau sebanyak ini
 *  karakter terbaca DAN ada penanda label di dalamnya. */
const TEXT_LAYER_MIN_CHARS = 80;
/** Berapa halaman dikerjakan bersamaan di jalur teks. Render tetap di main
 *  thread, jadi angka besar tidak menolong dan hanya menambah beban memori. */
const TEXT_LANE_CONCURRENCY = 3;
/** Berapa halaman awal yang barcodenya tetap dibaca sebagai uji petik pada
 *  berkas digital — lihat alasannya di `extractPdf`. */
const SPOT_CHECK_PAGES = 5;

/* ══════════════════════ util barcode ══════════════════════ */

function toAwb(raw: string): string {
  const m = (raw || "").trim().match(AWB_RE);
  return m ? m[0].toUpperCase() : "";
}

async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
  const ctx = canvas.getContext("2d")!;
  try {
    const res = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
      formats: ["Code128", "Code39", "ITF", "QRCode", "DataMatrix"],
      tryHarder: true,
      maxNumberOfSymbols: 20,
    });
    return res.map((r) => toAwb(r.text || "")).filter(Boolean);
  } catch {
    return [];
  }
}

function cropCanvas(
  src: HTMLCanvasElement,
  rx: number, ry: number, rw: number, rh: number, scale: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * rw * scale));
  c.height = Math.max(1, Math.round(src.height * rh * scale));
  c.getContext("2d")!.drawImage(
    src,
    Math.round(src.width * rx), Math.round(src.height * ry),
    Math.round(src.width * rw), Math.round(src.height * rh),
    0, 0, c.width, c.height,
  );
  return c;
}

/**
 * Potongan area barcode, diurutkan dari yang paling mungkin & paling murah.
 * Crop kecil jauh lebih akurat daripada memindai satu halaman penuh. Nilainya
 * di-tuning untuk label A6 J&T & Lion Parcel; untuk kurir dengan tata letak
 * lain, tambahkan region baru DI DEPAN daftar ini.
 */
const REGIONS: [number, number, number, number, number][] = [
  [0.01, 0.045, 0.3, 0.075, 2],
  [0.0, 0.3, 0.42, 0.08, 2],
  [0.0, 0.1, 0.72, 0.09, 2],
  [0.0, 0.0, 0.75, 0.55, 1],
  [0.0, 0.0, 0.42, 0.4, 1.5],
  [0.0, 0.0, 0.42, 0.4, 1],
];

/**
 * Baca barcode dari sebuah halaman yang sudah dirender.
 *
 * `stopWhen` memberi jalan keluar lebih awal: di jalur teks kita sudah memegang
 * nomor resi dari teks PDF, jadi satu pembacaan barcode yang cocok dengannya
 * sudah cukup untuk memastikan — tidak perlu memindai semua region.
 */
async function decodePage(
  canvas: HTMLCanvasElement,
  stopWhen?: (found: string[]) => boolean,
): Promise<string[]> {
  const found: string[] = [];
  for (const [rx, ry, rw, rh, scale] of REGIONS) {
    found.push(...(await decodeCanvas(cropCanvas(canvas, rx, ry, rw, rh, scale))));
    if (stopWhen ? stopWhen(found) : found.length >= 2 && new Set(found).size === 1) break;
  }
  return found;
}

function thumbnailOf(canvas: HTMLCanvasElement): string {
  const tw = Math.min(THUMB_W, canvas.width);
  const th = Math.round((canvas.height / canvas.width) * tw);
  const tc = document.createElement("canvas");
  tc.width = tw;
  tc.height = th;
  tc.getContext("2d")!.drawImage(canvas, 0, 0, tw, th);
  return tc.toDataURL("image/jpeg", 0.72);
}

/* ══════════════════════ lapisan teks PDF ══════════════════════ */

/**
 * Susun ulang baris dari item teks pdf.js.
 *
 * pdf.js mengembalikan potongan teks beserta posisinya, tanpa baris. Parser
 * label bekerja per baris ("Penerima: NAMA ****1234" lalu alamat di bawahnya),
 * jadi potongan dengan posisi Y yang sama digabung jadi satu baris dan diurutkan
 * kiri→kanan. Tanpa ini, nama dan alamat bisa tertukar urutannya.
 */
function linesFromTextContent(tc: any, tolerance = 2): string[] {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
  for (const it of tc.items ?? []) {
    const str: string = it.str ?? "";
    if (!str.trim()) continue;
    const y: number = it.transform[5];
    const x: number = it.transform[4];
    let row = rows.find((r) => Math.abs(r.y - y) <= tolerance);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) =>
    r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(" ").replace(/\s+/g, " ").trim(),
  );
}

function hasUsableTextLayer(lines: string[]): boolean {
  const flat = lines.join(" ");
  return flat.length >= TEXT_LAYER_MIN_CHARS && /penerima|pengirim/i.test(flat);
}

/* ══════════════════════ kumpulan worker OCR ══════════════════════ */

/**
 * Tesseract baru dinyalakan kalau memang ada halaman yang butuh OCR.
 *
 * Memuat mesin + data bahasa `ind+eng` memakan beberapa detik dan belasan MB
 * unduhan. Batch PDF digital tidak boleh membayar ongkos itu sama sekali.
 */
let schedulerPromise: Promise<Scheduler> | null = null;

/** Apakah mesin OCR sudah (atau sedang) disiapkan — dipakai untuk memberi tahu
 *  pengguna saat pemuatan pertama, yang memakan beberapa detik. */
export function isOcrEngineStarted(): boolean {
  return schedulerPromise !== null;
}

async function getScheduler(): Promise<Scheduler> {
  if (!schedulerPromise) {
    schedulerPromise = (async () => {
      // Sisakan satu inti untuk UI supaya halaman tidak membeku saat memproses.
      const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
      const n = Math.max(1, Math.min(4, cores - 1));
      const scheduler = createScheduler();
      const workers = await Promise.all(Array.from({ length: n }, () => createWorker("ind+eng")));
      for (const w of workers) scheduler.addWorker(w);
      return scheduler;
    })();
  }
  return schedulerPromise;
}

async function disposeScheduler() {
  const pending = schedulerPromise;
  schedulerPromise = null;
  if (!pending) return;
  try {
    (await pending).terminate();
  } catch {
    /* abaikan */
  }
}

/** Ubah canvas jadi blob sekali saja: tesseract.js menerima Blob apa adanya,
 *  sementara canvas akan dikodekan ulang jadi PNG di dalam sana. */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode_failed"))),
      "image/png",
    );
  });
}

async function ocrText(canvas: HTMLCanvasElement): Promise<string> {
  const scheduler = await getScheduler();
  const blob = await canvasToBlob(canvas);
  // Hanya teks yang diminta. Bawaannya Tesseract juga menyusun hOCR, TSV, dan
  // kotak per kata — semuanya dibuang di sini, dan menyusunnya tidak gratis.
  const { data } = (await scheduler.addJob("recognize", blob, {}, {
    text: true, blocks: false, hocr: false, tsv: false, box: false, unlv: false, osd: false,
  })) as any;
  return data?.text ?? "";
}

/* ══════════════════════ render halaman ══════════════════════ */

/** Render selebar `targetW` piksel, apa pun ukuran halamannya — label A6,
 *  A4, atau ukuran kurir lain sama-sama menghasilkan pratinjau yang pas. */
async function renderPageToWidth(page: any, targetW: number): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  return renderPage(page, (targetW / base.width) * 72);
}

/**
 * Render HANYA sepotong halaman pada resolusi penuh.
 *
 * Untuk memeriksa barcode kita tidak butuh seluruh label — hanya sudut tempat
 * barcodenya dicetak. Merender seperempat halaman berarti seperempat piksel,
 * dan render beresolusi barcode adalah operasi termahal di seluruh proses.
 */
async function renderRegion(
  page: any, dpi: number, rx: number, ry: number, rw: number, rh: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width * rw);
  canvas.height = Math.ceil(viewport.height * rh);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
    // Geser isi halaman supaya sudut yang diinginkan jatuh di titik 0,0 kanvas.
    transform: [1, 0, 0, 1, -viewport.width * rx, -viewport.height * ry],
  }).promise;
  return canvas;
}

async function renderPage(page: any, dpi: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  // pdfjs v6 butuh properti `canvas` di samping canvasContext + viewport.
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

function downscale(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * factor));
  c.height = Math.max(1, Math.round(src.height * factor));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Jalankan tugas dengan batas berapa yang boleh berjalan bersamaan. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(lanes);
  return out;
}

/* ══════════════════════ pratinjau yang dirender saat dibutuhkan ══════════════════════ */

/** Berapa pratinjau disimpan di memori sekaligus. Satu pratinjau ±40 KB, dan
 *  yang terlihat di layar tidak pernah lebih dari belasan. */
const THUMB_CACHE_MAX = 80;

export interface PageImageStore {
  /** Pratinjau halaman (data URL), dirender saat pertama kali diminta. */
  get(page: number): Promise<string | null>;
  /** Lepaskan dokumen PDF yang masih dibuka. Wajib dipanggil saat batch diganti. */
  dispose(): Promise<void>;
}

/**
 * Merender pratinjau untuk SEMUA halaman di depan adalah pemborosan terbesar
 * yang tersisa: 150 halaman × ±30 ms hanya untuk gambar kecil yang mungkin tidak
 * pernah dilihat, sebab layar hanya memuat belasan kartu sekaligus. Jadi dokumen
 * PDF-nya dibiarkan terbuka dan pratinjaunya dibuat saat kartunya benar-benar
 * masuk layar.
 */
class LazyPageImages implements PageImageStore {
  private docs = new Map<string, any>();
  private refs = new Map<number, { file: string; pageInFile: number }>();
  private cache = new Map<number, string>();
  private inflight = new Map<number, Promise<string | null>>();

  keepDoc(file: string, doc: any) {
    this.docs.set(file, doc);
  }

  /** Halaman yang pratinjaunya nanti dirender dari dokumen yang masih terbuka. */
  defer(page: number, file: string, pageInFile: number) {
    this.refs.set(page, { file, pageInFile });
  }

  /** Halaman yang gambarnya sudah terlanjur ada (jalur OCR & foto). */
  put(page: number, dataUrl: string) {
    this.cache.set(page, dataUrl);
  }

  async get(page: number): Promise<string | null> {
    const hit = this.cache.get(page);
    if (hit) return hit;
    const pending = this.inflight.get(page);
    if (pending) return pending;

    const ref = this.refs.get(page);
    const doc = ref ? this.docs.get(ref.file) : null;
    if (!ref || !doc) return null;

    const job = (async () => {
      try {
        const pdfPage = await doc.getPage(ref.pageInFile);
        const canvas = await renderPageToWidth(pdfPage, THUMB_W);
        const url = thumbnailOf(canvas);
        releaseCanvas(canvas);
        pdfPage.cleanup();
        this.cache.set(page, url);
        // Buang yang paling lama kalau simpanan penuh (Map menjaga urutan masuk).
        while (this.cache.size > THUMB_CACHE_MAX) {
          const oldest = this.cache.keys().next().value;
          if (oldest === undefined) break;
          this.cache.delete(oldest);
        }
        return url;
      } catch {
        return null;
      } finally {
        this.inflight.delete(page);
      }
    })();
    this.inflight.set(page, job);
    return job;
  }

  async dispose() {
    this.cache.clear();
    this.refs.clear();
    this.inflight.clear();
    for (const doc of this.docs.values()) {
      try {
        if (typeof doc.destroy === "function") await doc.destroy();
      } catch {
        /* abaikan */
      }
    }
    this.docs.clear();
  }
}

/* ══════════════════════ pemrosesan berkas ══════════════════════ */

export const ACCEPTED_TYPES = "application/pdf,image/png,image/jpeg,image/webp";

export function isSupportedLabelFile(file: File): boolean {
  return /\.(pdf|png|jpe?g|webp)$/i.test(file.name) || /^(application\/pdf|image\/)/i.test(file.type);
}

async function loadImageCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image_unreadable"));
      i.src = url;
    });
    // Foto HP sering terlalu kecil untuk zxing membaca Code128 yang tipis →
    // di-upscale ke 3400–4400 px lebar sebelum di-decode.
    const targetW = Math.min(4400, Math.max(3400, img.naturalWidth));
    const scale = targetW / img.naturalWidth;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function visualOf(
  page: number,
  origin: PageVisual["origin"],
  barcodes: string[],
  textTracking: string | null,
  textMode: PageVisual["textMode"],
): PageVisual {
  const counts = new Map<string, number>();
  for (const b of barcodes) counts.set(b, (counts.get(b) || 0) + 1);
  let tracking: string | null = null;
  let best = 0;
  for (const [val, cnt] of counts) {
    if (cnt > best) {
      best = cnt;
      tracking = val;
    }
  }
  return {
    page,
    origin,
    barcodes: [...counts.keys()],
    tracking,
    // Dua pembacaan identik = pasti. Satu pembacaan yang cocok dengan nomor di
    // teks PDF juga pasti: keduanya sumber independen yang saling membenarkan.
    trackingConfirmed: best >= 2 || (!!tracking && tracking === textTracking),
    textTracking,
    textMode,
  };
}

interface FileResult {
  visuals: PageVisual[];
  rows: ParsedRow[];
  /** Berapa halaman dibaca lewat lapisan teks, dan berapa lewat OCR. */
  textPages: number;
  ocrPages: number;
}

/** Sudut halaman tempat barcode dicetak (label A6 J&T/Lion): cukup untuk uji
 *  petik tanpa merender seluruh halaman. */
const BARCODE_CORNER: [number, number, number, number] = [0, 0, 0.8, 0.45];

async function extractPdf(
  file: File,
  startPage: number,
  images: LazyPageImages,
  onProgress: ((p: OcrProgress) => void) | undefined,
  onFirstRow: ((row: ParsedRow) => void) | undefined,
  meta: { file: string; fileIndex?: number; fileCount?: number },
): Promise<FileResult> {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const total: number = pdf.numPages;
  const visuals: PageVisual[] = new Array(total);
  const rows: ParsedRow[] = new Array(total);
  let done = 0;
  let textPages = 0;
  let ocrPages = 0;
  /** Berapa halaman uji petik yang barcodenya cocok dengan teks PDF-nya. */
  let spotAgree = 0;
  let spotChecked = 0;

  /**
   * Proses satu halaman. `verifyBarcode` menentukan apakah halaman ini dirender
   * pada resolusi barcode — bagian termahal dari seluruh proses.
   */
  const handlePage = async (n: number, verifyBarcode: boolean) => {
    const page = await pdf.getPage(n);
    const globalPage = startPage + n - 1;
    const origin = { file: file.name, pageInFile: n };

    // Keputusan diambil PER HALAMAN, bukan per berkas: satu PDF bisa memuat
    // halaman cetakan digital sekaligus halaman hasil pindai/gambar (mis. label
    // susulan yang difoto lalu digabung). Memeriksanya murah — lapisan teksnya
    // terbaca dalam hitungan milidetik.
    const lines = linesFromTextContent(await page.getTextContent());
    const useText = hasUsableTextLayer(lines);

    let text: string;
    let textTracking: string | null = null;
    let barcodes: string[] = [];
    let corner: HTMLCanvasElement | null = null;

    if (useText) {
      textPages++;
      text = lines.join("\n");
      textTracking = toAwb(text) || null;

      // Halaman tanpa nomor resi di teksnya tidak punya sumber eksak lain, jadi
      // barcodenya selalu dibaca berapa pun hasil uji petiknya.
      if (verifyBarcode || !textTracking) {
        const [rx, ry, rw, rh] = BARCODE_CORNER;
        corner = await renderRegion(page, BARCODE_DPI, rx, ry, rw, rh);
        barcodes = await decodeCanvas(corner);
        if (!barcodes.length) {
          // Sudut biasa gagal → tata letak label ini berbeda; baru rendernya
          // diperluas ke seluruh halaman.
          const full = await renderPage(page, BARCODE_DPI);
          barcodes = await decodePage(full, (found) =>
            textTracking ? found.includes(textTracking) : found.length >= 2 && new Set(found).size === 1,
          );
          releaseCanvas(full);
        }
        if (textTracking) {
          spotChecked++;
          if (barcodes.includes(textTracking)) spotAgree++;
        }
      }
      // Pratinjaunya dirender nanti, hanya kalau kartunya benar-benar dilihat.
      images.defer(globalPage, file.name, n);
      if (corner) releaseCanvas(corner);
    } else {
      // Halaman gambar: tidak ada teks untuk dibaca, jadi gambarnya diubah dulu
      // menjadi teks lewat OCR. Pemuatan mesinnya makan beberapa detik dan hanya
      // terjadi sekali — beri tahu pengguna daripada terlihat menggantung.
      if (!isOcrEngineStarted()) onProgress?.({ stage: "engine", ...meta });
      ocrPages++;
      const canvas = await renderPage(page, BARCODE_DPI);
      barcodes = await decodePage(canvas);
      text = await ocrText(downscale(canvas, OCR_DPI / BARCODE_DPI));
      // Gambarnya sudah ada di tangan — pratinjaunya diambil sekarang saja.
      images.put(globalPage, thumbnailOf(canvas));
      releaseCanvas(canvas);
    }

    const i = n - 1;
    visuals[i] = visualOf(globalPage, origin, barcodes, textTracking, useText ? "text" : "ocr");
    rows[i] = parseLabelFields(text, globalPage);
    // Halaman pertama yang selesai cukup untuk menentukan jendela tanggal
    // pencarian order — dipakai memanaskan pool sementara sisanya masih dibaca.
    onFirstRow?.(rows[i]);
    page.cleanup();

    done++;
    onProgress?.({ stage: "pages", page: done, total, fast: useText, ...meta });
  };

  try {
    const pages = Array.from({ length: total }, (_, i) => i + 1);
    const head = pages.slice(0, SPOT_CHECK_PAGES);
    const tail = pages.slice(SPOT_CHECK_PAGES);

    // Gelombang pertama selalu memverifikasi barcode — dan dijalankan satu per
    // satu, karena render 400 dpi adalah puncak pemakaian memori. Di ponsel,
    // tiga render sekaligus cukup untuk membuat halaman dihentikan browser.
    await mapLimit(head, 1, (n) => handlePage(n, true));

    /**
     * Kalau setiap halaman uji petik menunjukkan barcode yang sama persis dengan
     * nomor di lapisan teksnya, sisa halaman tidak perlu lagi dirender pada
     * resolusi barcode: keduanya berasal dari satu berkas cetak yang sama, dan
     * teks digital bukan hasil pembacaan yang bisa meleset — ia huruf yang
     * memang ditulis ke dalam PDF. Begitu ada SATU saja yang tidak cocok,
     * seluruh sisa berkas diverifikasi seperti semula.
     */
    const trustText = spotChecked > 0 && spotAgree === spotChecked;
    await mapLimit(tail, TEXT_LANE_CONCURRENCY, (n) => handlePage(n, !trustText));
  } catch (e) {
    // Dokumen hanya ditutup saat gagal; kalau sukses ia tetap dibuka supaya
    // pratinjau bisa dirender belakangan (ditutup lewat images.dispose()).
    try {
      if (typeof pdf.destroy === "function") await pdf.destroy();
    } catch {
      /* abaikan */
    }
    throw e;
  }

  images.keepDoc(file.name, pdf);
  return { visuals, rows, textPages, ocrPages };
}

async function extractImage(
  file: File,
  startPage: number,
  images: LazyPageImages,
  onProgress: ((p: OcrProgress) => void) | undefined,
  meta: { file: string; fileIndex?: number; fileCount?: number },
): Promise<FileResult> {
  // Foto label dikecilkan dulu dengan algoritma kompresi yang sama dengan
  // pengunggahan berkas lain (WebP nyaris tanpa kehilangan kualitas, di Web
  // Worker). Batas resolusinya dinaikkan ke 4400 px: itu ukuran yang dipakai
  // pipeline untuk mendekode barcode, jadi mengecilkan berkas tidak pernah
  // menghapus detail yang dibutuhkan.
  onProgress?.({ stage: "compress", ...meta });
  const blob = await compressImageBlob(file, {
    recompressAboveMB: 2,
    targetMaxMB: 5,
    maxDimension: 4400,
    quality: 0.95,
  });

  if (!isOcrEngineStarted()) onProgress?.({ stage: "engine", ...meta });
  onProgress?.({ stage: "pages", page: 1, total: 1, fast: false, ...meta });
  const canvas = await loadImageCanvas(blob);
  const barcodes = await decodePage(canvas);
  const text = await ocrText(downscale(canvas, 0.5));

  images.put(startPage, thumbnailOf(canvas));
  return {
    visuals: [visualOf(startPage, { file: file.name, pageInFile: 1 }, barcodes, null, "ocr")],
    rows: [parseLabelFields(text, startPage)],
    textPages: 0,
    ocrPages: 1,
  };
}

export interface FileFailure {
  file: string;
  /** Pesan asli dari pustaka — ditampilkan apa adanya supaya bisa didiagnosis. */
  reason: string;
}

export interface ExtractOutcome {
  visuals: PageVisual[];
  rows: ParsedRow[];
  /** Berkas yang gagal dibaca; berkas lain di antrean tetap diproses. */
  failures: FileFailure[];
  /** Halaman yang dibaca langsung dari lapisan teks PDF (tanpa OCR). */
  textPages: number;
  /** Halaman gambar yang harus diubah jadi teks lewat OCR. */
  ocrPages: number;
  /** Sumber pratinjau; panggil dispose() saat batch diganti atau layar ditutup. */
  images: PageImageStore;
}

/**
 * Baca satu atau banyak berkas label sekaligus.
 *
 * Berkas diproses berurutan, bukan paralel: satu berkas PDF sudah memakai
 * seluruh CPU lewat jalurnya masing-masing, dan memparalelkan antar berkas
 * hanya memperbesar puncak pemakaian memori di ponsel.
 */
export async function extractFromFiles(
  files: File[],
  onProgress?: (p: OcrProgress) => void,
  /** Dipanggil sekali, pada halaman pertama yang selesai dibaca. */
  onFirstRow?: (row: ParsedRow) => void,
): Promise<ExtractOutcome> {
  const visuals: PageVisual[] = [];
  const rows: ParsedRow[] = [];
  const images = new LazyPageImages();
  const failures: FileFailure[] = [];
  let textPages = 0;
  let ocrPages = 0;
  if (!files.length) return { visuals, rows, failures, textPages, ocrPages, images };

  try {
    let nextPage = 1;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = { file: file.name, fileIndex: i + 1, fileCount: files.length };
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
      let firstSeen = false;
      const first = (row: ParsedRow) => {
        if (firstSeen) return;
        firstSeen = true;
        onFirstRow?.(row);
      };
      let res;
      try {
        res = isImage
          ? await extractImage(file, nextPage, images, onProgress, meta)
          : await extractPdf(file, nextPage, images, onProgress, first, meta);
      } catch (e) {
        // Satu berkas rusak/tidak didukung tidak boleh membuang hasil berkas
        // lain yang sudah terbaca. Alasannya dibawa keluar apa adanya.
        failures.push({ file: file.name, reason: e instanceof Error ? e.message : String(e) });
        continue;
      }

      visuals.push(...res.visuals);
      rows.push(...res.rows);
      textPages += res.textPages;
      ocrPages += res.ocrPages;
      nextPage += res.visuals.length;
    }
  } finally {
    // Worker OCR hanya hidup kalau tadi memang dipakai.
    await disposeScheduler();
  }
  return { visuals, rows, failures, textPages, ocrPages, images };
}

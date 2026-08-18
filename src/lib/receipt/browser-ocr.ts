"use client";

/**
 * Pipeline OCR resi — SEMUANYA jalan di perangkat pengguna, tidak ada berkas
 * yang diunggah ke server: pdf.js merender halaman, zxing membaca barcode AWB,
 * tesseract.js membaca teks label, dan `local-extract` mem-parsenya. Hanya
 * potongan teks kecil (nama/kodepos/4 digit HP) yang belakangan dikirim ke
 * server untuk dicocokkan ke Shopify.
 *
 * Konsekuensinya: berkas sebesar apa pun boleh diproses (tidak menyentuh batas
 * body serverless ~4.5MB) dan data pelanggan tidak pernah melewati jaringan.
 */

import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { createWorker, type Worker } from "tesseract.js";
import { compressImageBlob } from "@/lib/image";
import { AWB_RE, type PageVisual } from "./label-core";
import { parseLabelFields, type ParsedRow } from "./local-extract";

export interface OcrProgress {
  stage: "compress" | "engine" | "pages" | "match";
  page?: number;
  total?: number;
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

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfjsPromise: Promise<any> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Worker di-host sendiri dari /public — tanpa CDN eksternal. Versinya
      // disalin ulang tiap `npm install` lewat script postinstall; kalau beda
      // versi dengan pdfjs-dist, pdf.js menolak dengan "API version does not
      // match the Worker version".
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function cropImageData(
  canvas: HTMLCanvasElement,
  sx: number, sy: number, sw: number, sh: number, scale: number,
): ImageData {
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

async function decodeRegion(
  canvas: HTMLCanvasElement,
  rx: number, ry: number, rw: number, rh: number, scale: number,
): Promise<string[]> {
  const W = canvas.width;
  const H = canvas.height;
  const id = cropImageData(
    canvas,
    Math.round(W * rx), Math.round(H * ry),
    Math.round(W * rw), Math.round(H * rh),
    scale,
  );
  try {
    const res = await readBarcodes(id, {
      formats: ["Code128", "Code39", "ITF", "QRCode", "DataMatrix"],
      tryHarder: true,
      maxNumberOfSymbols: 20,
    });
    return res
      .map((r) => (r.text || "").trim())
      .map((t) => (t.match(AWB_RE) ? t.match(AWB_RE)![0].toUpperCase() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Potongan area barcode, diurutkan dari yang paling mungkin & paling murah.
 * Crop kecil jauh lebih akurat daripada memindai satu halaman penuh. Nilainya
 * di-tuning untuk label A6 J&T & Lion Parcel (barcode di kiri-atas dan sekitar
 * 30% tinggi halaman); untuk kurir dengan tata letak lain, tambahkan region
 * baru DI DEPAN daftar ini.
 */
const REGIONS: [number, number, number, number, number][] = [
  [0.01, 0.045, 0.3, 0.075, 2],
  [0.0, 0.3, 0.42, 0.08, 2],
  [0.0, 0.1, 0.72, 0.09, 2],
  [0.0, 0.0, 0.75, 0.55, 1],
  [0.0, 0.0, 0.42, 0.4, 1.5],
  [0.0, 0.0, 0.42, 0.4, 1],
];

async function decodePage(canvas: HTMLCanvasElement): Promise<string[]> {
  const found: string[] = [];
  for (const [rx, ry, rw, rh, scale] of REGIONS) {
    found.push(...(await decodeRegion(canvas, rx, ry, rw, rh, scale)));
    // Dua pembacaan yang identik sudah cukup: itu yang menandai AWB "pasti".
    if (found.length >= 2 && new Set(found).size === 1) break;
  }
  return found;
}

/** Pratinjau kecil untuk kartu review — cukup untuk diperiksa mata, hemat memori. */
function thumbnailOf(canvas: HTMLCanvasElement): string {
  const tw = 520;
  const th = Math.round((canvas.height / canvas.width) * tw);
  const tc = document.createElement("canvas");
  tc.width = tw;
  tc.height = th;
  tc.getContext("2d")!.drawImage(canvas, 0, 0, tw, th);
  return tc.toDataURL("image/jpeg", 0.72);
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

async function processCanvas(
  canvas: HTMLCanvasElement,
  n: number,
  worker: Worker,
  visuals: PageVisual[],
  rows: ParsedRow[],
) {
  const barcodes = await decodePage(canvas);
  const { data } = await worker.recognize(canvas);

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

  visuals.push({
    page: n,
    barcodes: [...counts.keys()],
    tracking,
    trackingConfirmed: best >= 2,
    thumbnail: thumbnailOf(canvas),
  });
  rows.push(parseLabelFields(data.text || "", n));
}

/** Tipe berkas yang diterima pemilih berkas. */
export const ACCEPTED_TYPES = "application/pdf,image/png,image/jpeg,image/webp";

export function isSupportedLabelFile(file: File): boolean {
  return /\.(pdf|png|jpe?g|webp)$/i.test(file.name) || /^(application\/pdf|image\/)/i.test(file.type);
}

export async function extractFromFile(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<{ visuals: PageVisual[]; rows: ParsedRow[] }> {
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
  const visuals: PageVisual[] = [];
  const rows: ParsedRow[] = [];

  // Foto label dikecilkan dulu dengan algoritma kompresi yang sama dengan
  // pengunggahan berkas lain (WebP nyaris tanpa kehilangan kualitas, di Web
  // Worker). Batas resolusinya sengaja dinaikkan ke 4400 px: itu ukuran yang
  // dipakai pipeline untuk mendekode barcode, jadi mengecilkan berkas tidak
  // pernah menghapus detail yang dibutuhkan.
  let source: Blob = file;
  if (isImage) {
    onProgress?.({ stage: "compress" });
    source = await compressImageBlob(file, {
      recompressAboveMB: 2,
      targetMaxMB: 5,
      maxDimension: 4400,
      quality: 0.95,
    });
  }

  onProgress?.({ stage: "engine" });
  // "ind+eng": label berbahasa Indonesia dengan istilah Inggris. Data bahasanya
  // diunduh sekali dari CDN lalu di-cache browser.
  const worker = await createWorker("ind+eng");

  try {
    if (isImage) {
      onProgress?.({ stage: "pages", page: 1, total: 1 });
      await processCanvas(await loadImageCanvas(source), 1, worker, visuals, rows);
    } else {
      const pdfjs = await getPdfjs();
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      const total: number = pdf.numPages;
      const scale = 400 / 72; // ≈400 dpi — cukup tajam untuk Code128 yang tipis.
      for (let n = 1; n <= total; n++) {
        onProgress?.({ stage: "pages", page: n, total });
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d")!;
        // pdfjs v6 butuh properti `canvas` di samping canvasContext + viewport.
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        page.cleanup();
        await processCanvas(canvas, n, worker, visuals, rows);
      }
      try {
        if (typeof pdf.destroy === "function") await pdf.destroy();
      } catch {
        /* abaikan */
      }
    }
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* abaikan */
    }
  }
  return { visuals, rows };
}

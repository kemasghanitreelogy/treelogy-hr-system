/**
 * QR helpers di atas engine nayuki/QR-Code-generator (vendored di ./qrcodegen).
 *
 * Satu matriks dihitung sekali lalu dipakai ulang oleh semua renderer (SVG di
 * layar, SVG unduhan, PNG canvas, vektor PDF) — tidak ada encoding ganda.
 *
 * Rendering SVG memakai SATU <path> gabungan, bukan ratusan <rect>: ~1 node DOM
 * per QR, jadi menampilkan puluhan QR sekaligus (lembar label) tetap ringan.
 */

import { qrcodegen } from "./qrcodegen";

const { QrCode } = qrcodegen;
type Ecc = qrcodegen.QrCode.Ecc;

/** Level koreksi error. Default QUARTILE: label tertempel di barang yang bisa
 *  tergores/berdebu, jadi toleransi 25% jauh lebih aman dari MEDIUM. */
export const ECC = {
  low: QrCode.Ecc.LOW,
  medium: QrCode.Ecc.MEDIUM,
  quartile: QrCode.Ecc.QUARTILE,
  high: QrCode.Ecc.HIGH,
} as const;

export type EccLevel = keyof typeof ECC;

export interface QrMatrix {
  /** Jumlah modul per sisi (tanpa quiet zone). */
  size: number;
  /** modules[y][x] — true = modul gelap. */
  modules: boolean[][];
}

/** Encode teks → matriks modul. Lempar Error bila teks terlalu panjang. */
export function qrMatrix(text: string, ecc: EccLevel = "quartile"): QrMatrix {
  const qr = QrCode.encodeText(text, ECC[ecc] as Ecc);
  const modules: boolean[][] = [];
  for (let y = 0; y < qr.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < qr.size; x++) row.push(qr.getModule(x, y));
    modules.push(row);
  }
  return { size: qr.size, modules };
}

export interface QrPath {
  /** Sisi viewBox = size + border × 2. */
  viewBox: number;
  /** Atribut `d` untuk satu <path> berisi seluruh modul gelap. */
  d: string;
}

/**
 * Matriks → satu path SVG. Modul yang bersebelahan horizontal digabung jadi satu
 * rect memanjang (run-length), sehingga string path jauh lebih pendek dan
 * rasterizer tidak melihat garis rambut di antara modul.
 */
export function matrixToPath({ size, modules }: QrMatrix, border = 2): QrPath {
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!modules[y][x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && modules[y][x + run]) run++;
      parts.push(`M${x + border},${y + border}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return { viewBox: size + border * 2, d: parts.join("") };
}

/** Teks → path SVG siap render. */
export function qrSvgPath(text: string, opts: { ecc?: EccLevel; border?: number } = {}): QrPath {
  return matrixToPath(qrMatrix(text, opts.ecc ?? "quartile"), opts.border ?? 2);
}

/**
 * SVG standalone (untuk diunduh atau ditempel ke halaman cetak).
 * Quiet zone default 4 modul — sesuai spesifikasi QR untuk hasil cetak.
 */
export function qrSvgMarkup(
  text: string,
  opts: { ecc?: EccLevel; border?: number; dark?: string; light?: string } = {},
): string {
  const { viewBox, d } = qrSvgPath(text, { ecc: opts.ecc, border: opts.border ?? 4 });
  const dark = opts.dark ?? "#1f241b";
  const light = opts.light ?? "#ffffff";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" shape-rendering="crispEdges">`,
    `<rect width="${viewBox}" height="${viewBox}" fill="${light}"/>`,
    `<path d="${d}" fill="${dark}"/>`,
    `</svg>`,
  ].join("");
}

/**
 * PNG data URL lewat canvas (khusus browser). `scale` = piksel per modul —
 * default 12 menghasilkan ±400px untuk QR versi kecil, cukup tajam untuk dicetak
 * ulang atau dikirim lewat chat.
 */
export function qrPngDataUrl(
  text: string,
  opts: { ecc?: EccLevel; border?: number; scale?: number; dark?: string; light?: string } = {},
): string {
  const border = opts.border ?? 4;
  const scale = opts.scale ?? 12;
  const matrix = qrMatrix(text, opts.ecc ?? "quartile");
  const side = (matrix.size + border * 2) * scale;

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = opts.light ?? "#ffffff";
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = opts.dark ?? "#1f241b";
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
      }
    }
  }
  return canvas.toDataURL("image/png");
}

/**
 * Payload yang di-encode ke QR: URL absolut ke halaman inventaris dengan kode
 * barang. Dipindai kamera bawaan HP → langsung membuka detail barang; dipindai
 * scanner apa pun → tetap memuat kode yang unik.
 */
export function itemQrPayload(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/inventory?item=${encodeURIComponent(code)}`;
}

/** Kode barang dari sebuah payload QR (URL atau kode polos). Null bila bukan kode valid. */
export function parseQrPayload(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const direct = text.match(/^INV-\d{4,}$/i);
  if (direct) return text.toUpperCase();
  try {
    const url = new URL(text);
    const code = url.searchParams.get("item");
    if (code && /^INV-\d{4,}$/i.test(code)) return code.toUpperCase();
  } catch {
    /* bukan URL — jatuh ke pencarian pola di bawah */
  }
  const loose = text.match(/INV-\d{4,}/i);
  return loose ? loose[0].toUpperCase() : null;
}

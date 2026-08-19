import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { AWB_RE } from "@/lib/receipt/label-core";
import { parseLabelFields, type ParsedRow } from "@/lib/receipt/local-extract";
import { hasUsableTextLayer, linesFromTextContent } from "@/lib/receipt/pdf-text";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Jalan kedua: membaca lapisan teks PDF DI SERVER.
 *
 * Jalur utamanya tetap di perangkat pengguna — berkas tidak diunggah ke mana
 * pun. Tetapi perangkat yang beberapa versi tertinggal tidak sanggup menjalankan
 * pustaka PDF sama sekali, dan bagi orang yang memakainya menu ini jadi mentok
 * total. Route ini menutup keadaan itu: klien baru memanggilnya SETELAH
 * pembacaan lokal gagal, dan pengguna diberi tahu bahwa berkasnya diproses di
 * server.
 *
 * Yang dikerjakan hanya membaca teks — tanpa rendering gambar, tanpa OCR. Label
 * yang dicetak sistem kurir adalah PDF digital, jadi teksnya sudah lengkap;
 * halaman yang berupa gambar memang tidak bisa dilayani di sini dan dilaporkan
 * apa adanya.
 *
 * Tidak ada yang disimpan: berkasnya hidup di memori selama permintaan berjalan,
 * lalu hilang bersama akhir permintaan.
 */

/** Batas ukuran berkas. Vercel menerima body sampai 100MB; angka ini menjaga
 *  pemakaian memori satu permintaan tetap wajar. */
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function openPdf(data: Uint8Array): Promise<any> {
  // Build "legacy" juga di sini: ia yang dirancang jalan di luar browser modern,
  // termasuk di runtime Node tanpa DOM.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({
    data,
    // Tanpa DOM: jangan memuat font ke halaman, dan jangan memakai eval.
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
}

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "receipt.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const buf = await req.arrayBuffer().catch(() => null);
  if (!buf || buf.byteLength === 0) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 413 });

  const startPage = Number(new URL(req.url).searchParams.get("start") || "1") || 1;

  let pdf: any;
  try {
    pdf = await openPdf(new Uint8Array(buf));
  } catch {
    return NextResponse.json({ error: "pdf_unreadable" }, { status: 422 });
  }

  const total: number = Math.min(pdf.numPages, MAX_PAGES);
  const rows: ParsedRow[] = [];
  const awbs: (string | null)[] = [];
  let textPages = 0;

  try {
    for (let n = 1; n <= total; n++) {
      let lines: string[] = [];
      try {
        const page = await pdf.getPage(n);
        lines = linesFromTextContent(await page.getTextContent());
        page.cleanup();
      } catch {
        // Satu halaman rusak tidak boleh menggagalkan berkasnya; halaman itu
        // muncul kosong dan otomatis masuk daftar yang perlu diperiksa.
      }
      const usable = hasUsableTextLayer(lines);
      if (usable) textPages++;
      const text = lines.join("\n");
      rows.push(parseLabelFields(text, startPage + n - 1));
      awbs.push(usable ? (text.match(AWB_RE)?.[0]?.toUpperCase() ?? null) : null);
    }
  } finally {
    try {
      await pdf.destroy?.();
    } catch {
      /* abaikan */
    }
  }

  // Tidak ada satu pun halaman berlapisan teks → berkas ini memang gambar, dan
  // pembacaannya butuh OCR yang hanya bisa dilakukan di perangkat pengguna.
  if (textPages === 0) return NextResponse.json({ error: "needs_ocr" }, { status: 422 });

  return NextResponse.json({ pages: total, textPages, rows, awbs });
}

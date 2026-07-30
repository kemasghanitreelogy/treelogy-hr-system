import type { InventoryItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { itemQrPayload, qrMatrix } from "@/lib/qr";

/* ============================================================
   Lembar label QR — A4, 3 × 8 = 24 label per halaman.

   QR digambar sebagai VEKTOR (kotak-kotak jsPDF), bukan gambar raster, jadi
   tetap tajam pada printer berapa pun DPI-nya dan berkas tetap ringan. Modul
   yang bersebelahan digabung horizontal (run-length) sehingga satu QR hanya
   butuh ratusan, bukan ribuan, operasi gambar.
   ============================================================ */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 8;
const COLS = 3;
const ROWS = 8;
const LABEL_W = (PAGE_W - MARGIN * 2) / COLS;
const LABEL_H = (PAGE_H - MARGIN * 2) / ROWS;

const QR_SIZE = 24; // mm
const QR_BORDER = 2; // quiet zone dalam satuan modul

const STR: Record<Locale, { title: string; asset: string; loc: string }> = {
  id: { title: "Label Inventaris Treelogy", asset: "Aset", loc: "Lokasi" },
  en: { title: "Treelogy Inventory Labels", asset: "Asset", loc: "Location" },
};

type Doc = {
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setLineWidth: (w: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setFont: (family: string, style?: string) => void;
  setFontSize: (size: number) => void;
  text: (text: string, x: number, y: number, opts?: object) => void;
  addPage: () => void;
  save: (name: string) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  setProperties?: (props: object) => void;
};

/** Gambar satu QR sebagai kotak-kotak vektor di posisi (x, y) berukuran `size` mm. */
function drawQr(doc: Doc, text: string, x: number, y: number, size: number) {
  const { size: modules, modules: grid } = qrMatrix(text, "quartile");
  const total = modules + QR_BORDER * 2;
  const cell = size / total;

  // Latar putih penuh termasuk quiet zone — wajib agar pemindai mengenali batas.
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, "F");

  doc.setFillColor(31, 36, 27); // --color-ink
  for (let row = 0; row < modules; row++) {
    let col = 0;
    while (col < modules) {
      if (!grid[row][col]) {
        col++;
        continue;
      }
      let run = 1;
      while (col + run < modules && grid[row][col + run]) run++;
      doc.rect(
        x + (col + QR_BORDER) * cell,
        y + (row + QR_BORDER) * cell,
        run * cell,
        // +2% menutup celah rambut antar baris akibat pembulatan renderer PDF.
        cell * 1.02,
        "F",
      );
      col += run;
    }
  }
}

/**
 * Buat & unduh lembar label untuk sekumpulan barang.
 * `origin` = window.location.origin (dipakai membentuk URL di dalam QR).
 */
export async function downloadInventoryLabels(
  items: InventoryItem[],
  origin: string,
  locale: Locale = "id",
): Promise<void> {
  if (items.length === 0) return;
  // jspdf di-import dinamis supaya tidak ikut bundle awal halaman.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as unknown as Doc;
  const t = STR[locale];

  doc.setProperties?.({ title: t.title });

  items.forEach((item, i) => {
    const slot = i % (COLS * ROWS);
    if (i > 0 && slot === 0) doc.addPage();

    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const x = MARGIN + col * LABEL_W;
    const y = MARGIN + row * LABEL_H;

    // Bingkai potong tipis.
    doc.setDrawColor(226, 224, 210); // --color-line
    doc.setLineWidth(0.2);
    doc.rect(x, y, LABEL_W, LABEL_H);

    drawQr(doc, itemQrPayload(origin, item.code), x + 3, y + (LABEL_H - QR_SIZE) / 2, QR_SIZE);

    const textX = x + 3 + QR_SIZE + 3;
    const textW = LABEL_W - (QR_SIZE + 9);
    let cursor = y + 8;

    doc.setTextColor(31, 36, 27);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(item.code, textX, cursor);

    cursor += 4.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 66, 54);
    for (const line of doc.splitTextToSize(item.name, textW).slice(0, 2)) {
      doc.text(line, textX, cursor);
      cursor += 3.6;
    }

    if (item.location) {
      cursor += 0.8;
      doc.setFontSize(7);
      doc.setTextColor(110, 116, 99); // --color-faint
      for (const line of doc.splitTextToSize(item.location, textW).slice(0, 1)) {
        doc.text(line, textX, cursor);
        cursor += 3.2;
      }
    }

    doc.setFontSize(6.5);
    doc.setTextColor(140, 145, 128);
    doc.text("TREELOGY", textX, y + LABEL_H - 4);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`label-inventaris-${stamp}.pdf`);
}

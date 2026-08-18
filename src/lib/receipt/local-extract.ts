/**
 * Parser teks mentah Tesseract → isian terstruktur. Tanpa LLM.
 *
 * Angka (kodepos, 4 digit HP, biaya, berat) jauh lebih andal ter-OCR daripada
 * huruf, dan angka itulah yang dipakai pencocok Shopify. Nama diambil sebisanya
 * saja — pencocok mentolerir noise lewat irisan token, dan data kontak yang
 * bersih justru datang balik dari order Shopify yang cocok.
 */

import { extractZip } from "./label-core";

export interface ParsedRow {
  page: number;
  order_code: string | null;
  service_code: string | null;
  recipient_name: string | null;
  recipient_address: string | null;
  recipient_phone_last4: string | null;
  courier: string | null;
  sender_name: string | null;
  sender_address: string | null;
  shipping_cost: string | null;
  weight: string | null;
  payment_method: string | null;
  item: string | null;
  notes: string | null;
  ship_date: string | null;
}

/** Buang noise satu karakter di ujung baris hasil OCR. */
function scrub(line: string): string {
  return line
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/[^A-Za-z0-9).,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(re: RegExp, text: string, group = 1): string | null {
  const m = text.match(re);
  return m ? (m[group] ?? m[0]).trim() : null;
}

/** Buang tanggal yang tahunnya mustahil (mis. 2026 ter-OCR jadi 2626). */
function sanitizeDate(d: string | null): string | null {
  if (!d) return null;
  const y = d.match(/(\d{4})\s*$/);
  if (y) {
    const yr = +y[1];
    if (yr < 2023 || yr > 2030) return null;
  }
  return d;
}

function detectCourier(text: string): string | null {
  const u = text.toUpperCase();
  if (u.includes("LION PARCEL") || u.includes("LIONPARCEL") || /\bLP\d{6,}/.test(u.replace(/\s/g, ""))) return "Lion Parcel";
  if (u.includes("GLOBAL JET") || u.includes("J&T") || /\bJET\b/.test(u)) return "J&T Express";
  if (u.includes("JNE")) return "JNE";
  if (u.includes("SICEPAT")) return "SiCepat";
  if (u.includes("ANTERAJA")) return "AnterAja";
  if (u.includes("NINJA")) return "Ninja Xpress";
  if (u.includes("SAP EXPRESS")) return "SAP Express";
  return null;
}

export function parseLabelFields(rawText: string, page: number): ParsedRow {
  const lines = rawText.split("\n").map(scrub).filter(Boolean);
  const flat = lines.join(" ");

  // Blok penerima — menangani dua template sekaligus:
  //   • J&T   — "Penerima: NAMA ****1234" lalu alamat di baris-baris berikutnya.
  //   • Lion  — "PENERIMA: NAMA ****1234, alamat lengkap … 15419" dalam satu baris.
  // Blok dibangun dari baris Penerima + baris setelahnya sampai kata batas,
  // lalu dipotong di masker telepon: kiri = nama, kanan = alamat.
  const penIdx = lines.findIndex((l) => /penerima/i.test(l));
  let recipient_name: string | null = null;
  let recipient_address: string | null = null;
  let recipient_phone_last4: string | null = null;

  if (penIdx >= 0) {
    // Masker telepon selalu ada DI BARIS "Penerima" itu sendiri (tepat setelah
    // nama) pada kedua template — jadi jangan pernah mencarinya di baris alamat,
    // karena nomor rumah / kodepos akan salah dianggap digit telepon.
    const penLine = lines[penIdx].replace(/.*penerima\s*:?/i, "").trim();
    const pm = penLine.match(/\d{3,4}/);
    if (pm) recipient_phone_last4 = pm[0].slice(-4);

    // Nama = teks sebelum masker ("****" atau kelompok digit pertama). Token
    // terakhir hanya dibuang sebagai sisa masker kalau maskernya ter-OCR jadi
    // kata (tanpa bintang) — kalau tidak, nama tiga kata akan kehilangan katanya.
    const hadStars = /\*{2,}/.test(penLine);
    const parts = penLine.split(/\*{2,}|\d{3,4}/)[0].split(/\s+/).filter(Boolean);
    if (parts.length >= 3 && !hadStars) parts.pop();
    recipient_name =
      parts.join(" ").replace(/[^A-Za-z .'-]/g, "").replace(/\s+/g, " ").trim() || null;

    // Alamat = sisa baris Penerima setelah telepon (format satu baris ala Lion)
    // + baris berikutnya (alamat J&T yang membungkus), sampai kata batas.
    const addrParts: string[] = [];
    if (pm) {
      const after = penLine.slice(penLine.indexOf(pm[0]) + pm[0].length);
      if (after.replace(/[\s,*.-]/g, "")) addrParts.push(after);
    }
    for (let i = penIdx + 1; i < lines.length && addrParts.length < 6; i++) {
      if (/pengirim|biaya|total|syarat|bayar|kota tujuan|lacak|estimasi|dibuat|berat|lebih praktis|ditagihkan/i.test(lines[i])) break;
      addrParts.push(lines[i]);
    }
    recipient_address =
      addrParts
        .join(", ")
        .replace(/\d+\s*x\s*\d+\s*x\s*\d+\s*cm/gi, "")
        .replace(/\bCW\s*:?\s*[\d.]+\s*kg/gi, "")
        .replace(/\b[\d.]+\s*kg\b/gi, "")
        .replace(/\b\d+\s*\/\s*\d+\b/g, "")
        .replace(/^[\s,*.-]+/, "")
        .replace(/[\s,]+$/, "")
        .replace(/(,\s*)+/g, ", ")
        .replace(/\s+/g, " ")
        .trim() || null;
  }

  // Pengirim (biasanya TREELOGY) — dicatat untuk kelengkapan arsip.
  const sendIdx = lines.findIndex((l) => /pengirim/i.test(l));
  const sender_name =
    sendIdx >= 0
      ? lines[sendIdx]
          .replace(/.*pengirim\s*:?/i, "")
          .replace(/\s*\S*\d{2,4}\s*$/, "")
          .replace(/[^A-Za-z .'-]/g, "")
          .replace(/\s+/g, " ")
          .trim() || null
      : null;

  return {
    page,
    order_code: pick(/\b(\d{3}-[A-Z0-9]{3,}-[A-Z0-9]{2,})\b/i, flat),
    service_code: pick(/\b(EZ|NP|REG|EZBIG)\b/, flat),
    recipient_name,
    recipient_address,
    recipient_phone_last4,
    courier: detectCourier(flat),
    sender_name,
    sender_address: null,
    shipping_cost: pick(/((?:IDR|Rp)\s*[\d.,]+)/i, flat),
    weight: pick(/([\d.]+\s*KG)/i, flat),
    payment_method: pick(/\b(TUNAI|NON TUNAI|COD)\b/i, flat),
    item: pick(/Barang\s*:?\s*([A-Za-z]+(?:\s[A-Za-z]+)?)/i, flat),
    notes: pick(/Notes?\s*:?\s*([A-Za-z]{2,})/i, flat),
    ship_date: sanitizeDate(
      pick(/(?:Ship|Cetak|Dibuat)\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i, flat) ||
        pick(/(\d{1,2}[-/]\d{1,2}[-/]\d{4})/, flat),
    ),
  };
}

export { extractZip };

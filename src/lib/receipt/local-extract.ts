/**
 * Parser teks mentah Tesseract → isian terstruktur. Tanpa LLM.
 *
 * Angka (kodepos, 4 digit HP, biaya, berat) jauh lebih andal ter-OCR daripada
 * huruf, dan angka itulah yang dipakai pencocok Shopify. Nama diambil sebisanya
 * saja — pencocok mentolerir noise lewat irisan token, dan data kontak yang
 * bersih justru datang balik dari order Shopify yang cocok.
 */

import { extractZip } from "./label-core";

/** Jenis dokumen sebuah halaman — menentukan isian mana yang masuk akal. */
export type DocType = "label" | "packing_slip";

export interface ParsedRow {
  page: number;
  /** "packing_slip" = pesanan website: tanpa resi, tapi HP-nya tercetak. */
  doc_type: DocType;
  /** Nomor HP LENGKAP — hanya terisi pada packing slip, yang mencetaknya. */
  recipient_phone: string | null;
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
  /** Isi "KOTA TUJUAN" di label — kota/kecamatan tujuan paket. */
  dest_city: string | null;
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

/**
 * Baris nomor telepon pada packing slip.
 *
 * Bentuknya beragam di data nyata — "081380210999", "08194218555", dan
 * "+628161669810" semuanya muncul di satu berkas yang sama. Yang menyatukan
 * ketiganya: satu baris utuh berisi angka saja, boleh diawali "+".
 * Baris alamat tidak pernah lolos karena selalu memuat huruf.
 */
const PACKING_PHONE_RE = /^\+?[\d][\d\s().-]{7,19}$/;

/**
 * Packing slip pesanan website — hanya NAMA dan NOMOR HP yang diambil.
 *
 * Dokumen ini tidak punya nomor resi, dan tidak perlu: yang dibutuhkan gudang
 * dari sebuah label (nama + HP untuk menghubungi pembeli) justru sudah
 * tercetak di sini. Isian lain (biaya, berat, kurir) sengaja dibiarkan kosong
 * daripada diisi tebakan — kolom kosong jujur, kolom salah menyesatkan.
 *
 * `lines` WAJIB sudah disaring ke kolom SHIP TO saja (lihat shipToLines di
 * pdf-text.ts). Kalau kolom BILL TO ikut, namanya akan terbaca ganda.
 */
function parsePackingSlip(lines: string[], page: number): ParsedRow {
  const shipIdx = lines.findIndex((l) => /\bship\s*to\b/i.test(l));

  // Nama = baris pertama SETELAH penanda SHIP TO. Ini yang diminta: nama
  // penerima, bukan nama pembayar — keduanya berbeda saat pesanan dikirim
  // sebagai hadiah atau ke alamat kantor.
  let recipient_name: string | null = null;
  if (shipIdx >= 0) {
    for (let i = shipIdx + 1; i < lines.length; i++) {
      const kandidat = lines[i].trim();
      // Lewati baris yang jelas bukan nama orang.
      if (!kandidat || PACKING_PHONE_RE.test(kandidat) || /^(items?|quantity)$/i.test(kandidat)) continue;
      recipient_name = kandidat;
      break;
    }
  }

  // HP dicari HANYA di antara penanda SHIP TO dan daftar barang, supaya angka
  // lain di halaman (kode SKU, nomor pesanan) tidak pernah ikut terjaring.
  const batasBawah = lines.findIndex((l, i) => i > shipIdx && /^\s*items?\b/i.test(l));
  const akhir = batasBawah > shipIdx ? batasBawah : lines.length;
  let recipient_phone: string | null = null;
  for (let i = shipIdx + 1; i < akhir; i++) {
    const baris = lines[i].trim();
    if (!PACKING_PHONE_RE.test(baris)) continue;
    const digit = baris.replace(/\D/g, "");
    if (digit.length < 8 || digit.length > 15) continue;
    recipient_phone = baris.replace(/\s+/g, "");
    break;
  }

  const flat = lines.join(" ");
  return {
    page,
    doc_type: "packing_slip",
    order_code: pick(/Order\s*#\s*(\d+)/i, flat),
    service_code: null,
    recipient_name,
    recipient_address: null,
    // Empat digit terakhir tetap diisi supaya kode lama yang membacanya (mis.
    // pencocok Shopify) tidak menemukan bentuk yang berbeda dari biasanya.
    recipient_phone_last4: recipient_phone ? recipient_phone.replace(/\D/g, "").slice(-4) : null,
    recipient_phone,
    courier: null,
    sender_name: null,
    sender_address: null,
    shipping_cost: null,
    weight: null,
    payment_method: null,
    item: null,
    notes: null,
    ship_date: null,
    dest_city: null,
  };
}

export function parseLabelFields(rawText: string, page: number, docType: DocType = "label"): ParsedRow {
  // `scrub` membuang noise satu karakter di ujung baris — perlu untuk hasil
  // OCR, tapi MERUSAK teks digital: ia menelan "+" di depan "+62…" dan tanda
  // kutip pada nama seperti "Annisaa'". Packing slip selalu berasal dari
  // lapisan teks PDF, jadi tidak ada noise yang perlu dibersihkan.
  if (docType === "packing_slip") {
    return parsePackingSlip(rawText.split("\n").map((l) => l.trim()).filter(Boolean), page);
  }
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
    doc_type: "label",
    recipient_phone: null,
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
    // KOTA TUJUAN: dulu cuma penanda batas alamat, padahal isinya bukti
    // geografis terkuat di label — dan ketiadaannya yang membuat resi Jakarta
    // bisa tercocok ke order Surabaya.
    dest_city: destCity(lines),
    ship_date: sanitizeDate(dibuatDate(lines) || pick(/(\d{1,2}[-/]\d{1,2}[-/]\d{4})/, flat)),
  };
}

/**
 * Tanggal DIBUAT — bukan ESTIMASI.
 *
 * Di PDF Lion Parcel kedua tanggal berdampingan, dan tanggal DIBUAT sering
 * pecah jadi fragmen terpisah ("Dibuat:" / "/09/2026" / "02") sementara
 * ESTIMASI tercetak utuh. Regex lama karena itu selalu mengambil ESTIMASI —
 * tanggal yang enam hari terlalu jauh ke depan, cukup untuk membuat jendela
 * pencarian order meleset sepenuhnya. Fungsi ini merakit ulang fragmennya.
 */
function dibuatDate(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (!/dibuat|cetak/i.test(lines[i])) continue;
    const win = lines.slice(i, i + 4).join(" ");
    // Baris ESTIMASI kadang ikut terjaring — jangan sampai nilainya terpakai.
    const bersih = win.replace(/estimasi\s*:?\s*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/gi, " ");

    const utuh = bersih.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (utuh) return `${utuh[1]}/${utuh[2]}/${utuh[3]}`;

    // Harinya terlepas: ambil bulan+tahun dari fragmen "/MM/YYYY", lalu cari
    // angka hari yang berdiri sendiri di sekitarnya (Lion mencetaknya dua
    // digit, "02" — itu yang didahulukan supaya "1 kg" tidak tertukar).
    const sebagian = bersih.match(/[-/](\d{1,2})[-/](\d{2,4})/);
    if (!sebagian) continue;
    const sisa = bersih.replace(sebagian[0], " ");
    const angka = [...sisa.matchAll(/\b(\d{1,2})\b/g)].map((m) => m[1]);
    const hari = angka.find((a) => a.length === 2 && +a >= 1 && +a <= 31)
      ?? angka.find((a) => +a >= 1 && +a <= 31);
    if (hari) return `${hari}/${sebagian[1]}/${sebagian[2]}`;
  }
  return null;
}

/**
 * Baca blok "KOTA TUJUAN" — barisnya sendiri kalau nilainya menyusul di baris
 * berikutnya, atau sisa baris kalau ditulis sebaris. Berhenti di kata batas
 * supaya tidak menelan kolom sebelahnya (Total Biaya, DIBUAT, dst).
 */
function destCity(lines: string[]): string | null {
  const i = lines.findIndex((l) => /kota\s*tujuan/i.test(l));
  if (i < 0) return null;
  const parts: string[] = [];
  const sisa = lines[i].replace(/.*kota\s*tujuan\s*:?\s*/i, "").trim();
  if (sisa) parts.push(sisa);
  for (let j = i + 1; j < lines.length && parts.length < 3; j++) {
    if (/pengirim|penerima|biaya|total|syarat|bayar|lacak|estimasi|dibuat|berat|ditagihkan|lebih praktis/i.test(lines[j])) break;
    const t = lines[j].trim();
    if (!t) continue;
    parts.push(t);
  }
  const out = parts.join(", ").replace(/\s+/g, " ").replace(/(,\s*)+/g, ", ").replace(/[,\s]+$/, "").trim();
  return out || null;
}

export { extractZip };

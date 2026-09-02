/**
 * Logika label resi yang murni — tanpa dependensi Node maupun browser, supaya
 * bisa dipakai di bundle klien (OCR jalan di perangkat pengguna) sekaligus di
 * server bila suatu saat diperlukan. Rendering/OCR-nya ada di `browser-ocr.ts`.
 */

export type FieldSource = "barcode" | "pdf" | "shopify" | "ocr" | "none";
export type FieldConfidence = "certain" | "high" | "low";

export interface LabelField {
  value: string | null;
  source: FieldSource;
  confidence: FieldConfidence;
  /** Alasan singkat kenapa isian ini perlu dilihat manusia. */
  flag: string | null;
}

/** Asal sebuah halaman saat beberapa berkas diproses sekaligus. */
export interface PageOrigin {
  /** Nama berkas yang diunggah. */
  file: string;
  /** Nomor halaman di dalam berkas itu (bukan nomor urut global). */
  pageInFile: number;
}

/** Bagaimana teks sebuah halaman diperoleh. */
export type PageTextMode = "text" | "ocr";

export interface PageVisual {
  /** Nomor urut global lintas berkas — kunci semua state & pencocokan. */
  page: number;
  origin: PageOrigin;
  barcodes: string[];
  tracking: string | null;
  /** Barcode terbaca ≥2× dengan nilai sama, atau sekali tapi cocok dengan
   *  nomor di lapisan teks PDF → tidak mungkin salah baca. */
  trackingConfirmed: boolean;
  /** Nomor resi yang tertulis di lapisan teks PDF (null kalau halaman gambar). */
  textTracking: string | null;
  /** "text" = dibaca dari lapisan teks PDF (eksak); "ocr" = hasil pembacaan gambar. */
  textMode: PageTextMode;
  /** "packing_slip" = pesanan website: memang tidak punya resi. */
  docType?: "label" | "packing_slip";
}

export interface LabelRecord {
  page: number;
  origin: PageOrigin;
  /** Dari mana teks halaman ini berasal — ditampilkan di kartu review. */
  textMode: PageTextMode;
  fields: Record<string, LabelField>;
  barcodes: string[];
  needsReview: boolean;
  phoneLast4?: string;
  matchedOrder?: string | null;
  matchReasons?: string[];
  /** "pdf" = data datang eksak dari halaman itu sendiri (packing slip). */
  matchStatus?: "shopify" | "manual" | "pdf" | null;
  /** ID numerik order Shopify — kunci eksak ke `ref_no` Jubelio. */
  legacyId?: string | null;
}

/** Format resi yang dikenal — J&T (JD…), Lion Parcel (…LP…). Tambah bila perlu. */
export const AWB_RE = /(JD\d{8,}|\d{0,3}LP\d{8,})/i;

export const FIELD_KEYS = [
  "tracking_number", "order_code", "service_code",
  "recipient_name", "recipient_address", "sender_name", "sender_address",
  "shipping_cost", "weight", "payment_method", "item", "notes", "ship_date",
  "dest_city", "created_date",
] as const;

function mkField(
  value: string | null,
  source: FieldSource,
  confidence: FieldConfidence,
  flag: string | null,
): LabelField {
  return { value: value ?? null, source, confidence, flag };
}

function validate(key: string, value: string | null): string | null {
  // Yang dikirim ke pengguna adalah Kurir · AWB · No. HP. AWB dipastikan oleh
  // barcode, No. HP oleh pencocokan Shopify — jadi isian OCR sekunder (biaya,
  // berat, dsb.) sengaja TIDAK pernah memicu review: bentuknya beda-beda per
  // kurir dan bukan hasil yang dipakai. Hanya nama penerima yang wajib ada.
  if (!(value ?? "").trim() && key === "recipient_name") return "missing";
  return null;
}

export function normalizeCourier(raw: string | null): string | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u.includes("LION PARCEL") || u.includes("LIONPARCEL") || /\bLP\d{6,}/.test(u.replace(/\s/g, ""))) return "Lion Parcel";
  if (u.includes("GLOBAL JET") || u.includes("J&T") || /\bJET\b/.test(u)) return "J&T Express";
  if (u.includes("JNE")) return "JNE";
  if (u.includes("SICEPAT")) return "SiCepat";
  if (u.includes("ANTERAJA")) return "AnterAja";
  if (u.includes("NINJA")) return "Ninja Xpress";
  if (u.includes("SAP EXPRESS")) return "SAP Express";
  return raw.trim();
}

/** Ambil kodepos dari alamat: deret 5 digit TERAKHIR yang berhenti di batas
 *  non-digit (menangani "5117510" → "17510" saat digit barcode ikut terbaca). */
export function extractZip(addr: string): string | null {
  const matches = [...(addr || "").matchAll(/(\d{5})(?=\D|$)/g)].map((m) => m[1]);
  return matches.length ? matches[matches.length - 1] : null;
}

/** Gabungkan hasil parse OCR dengan hasil barcode menjadi kartu review. */
export function reconcile<T extends { page: number }>(
  rows: readonly T[],
  visuals: PageVisual[],
): LabelRecord[] {
  const byPage = new Map<number, Record<string, unknown>>();
  for (const row of rows || []) {
    if (row && typeof row.page === "number") byPage.set(row.page, row as Record<string, unknown>);
  }

  return visuals.map((vis) => {
    const row = byPage.get(vis.page) ?? {};
    const fields: Record<string, LabelField> = {};

    for (const key of FIELD_KEYS) {
      const ocrVal = (row[key] as string | null | undefined) ?? null;
      if (key === "tracking_number") {
        // Urutan kepercayaan: barcode terkonfirmasi → teks digital PDF →
        // barcode sekali baca → hasil OCR. Dua yang pertama eksak; dua
        // terakhir masih bisa salah dan karena itu ditandai.
        const pdfAwb = vis.textTracking;
        if (vis.tracking && vis.trackingConfirmed) {
          const bantah = pdfAwb && pdfAwb !== vis.tracking ? `teks PDF menulis ${pdfAwb}` : null;
          fields[key] = mkField(vis.tracking, "barcode", "certain", bantah);
        } else if (pdfAwb) {
          // Halaman PDF digital: nomornya huruf demi huruf seperti yang dicetak
          // kurir — bukan hasil tebakan, jadi sama terpercayanya dengan barcode.
          const bantah = vis.tracking && vis.tracking !== pdfAwb ? `barcode terbaca ${vis.tracking}` : null;
          fields[key] = mkField(pdfAwb, "pdf", "certain", bantah);
        } else if (vis.tracking) {
          fields[key] = mkField(vis.tracking, "barcode", "high", "barcode hanya terbaca sekali");
        } else if (vis.docType === "packing_slip") {
          // Packing slip memang tidak punya nomor resi. Menandainya "periksa
          // manual" akan menyuruh orang mencari sesuatu yang tidak pernah ada,
          // dan membuat SETIAP halaman masuk daftar periksa tanpa guna.
          fields[key] = mkField(null, "none", "certain", null);
        } else {
          fields[key] = mkField(ocrVal, ocrVal ? "ocr" : "none", "low", "tanpa barcode — periksa manual");
        }
        continue;
      }
      const flag = validate(key, ocrVal);
      const src: FieldSource = ocrVal ? (vis.textMode === "text" ? "pdf" : "ocr") : "none";
      // Isian dari lapisan teks PDF tidak pernah salah baca, jadi tidak perlu
      // diperiksa mata seperti hasil OCR.
      const conf: FieldConfidence = flag ? "low" : vis.textMode === "text" ? "certain" : "high";
      fields[key] = mkField(ocrVal, src, conf, flag);
    }

    const courierRaw = (row.courier as string | null) ?? null;
    fields["courier"] = mkField(
      normalizeCourier(courierRaw),
      courierRaw ? (vis.textMode === "text" ? "pdf" : "ocr") : "none",
      "high",
      null,
    );
    fields["phone"] = mkField(null, "none", "low", "belum dicocokkan");

    const phoneLast4 = String(row.recipient_phone_last4 ?? "").replace(/\D/g, "").slice(-4);
    return {
      page: vis.page,
      origin: vis.origin,
      textMode: vis.textMode,
      fields,
      barcodes: vis.barcodes,
      needsReview: Object.values(fields).some((f) => f.confidence === "low"),
      phoneLast4,
      matchedOrder: null,
      matchReasons: [],
    };
  });
}

/** Tanggal kirim di label tercetak DD-MM-YYYY; normalkan ke ISO dan tolak tahun
 *  hasil salah-baca (mis. 2626) supaya jendela pencarian order tidak melenceng. */
export function normalizeShipDate(raw: string | null | undefined): string {
  const m = (raw ?? "").match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const dd = +m[1];
    const mm = +m[2];
    const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (yr >= 2023 && yr <= 2030 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yr}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  return "";
}

/**
 * Tandai nomor resi yang muncul lebih dari sekali dalam satu batch.
 *
 * Mengunggah banyak berkas membuat label yang sama gampang ikut dua kali (mis.
 * satu PDF dan foto ulangannya). Duplikatnya tidak dibuang — halamannya tetap
 * nyata dan mungkin dua kiriman berbeda yang barcodenya salah cetak — tetapi
 * ditandai supaya orang yang memeriksa melihatnya sebelum mengirim ke Jubelio.
 */
export function flagDuplicateTracking(records: LabelRecord[]): LabelRecord[] {
  const seen = new Map<string, number[]>();
  for (const r of records) {
    const awb = (r.fields.tracking_number?.value ?? "").trim().toUpperCase();
    if (!awb) continue;
    seen.set(awb, [...(seen.get(awb) ?? []), r.page]);
  }
  for (const r of records) {
    const awb = (r.fields.tracking_number?.value ?? "").trim().toUpperCase();
    const pages = awb ? (seen.get(awb) ?? []) : [];
    if (pages.length < 2) continue;
    const others = pages.filter((p) => p !== r.page);
    // Tingkat keyakinan pembacaan barcode-nya TIDAK diturunkan — barcodenya
    // memang terbaca pasti; yang meragukan adalah adanya kembaran. Cukup
    // pasang penanda dan paksa kartunya masuk daftar periksa.
    r.fields.tracking_number = {
      ...r.fields.tracking_number,
      flag: `resi kembar dengan halaman ${others.join(", ")}`,
    };
    r.needsReview = true;
  }
  return records;
}

/**
 * Rapikan nomor HP Indonesia ke bentuk +62.
 *
 * Nomor yang ditarik dari Shopify datang dalam bentuk campur: sebagian sudah
 * "+6281…", sebagian "081…", ada yang memakai spasi, tanda hubung, atau kurung.
 * Yang mengunduh berkasnya menyalin nomor itu ke WhatsApp dan sistem lain, jadi
 * satu bentuk yang seragam menghemat pekerjaan merapikan manual — dan mencegah
 * "0812…" terbaca sebagai angka lalu kehilangan nol depannya.
 *
 * Nomor yang jelas bukan Indonesia (mis. +65, +1) dibiarkan apa adanya: memaksa
 * +62 ke sana akan mengubahnya menjadi nomor yang salah.
 */
export function formatPhoneId(raw: string | null | undefined): string {
  const teks = (raw ?? "").trim();
  if (!teks) return "";

  const adaPlus = teks.startsWith("+");
  const digit = teks.replace(/\D/g, "");
  if (!digit) return "";

  // Sudah internasional dan bukan Indonesia → jangan diutak-atik.
  if (adaPlus && !digit.startsWith("62")) return "+" + digit;

  if (digit.startsWith("62")) return "+" + digit;
  if (digit.startsWith("0")) return "+62" + digit.slice(1);
  // "8123…" — nol depannya hilang saat disalin/diketik.
  if (digit.startsWith("8")) return "+62" + digit;

  return adaPlus ? "+" + digit : digit;
}

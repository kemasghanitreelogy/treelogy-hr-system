import type { Locale } from "./i18n";
import type { PaymentApprovalStatus, PaymentDept, PaymentKind, PaymentRequest } from "./types";

/* ============================================================
   Pengajuan pembayaran / reimbursement.

   PENTING: `SHEET_DEPT` dan `SHEET_KIND` adalah teks yang ditulis ke Google
   Sheet keuangan. Nilainya harus PERSIS sama dengan pilihan pada Google Form
   lama, supaya filter, pivot, dan rekap yang sudah dipakai tim Finance tetap
   bekerja. Jangan diterjemahkan — label tampilan diurus terpisah di bawah.
   ============================================================ */

export const DEPARTMENTS: PaymentDept[] = [
  "finance", "hr_ga", "sales", "farm", "factory",
  "it_creative", "purchasing", "ceo", "marketing",
];

export const SHEET_DEPT: Record<PaymentDept, string> = {
  finance: "Finance",
  hr_ga: "HR & GA",
  sales: "Sales",
  farm: "Farm",
  factory: "Factory",
  it_creative: "IT & Creative",
  purchasing: "Purchasing",
  ceo: "CEO",
  marketing: "Marketing",
};

export const KINDS: PaymentKind[] = [
  "petty_cash", "office_general", "production", "farm_maintenance", "marketing",
  "transportation", "meals_entertainment", "popup_market", "other",
];

export const SHEET_KIND: Record<PaymentKind, string> = {
  petty_cash: "Petty Cash",
  office_general: "Office/General Expenses",
  production: "Production",
  farm_maintenance: "Farm maintenance",
  marketing: "Marketing",
  transportation: "Transportation/Business Trips",
  meals_entertainment: "Meals/Entertainment",
  popup_market: "Pop-up Market Expenses",
  other: "Other",
};

/** Label tampilan di aplikasi (boleh diterjemahkan — tidak masuk ke sheet). */
export const KIND_LABEL: Record<Locale, Record<PaymentKind, string>> = {
  id: {
    petty_cash: "Kas kecil",
    office_general: "Kebutuhan kantor/umum",
    production: "Produksi",
    farm_maintenance: "Perawatan kebun",
    marketing: "Marketing",
    transportation: "Transportasi / perjalanan dinas",
    meals_entertainment: "Makan & jamuan",
    popup_market: "Biaya pop-up market",
    other: "Lainnya",
  },
  en: { ...SHEET_KIND },
};

export const DEPT_LABEL: Record<Locale, Record<PaymentDept, string>> = {
  id: { ...SHEET_DEPT },
  en: { ...SHEET_DEPT },
};

/* ---- Persetujuan dua tahap: operasional → Finance ---- */

export const APPROVAL_STATUSES: PaymentApprovalStatus[] = [
  "waiting_ops", "waiting_finance", "approved", "rejected",
];

export const APPROVAL_LABEL: Record<Locale, Record<PaymentApprovalStatus, string>> = {
  id: {
    waiting_ops: "Menunggu Ops",
    waiting_finance: "Menunggu Finance",
    approved: "Disetujui",
    rejected: "Ditolak",
  },
  en: {
    waiting_ops: "Awaiting Ops",
    waiting_finance: "Awaiting Finance",
    approved: "Approved",
    rejected: "Rejected",
  },
};

type Tone = "forest" | "olive" | "matcha" | "gold" | "clay" | "sky" | "neutral";

export const APPROVAL_TONE: Record<PaymentApprovalStatus, Tone> = {
  waiting_ops: "gold",
  waiting_finance: "sky",
  approved: "matcha",
  rejected: "clay",
};

/** Tahap yang menolak — untuk menaruh tanda ✕ pada langkah yang tepat di stepper. */
export function rejectedAtStage(r: Pick<PaymentRequest, "approvalStatus" | "opsApprovedAt">): "ops" | "finance" | null {
  if (r.approvalStatus !== "rejected") return null;
  return r.opsApprovedAt ? "finance" : "ops";
}

/** Jenis yang ditulis ke sheet: "Other" ditulis apa adanya beserta keterangannya. */
export function sheetKindText(req: Pick<PaymentRequest, "kind" | "kindOther">): string {
  if (req.kind === "other") {
    const extra = (req.kindOther ?? "").trim();
    return extra ? `Other: ${extra}` : "Other";
  }
  return SHEET_KIND[req.kind];
}

/**
 * Gabungkan tiga bagian menjadi satu baris seperti kolom di Google Sheet:
 *   "28/05/2024 - INVOICE PEMBELIAN PAKAN TERNAK - CV PAKAN BALI"
 *
 * Dipakai form (pratinjau langsung) DAN server (nilai yang benar-benar ditulis),
 * sehingga yang dilihat pengaju persis sama dengan yang masuk ke sheet.
 * Bagian kosong dilewati agar tidak meninggalkan " - " menggantung.
 */
export function composeInvoiceLine(parts: {
  invoiceDate?: string | null;
  description?: string | null;
  vendorName?: string | null;
}): string {
  const tanggal = parts.invoiceDate
    ? parts.invoiceDate.split("-").reverse().join("/") // YYYY-MM-DD → DD/MM/YYYY
    : "";
  return [tanggal, parts.description?.trim(), parts.vendorName?.trim()]
    .filter((bagian) => !!bagian)
    .join(" - ");
}

/**
 * Stempel waktu untuk kolom A ("Timestamp") di Google Sheet.
 *
 * Dibangun dari bagian-bagian Intl, BUKAN toLocaleString — hasil toLocaleString
 * bergantung locale runtime dan pada "id-ID" menghasilkan "04/08/2026, 11.41.32"
 * (koma + titik). Ke-140 baris yang sudah ada di sheet memakai
 * "03/08/2026 07:17:54" (spasi + titik dua); bentuk yang berbeda membuat Google
 * Sheets gagal mengenalinya sebagai waktu dan sel berakhir KOSONG.
 *
 * Selalu WITA, dan jatuh ke waktu sekarang bila sumbernya tidak terbaca —
 * kolom waktu tidak boleh kosong hanya karena satu nilai janggal.
 */
export function formatSheetTimestamp(input?: string | null): string {
  let d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  const bagian = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const b of bagian) p[b.type] = b.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** Batas berkas, mengikuti Google Form aslinya. */
export const MAX_INVOICE_FILES = 10;
export const MAX_FILE_MB = 10;

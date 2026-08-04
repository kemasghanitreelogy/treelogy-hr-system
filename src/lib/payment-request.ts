import type { Locale } from "./i18n";
import type { PaymentDept, PaymentKind, PaymentRequest } from "./types";

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

/** Batas berkas, mengikuti Google Form aslinya. */
export const MAX_INVOICE_FILES = 10;
export const MAX_FILE_MB = 10;

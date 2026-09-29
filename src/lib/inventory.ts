import type { Locale } from "./i18n";
import type {
  InventoryCategory,
  InventoryCompany,
  InventoryCondition,
  InventoryItem,
  InventoryStatus,
} from "./types";

/* ============================================================
   Inventaris — label, tone, dan helper turunan.
   Satu sumber kebenaran untuk enum → teks/warna, dipakai form,
   daftar, detail, dan lembar label cetak.
   ============================================================ */

export const COMPANIES: InventoryCompany[] = ["PMA", "PMDN"];

/** Arti tiap company — sesuai sheet register aset. */
export const COMPANY_LABEL: Record<Locale, Record<InventoryCompany, string>> = {
  id: { PMA: "Farm & Office", PMDN: "Factory" },
  en: { PMA: "Farm & Office", PMDN: "Factory" },
};

/** Urutan & kode mengikuti sheet register aset (Category / Category Code). */
export const CATEGORIES: InventoryCategory[] = ["LND", "VEH", "FMT", "MCH", "OFC", "FUR", "ELC", "LVS", "BIO", "OTH"];

export const CONDITIONS: InventoryCondition[] = ["baik", "perlu_servis", "rusak", "hilang"];

export const STATUSES: InventoryStatus[] = ["tersedia", "dipakai", "perawatan", "pensiun"];

export const UNITS = ["unit", "pcs", "set", "box", "rim", "lusin", "meter"];

type Tone = "forest" | "olive" | "matcha" | "gold" | "clay" | "sky" | "neutral";

export const CATEGORY_LABEL: Record<Locale, Record<InventoryCategory, string>> = {
  id: {
    LND: "Tanah & Bangunan",
    VEH: "Kendaraan",
    FMT: "Mesin & Alat Pertanian",
    MCH: "Mesin & Peralatan Pabrik",
    OFC: "Peralatan Kantor & IT",
    FUR: "Furnitur & Perlengkapan",
    ELC: "Instalasi Listrik & Utilitas",
    LVS: "Fasilitas & Peralatan Ternak",
    BIO: "Aset Biologis",
    OTH: "Lainnya",
  },
  en: {
    LND: "Land & Buildings",
    VEH: "Vehicles",
    FMT: "Farm Machinery & Tools",
    MCH: "Factory Machinery & Equipment",
    OFC: "Office Equipment & IT",
    FUR: "Furniture & Fixtures",
    ELC: "Electrical & Utility Installations",
    LVS: "Livestock Facilities & Equipment",
    BIO: "Biological",
    OTH: "Other",
  },
};

/** Awalan kode aset untuk satu kombinasi — pratinjau sebelum disimpan. */
export function codePrefix(company: InventoryCompany, category: InventoryCategory): string {
  return `${company}-${category}`;
}

export const CONDITION_LABEL: Record<Locale, Record<InventoryCondition, string>> = {
  id: { baik: "Baik", perlu_servis: "Perlu servis", rusak: "Rusak", hilang: "Hilang" },
  en: { baik: "Good", perlu_servis: "Needs service", rusak: "Broken", hilang: "Lost" },
};

export const STATUS_LABEL: Record<Locale, Record<InventoryStatus, string>> = {
  id: { tersedia: "Tersedia", dipakai: "Dipakai", perawatan: "Perawatan", pensiun: "Pensiun" },
  en: { tersedia: "Available", dipakai: "In use", perawatan: "Maintenance", pensiun: "Retired" },
};

export const CONDITION_TONE: Record<InventoryCondition, Tone> = {
  baik: "matcha",
  perlu_servis: "gold",
  rusak: "clay",
  hilang: "neutral",
};

/** Warna teks kondisi saat ditulis polos (tanpa chip) — sejalan dengan tone di atas. */
export const CONDITION_TEXT: Record<InventoryCondition, string> = {
  baik: "text-forest-600",
  perlu_servis: "text-[#8a6512]",
  rusak: "text-clay",
  hilang: "text-faint",
};

export const STATUS_TONE: Record<InventoryStatus, Tone> = {
  tersedia: "forest",
  dipakai: "sky",
  perawatan: "gold",
  pensiun: "neutral",
};

/** Barang yang butuh perhatian HR: rusak, hilang, atau sedang diservis. */
export function needsAttention(item: InventoryItem): boolean {
  return item.condition !== "baik" || item.status === "perawatan";
}

/** Nilai aset satu baris = harga beli × jumlah. */
export function itemValue(item: InventoryItem): number {
  return item.purchasePrice * item.quantity;
}

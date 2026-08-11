import type { Locale } from "./i18n";
import type {
  InventoryCategory,
  InventoryCondition,
  InventoryItem,
  InventoryStatus,
} from "./types";

/* ============================================================
   Inventaris — label, tone, dan helper turunan.
   Satu sumber kebenaran untuk enum → teks/warna, dipakai form,
   daftar, detail, dan lembar label cetak.
   ============================================================ */

export const CATEGORIES: InventoryCategory[] = [
  "tanah",
  "bangunan_permanen",
  "bangunan_non_permanen",
  "kendaraan",
  "aset_biologis",
  "mesin",
  "peralatan_kantor",
  "elektronik",
  "furnitur",
  "atk",
  "perlengkapan",
  "lainnya",
];

export const CONDITIONS: InventoryCondition[] = ["baik", "perlu_servis", "rusak", "hilang"];

export const STATUSES: InventoryStatus[] = ["tersedia", "dipakai", "perawatan", "pensiun"];

export const UNITS = ["unit", "pcs", "set", "box", "rim", "lusin", "meter"];

type Tone = "forest" | "olive" | "matcha" | "gold" | "clay" | "sky" | "neutral";

export const CATEGORY_LABEL: Record<Locale, Record<InventoryCategory, string>> = {
  id: {
    tanah: "Tanah",
    bangunan_permanen: "Bangunan Permanen",
    bangunan_non_permanen: "Bangunan Non-Permanen",
    kendaraan: "Kendaraan",
    aset_biologis: "Aset Biologis",
    mesin: "Mesin & Peralatan",
    peralatan_kantor: "Peralatan Kantor",
    elektronik: "Elektronik",
    furnitur: "Furnitur",
    atk: "ATK",
    perlengkapan: "Perlengkapan",
    lainnya: "Lainnya",
  },
  en: {
    tanah: "Land",
    bangunan_permanen: "Building (Permanent)",
    bangunan_non_permanen: "Building (Non-Permanent)",
    kendaraan: "Vehicle",
    aset_biologis: "Biological Asset",
    mesin: "Machinery & Equipment",
    peralatan_kantor: "Office Equipment",
    elektronik: "Electronics",
    furnitur: "Furniture",
    atk: "Stationery",
    perlengkapan: "Equipment",
    lainnya: "Other",
  },
};

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

/**
 * Pelanggan Eligible — bentuk data yang dibagi layar, API, dan ledger.
 *
 * Satu email = satu baris. Dua langkah yang bisa gagal terpisah tercatat
 * terpisah: customer-nya ada di Shopify (shopifyCustomerId) dan eligibility-nya
 * sudah di-seed oleh backend Combined Discount (seedStatus).
 */

export type SeedStatus = "pending" | "seeded" | "failed";
export type GrantSource = "manual" | "import";

export interface SeededCampaign {
  key: string;
  qualifiedAt: string;
}

/** Isi metafield `$app:combined-discount-state` yang dibaca langsung. */
export interface MetafieldState {
  /** false = customer ada tapi metafield belum pernah ditulis. */
  exists: boolean;
  firstPurchaseAt: string | null;
  campaigns: { key: string; qualifiedAt: string | null; uses: number }[];
  updatedAt: string | null;
}

export interface EligibleCustomer {
  email: string;
  firstName: string;
  lastName: string;
  tags: string[];
  shopifyCustomerId: string | null;
  /** true = dibuat dari sini; false = sudah ada di Shopify; null = belum sampai. */
  createdInShopify: boolean | null;
  seedStatus: SeedStatus;
  seedFirstPurchaseAt: string | null;
  seedCampaigns: SeededCampaign[];
  seedError: string | null;
  seedErrorDetail: string | null;
  seedDate: string | null;
  source: GrantSource;
  /** Hasil bacaan metafield terakhir; null = belum pernah dicek. */
  metafield: MetafieldState | null;
  verifiedAt: string | null;
  grantedByName: string | null;
  grantedAt: string;
  lastAttemptAt: string;
}

export interface EligibleState {
  customers: EligibleCustomer[];
  /** STORE_NAME + ADMIN_API_KEY terisi — customer bisa dibuat. */
  shopifyReady: boolean;
  /** COMBINED_DISCOUNT_API_URL + SECRET terisi — eligibility bisa di-seed. */
  seedReady: boolean;
  /** ADMIN_API_KEY_COMBINED_DISCOUNT terisi — metafield bisa dibaca untuk verifikasi. */
  verifyReady: boolean;
  /** Handle toko (bagian sebelum .myshopify.com) untuk tautan ke admin Shopify. */
  storeHandle: string | null;
}

/** Satu permintaan grant — dari formulir satuan maupun satu baris impor. */
export interface GrantInput {
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
  /** null/kosong = sentinel bawaan backend (2000-01-01). */
  seedDate?: string | null;
  /** null/kosong = semua campaign aktif. */
  campaignKeys?: string[] | null;
  source?: GrantSource;
}

export interface GrantResult {
  email: string;
  /** Customer ada di Shopify DAN baris ledger tertulis. Seeding dilihat dari
   *  customer.seedStatus — bisa gagal sendiri tanpa membatalkan langkah lain. */
  ok: boolean;
  customer?: EligibleCustomer;
  /** Kode galat mesin, diterjemahkan lewat apiErrorMessage(). */
  error?: string;
  detail?: string;
}

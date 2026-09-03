/**
 * Sumber review yang dikenali modul ini.
 *
 * Yang berbeda antar-marketplace cuma BENTUK DATANYA. Ledger, aturan rating,
 * dedup, jeda antar-run, dan ekspor Judge.me tetap satu — jadi perbedaannya
 * dikurung di berkas ini, dan sisa sistem tidak perlu tahu asal sebuah review.
 */

export const SOURCES = ["tokopedia", "shopee"] as const;
export type MarketplaceSource = (typeof SOURCES)[number];

export function isSource(v: unknown): v is MarketplaceSource {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

export const SOURCE_LABEL: Record<MarketplaceSource, string> = {
  tokopedia: "Tokopedia",
  shopee: "Shopee",
};

/** Bentuk ID produk yang harus diisi orang di layar peta produk. */
export const SOURCE_ID_HINT: Record<MarketplaceSource, string> = {
  tokopedia: "ID produk 19 digit dari URL Tokopedia",
  shopee: 'shopid_itemid dari URL Shopee, mis. "1234567_890123456"',
};

/**
 * Foto review: apakah tautannya kedaluwarsa?
 *
 * Tokopedia menyajikan foto lewat URL bertanda tangan yang mati ~3 jam, dan
 * Judge.me mengunduh foto saat import DIPROSES — bukan saat CSV dibuat. Shopee
 * memakai URL statis di CDN-nya, jadi tidak punya masalah itu. Perbedaan ini
 * mengubah nasihat yang ditampilkan layar, sehingga harus dinyatakan, bukan
 * disamaratakan.
 */
export const SOURCE_PICTURES_EXPIRE: Record<MarketplaceSource, boolean> = {
  tokopedia: true,
  shopee: false,
};

/** Tautan ke halaman produknya — untuk dibuka orang saat memeriksa peta. */
export function productUrl(source: MarketplaceSource, productId: string): string | null {
  if (source === "tokopedia") return null; // butuh slug toko; tidak bisa dibentuk dari ID saja
  const [shopid, itemid] = String(productId).split("_");
  return shopid && itemid ? `https://shopee.co.id/product/${shopid}/${itemid}` : null;
}

/**
 * Sah tidaknya ID produk untuk sumber tersebut — diperiksa SEBELUM disimpan,
 * karena ID yang salah bentuk baru ketahuan berjam-jam kemudian saat penarik
 * di laptop gagal, dan saat itu orangnya sudah pergi.
 */
export function validProductId(source: MarketplaceSource, id: string): boolean {
  const v = (id ?? "").trim();
  if (source === "shopee") return /^\d{3,}_\d{3,}$/.test(v);
  return /^\d{6,}$/.test(v);
}

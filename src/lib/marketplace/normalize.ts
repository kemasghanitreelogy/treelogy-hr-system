import "server-only";
import type { MarketplaceSource } from "./sources";
import { picturesExpireAt } from "@/lib/tokopedia/gql";

/* ============================================================
   Menyeragamkan bentuk review dari tiap marketplace.

   Penarik di laptop mengirim data MENTAH apa adanya — ia sengaja tidak tahu
   aturan apa pun. Penerjemahannya di sini, satu tempat, supaya aturan seperti
   "tanpa stempel waktu jangan pakai epoch" berlaku untuk semua sumber dan
   tidak perlu ditegakkan dua kali.
   ============================================================ */

/** Bentuk seragam yang dipakai ledger, tak peduli asalnya. */
export interface NormalizedReview {
  feedbackId: string;
  rating: number;
  body: string;
  /** Unix detik; 0/NaN berarti tidak diketahui. */
  createdUnix: number;
  reviewerName: string;
  isAnonymous: boolean;
  variantName: string | null;
  reply: string | null;
  pictureUrls: string[];
  productId: string;
  shopifyHandle: string;
}

/** CDN gambar Shopee — `images` di API-nya berisi hash, bukan URL utuh. */
const SHOPEE_IMG = "https://down-id.img.susercontent.com/file/";

export function normalize(source: MarketplaceSource, raw: any): NormalizedReview | null {
  if (!raw) return null;
  const productId = String(raw._productId ?? "");
  const shopifyHandle = String(raw._shopifyHandle ?? "");
  if (!productId || !shopifyHandle) return null;

  if (source === "shopee") {
    const id = String(raw.cmtid ?? "");
    if (!id) return null;
    // `images` berisi hash berkas; URL-nya dibentuk di sini. Tautan Shopee
    // statis, jadi tidak ada batas kedaluwarsa yang perlu dicatat.
    const pics = (Array.isArray(raw.images) ? raw.images : [])
      .map((h: unknown) => (typeof h === "string" && h ? (h.startsWith("http") ? h : SHOPEE_IMG + h) : null))
      .filter((u: string | null): u is string => Boolean(u));
    return {
      feedbackId: id,
      rating: Number(raw.rating_star),
      body: String(raw.comment ?? "").trim(),
      createdUnix: Number(raw.ctime ?? 0),
      reviewerName: String(raw.author_username ?? "").trim(),
      isAnonymous: raw.anonymous === true,
      variantName: raw.product_items?.[0]?.model_name || null,
      reply: String(raw.ItemRatingReply?.comment ?? "").trim() || null,
      pictureUrls: pics,
      productId,
      shopifyHandle,
    };
  }

  const id = String(raw.feedbackID ?? "");
  if (!id) return null;
  return {
    feedbackId: id,
    rating: Number(raw.productRating),
    body: String(raw.message ?? "").trim(),
    createdUnix: Number(raw.reviewCreateTime ?? 0),
    reviewerName: String(raw.user?.fullName ?? "").trim(),
    isAnonymous: raw.isAnonymous === true,
    variantName: raw.variantName || null,
    reply: String(raw.reviewResponse?.message ?? "").trim() || null,
    pictureUrls: (raw.imageAttachments ?? [])
      .map((a: any) => a?.imageUrl)
      .filter((u: unknown): u is string => Boolean(u)),
    productId,
    shopifyHandle,
  };
}

/** Baris ledger. `pulledAt` dipakai kalau marketplace tidak memberi waktu. */
export function toRow(source: MarketplaceSource, n: NormalizedReview, pulledAt: string) {
  // Tanpa stempel waktu yang sah, dipakai waktu penarikan — BUKAN epoch.
  // `review_date` adalah satu-satunya jalur Judge.me yang bisa backdate, jadi
  // tanggal 01/01/1970 akan benar-benar terpasang di review itu.
  const ts = n.createdUnix;
  const expires = source === "tokopedia" ? picturesExpireAt(n.pictureUrls) : null;
  return {
    source,
    feedback_id: n.feedbackId,
    product_id: n.productId,
    shopify_handle: n.shopifyHandle,
    rating: n.rating,
    body: n.body,
    review_at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : pulledAt,
    reviewer_name: n.reviewerName,
    is_anonymous: n.isAnonymous,
    variant_name: n.variantName,
    reply: n.reply,
    picture_urls: n.pictureUrls,
    pictures_expire_at: expires ? expires.toISOString() : null,
  };
}

/**
 * Bintangnya sah? Review tanpa rating yang jelas TIDAK diberi nilai bawaan.
 *
 * Menganggapnya bintang 5 akan menaikkan rating agregat toko dengan angka yang
 * tidak pernah diberikan siapa pun — dan sekali terimport, Judge.me hanya bisa
 * membatalkannya sebatch, bukan sebaris.
 */
export function validRating(n: NormalizedReview): boolean {
  return Number.isInteger(n.rating) && n.rating >= 1 && n.rating <= 5;
}

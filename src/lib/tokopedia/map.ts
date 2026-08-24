import type { TokopediaProduct, TokopediaReview, TokopediaRun } from "./types";

/* Baris database → bentuk yang dipakai layar. Ditaruh terpisah supaya route
   dan halaman memakai pemetaan yang sama persis — bukan dua salinan yang
   perlahan melenceng. */

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

export function mapProduct(r: Row): TokopediaProduct {
  return {
    productId: str(r.product_id),
    shopifyHandle: str(r.shopify_handle),
    name: str(r.name),
    active: r.active !== false,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export function mapReview(r: Row, productName = ""): TokopediaReview {
  return {
    feedbackId: str(r.feedback_id),
    productId: str(r.product_id),
    shopifyHandle: str(r.shopify_handle),
    productName,
    rating: Number(r.rating ?? 0),
    body: str(r.body),
    reviewAt: iso(r.review_at) ?? new Date(0).toISOString(),
    reviewerName: str(r.reviewer_name),
    isAnonymous: r.is_anonymous === true,
    variantName: r.variant_name ? str(r.variant_name) : null,
    reply: r.reply ? str(r.reply) : null,
    pictureUrls: Array.isArray(r.picture_urls) ? (r.picture_urls as string[]) : [],
    picturesExpireAt: iso(r.pictures_expire_at),
    firstSeenAt: iso(r.first_seen_at) ?? new Date(0).toISOString(),
    exportedAt: iso(r.exported_at),
  };
}

export function mapRun(r: Row): TokopediaRun {
  return {
    id: str(r.id),
    startedAt: iso(r.started_at) ?? new Date(0).toISOString(),
    finishedAt: iso(r.finished_at),
    status: (str(r.status) || "running") as TokopediaRun["status"],
    requests: Number(r.requests ?? 0),
    reviewsSeen: Number(r.reviews_seen ?? 0),
    reviewsNew: Number(r.reviews_new ?? 0),
    withBody: Number(r.with_body ?? 0),
    noBody: Number(r.no_body ?? 0),
    error: r.error ? str(r.error) : null,
    startedByName: r.started_by_name ? str(r.started_by_name) : null,
  };
}

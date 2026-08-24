/** Bentuk data yang dipakai bersama server & layar. */

export type TokopediaRunStatus = "running" | "ok" | "partial" | "rejected" | "failed";

export interface TokopediaProduct {
  productId: string;
  shopifyHandle: string;
  name: string;
  active: boolean;
  sortOrder: number;
  /** Jumlah review yang sudah ada di ledger untuk produk ini. */
  reviewCount?: number;
}

export interface TokopediaReview {
  feedbackId: string;
  productId: string;
  shopifyHandle: string;
  productName: string;
  rating: number;
  body: string;
  /** ISO — waktu review dibuat menurut Tokopedia. */
  reviewAt: string;
  reviewerName: string;
  isAnonymous: boolean;
  variantName: string | null;
  reply: string | null;
  pictureUrls: string[];
  /** ISO — kapan tautan foto di atas mati. Null bila review tanpa foto. */
  picturesExpireAt: string | null;
  firstSeenAt: string;
  exportedAt: string | null;
}

export interface TokopediaRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: TokopediaRunStatus;
  requests: number;
  reviewsSeen: number;
  reviewsNew: number;
  withBody: number;
  noBody: number;
  error: string | null;
  startedByName: string | null;
}

/** Semua yang dibutuhkan layar dalam satu muatan. */
export interface TokopediaState {
  products: TokopediaProduct[];
  runs: TokopediaRun[];
  reviews: TokopediaReview[];
  /** Kapan tombol tarik boleh ditekan lagi (ISO), atau null bila sudah boleh. */
  nextPullAt: string | null;
  /** Jeda minimum antar-run dalam jam — dipakai layar untuk menjelaskan. */
  minIntervalHours: number;
  /** False bila peta produk kosong / Supabase belum terhubung. */
  ready: boolean;
}

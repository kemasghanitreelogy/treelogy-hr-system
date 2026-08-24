import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { picturesExpireAt, type PulledReview } from "./gql";

/* ============================================================
   Penyimpan hasil tarik.

   Dipakai DUA jalur pemanggil: tombol di layar (menarik dari server) dan
   penarik yang berjalan di laptop lalu mengirim hasilnya ke /ingest. Ditaruh
   di satu tempat dengan sengaja — kalau tiap jalur punya salinannya sendiri,
   aturan seperti "rating tidak sah dibuang" perlahan hanya berlaku di salah
   satunya, dan yang bocor menempel permanen di toko.
   ============================================================ */

export interface StoreResult {
  seenCount: number;
  newCount: number;
  withBody: number;
  noBody: number;
  /** Dibuang karena bintangnya tidak sah — bukan diperbaiki diam-diam. */
  discarded: number;
}

/**
 * Bintangnya sah? Review tanpa rating yang jelas TIDAK diberi nilai bawaan.
 *
 * Menganggapnya bintang 5 akan menaikkan rating agregat toko dengan angka yang
 * tidak pernah diberikan siapa pun — dan sekali terimport, Judge.me hanya bisa
 * membatalkannya sebatch, bukan sebaris.
 */
export function validRating(r: PulledReview): boolean {
  const n = Number(r.productRating);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export function toReviewRow(r: PulledReview, pulledAt: string) {
  const urls = (r.imageAttachments ?? []).map((a) => a?.imageUrl).filter((u): u is string => Boolean(u));
  const expires = picturesExpireAt(urls);
  const ts = Number(r.reviewCreateTime ?? 0);
  return {
    feedback_id: r.feedbackID,
    product_id: r._productId,
    shopify_handle: r._shopifyHandle,
    rating: Number(r.productRating),
    body: (r.message ?? "").trim(),
    // Tanpa stempel waktu yang sah, dipakai waktu penarikan — BUKAN epoch.
    // `review_date` adalah satu-satunya jalur Judge.me yang bisa backdate, jadi
    // tanggal 01/01/1970 akan benar-benar terpasang di review itu.
    review_at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : pulledAt,
    reviewer_name: (r.user?.fullName ?? "").trim(),
    is_anonymous: r.isAnonymous === true,
    variant_name: r.variantName || null,
    reply: (r.reviewResponse?.message ?? "").trim() || null,
    picture_urls: urls,
    pictures_expire_at: expires ? expires.toISOString() : null,
  };
}

/** Seluruh feedbackID yang sudah ada di ledger — kunci dedup & berhenti-awal. */
export async function readSeen(admin: SupabaseClient): Promise<Set<string>> {
  const seen = new Set<string>();
  // Dipaginasi: batas bawaan PostgREST 1000 baris akan diam-diam memotong
  // ledger, dan ledger yang terpotong membuat review lama terlihat "baru".
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("tokopedia_reviews").select("feedback_id").range(from, from + 999);
    if (!data?.length) break;
    for (const row of data) seen.add(String(row.feedback_id));
    if (data.length < 1000) break;
  }
  return seen;
}

export async function storeReviews(
  admin: SupabaseClient,
  runId: string,
  pulled: PulledReview[],
  seen: Set<string>,
): Promise<StoreResult> {
  const pulledAt = new Date().toISOString();

  const fresh = new Map<string, PulledReview>();
  for (const r of pulled) if (r?.feedbackID && !fresh.has(r.feedbackID)) fresh.set(r.feedbackID, r);

  const usable = [...fresh.values()].filter(validRating);
  const newOnes = usable.filter((r) => !seen.has(r.feedbackID));
  const revisited = usable.filter((r) => seen.has(r.feedbackID));

  if (newOnes.length) {
    const rows = newOnes.map((r) => ({ ...toReviewRow(r, pulledAt), first_run_id: runId }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin
        .from("tokopedia_reviews")
        .upsert(rows.slice(i, i + 200), { onConflict: "feedback_id" });
      if (error) throw new Error(error.message);
    }
  }

  // Halaman pertama tiap produk hampir selalu berisi review yang sudah dimiliki.
  // Tautan fotonya yang baru ikut disimpan — gratis, dan itulah yang membuat
  // ekspor ulang batch lama tetap membawa foto yang hidup.
  if (revisited.length) {
    const rows = revisited.map((r) => toReviewRow(r, pulledAt)).filter((r) => r.picture_urls.length > 0);
    for (let i = 0; i < rows.length; i += 200) {
      await admin.from("tokopedia_reviews").upsert(rows.slice(i, i + 200), { onConflict: "feedback_id" });
    }
  }

  const withBody = newOnes.filter((r) => (r.message ?? "").trim()).length;
  return {
    seenCount: fresh.size,
    newCount: newOnes.length,
    withBody,
    noBody: newOnes.length - withBody,
    discarded: fresh.size - usable.length,
  };
}

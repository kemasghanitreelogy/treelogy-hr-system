import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mapProduct, mapReview, mapRun } from "@/lib/tokopedia/map";
import { minIntervalHours, pullGate } from "@/lib/tokopedia/schedule";
import type { TokopediaState } from "@/lib/tokopedia/types";

/**
 * Satu muatan berisi seluruh isi layar: peta produk, riwayat run, dan ledger
 * review. Dijadikan satu fungsi supaya halaman (render server) dan route
 * penyegar (setelah tarik) memakai sumber yang sama.
 */
/**
 * Semua sumber dimuat sekaligus, lalu LAYAR yang menyaring.
 *
 * Menaruh saringan di sini berarti berpindah tab = satu perjalanan ke server
 * lagi; padahal seluruh isinya sudah muat dalam satu muatan. Angka ringkasan
 * per sumber juga jadi bisa ditampilkan tanpa permintaan tambahan.
 */
export async function readState(): Promise<TokopediaState> {
  const supabase = await createClient();
  const empty: TokopediaState = {
    products: [], runs: [], reviews: [],
    nextPullAt: null, minIntervalHours: minIntervalHours(), ready: false,
  };
  if (!supabase) return empty;

  const [productsRes, runsRes, reviewsRes] = await Promise.all([
    supabase.from("marketplace_products").select("*").order("sort_order", { ascending: true }),
    supabase.from("marketplace_review_runs").select("*").order("started_at", { ascending: false }).limit(20),
    // Ledger toko ini berukuran ratusan baris; dibaca utuh supaya penyaringan,
    // pratinjau, dan pembuatan CSV semuanya jalan tanpa bolak-balik ke server.
    supabase.from("marketplace_reviews").select("*").order("review_at", { ascending: false }).limit(5000),
  ]);

  const products = (productsRes.data ?? []).map(mapProduct);
  const nameById = new Map(products.map((p) => [p.productId, p.name]));
  const runs = (runsRes.data ?? []).map(mapRun);
  const reviews = (reviewsRes.data ?? []).map((r) => mapReview(r, nameById.get(String(r.product_id)) ?? ""));

  for (const p of products) {
    p.reviewCount = reviews.reduce((n, r) => n + (r.productId === p.productId ? 1 : 0), 0);
  }

  const gate = pullGate(runs);
  return {
    products,
    runs,
    reviews,
    nextPullAt: gate.nextPullAt,
    minIntervalHours: minIntervalHours(),
    ready: products.some((p) => p.active),
  };
}

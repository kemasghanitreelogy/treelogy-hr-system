import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketplaceSource } from "@/lib/marketplace/sources";
import { normalize, toRow, validRating as ratingSah } from "@/lib/marketplace/normalize";
import { salinFoto, sudahDisalin } from "@/lib/marketplace/photos";

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
  /** Foto yang berhasil disalin ke penyimpanan sendiri pada run ini. */
  fotoDisalin: number;
  /** Gagal disalin — tautan aslinya dipertahankan, dicoba lagi run berikutnya. */
  fotoGagal: number;
  /** Belum sempat disalin karena anggaran waktu habis. */
  fotoTertunda: number;
}

/**
 * Bintangnya sah? Review tanpa rating yang jelas TIDAK diberi nilai bawaan.
 *
 * Menganggapnya bintang 5 akan menaikkan rating agregat toko dengan angka yang
 * tidak pernah diberikan siapa pun — dan sekali terimport, Judge.me hanya bisa
 * membatalkannya sebatch, bukan sebaris.
 */


/** Seluruh feedbackID yang sudah ada di ledger — kunci dedup & berhenti-awal. */
export async function readSeen(admin: SupabaseClient, source: MarketplaceSource): Promise<Set<string>> {
  const seen = new Set<string>();
  // Dipaginasi: batas bawaan PostgREST 1000 baris akan diam-diam memotong
  // ledger, dan ledger yang terpotong membuat review lama terlihat "baru".
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("marketplace_reviews")
      .select("feedback_id")
      .eq("source", source)
      .range(from, from + 999);
    if (!data?.length) break;
    for (const row of data) seen.add(String(row.feedback_id));
    if (data.length < 1000) break;
  }
  return seen;
}

export async function storeReviews(
  admin: SupabaseClient,
  source: MarketplaceSource,
  runId: string,
  pulled: unknown[],
  seen: Set<string>,
): Promise<StoreResult> {
  const pulledAt = new Date().toISOString();

  // Diseragamkan lebih dulu: sesudah titik ini tidak ada lagi bentuk khas
  // marketplace mana pun, sehingga aturan di bawah berlaku sama untuk semua.
  const fresh = new Map<string, ReturnType<typeof normalize>>();
  for (const raw of pulled) {
    const n = normalize(source, raw);
    if (n && !fresh.has(n.feedbackId)) fresh.set(n.feedbackId, n);
  }

  const usable = [...fresh.values()].filter((n): n is NonNullable<typeof n> => Boolean(n) && ratingSah(n!));
  const newOnes = usable.filter((n) => !seen.has(n.feedbackId));
  const revisited = usable.filter((n) => seen.has(n.feedbackId));

  // Kunci konflik ikut menyertakan `source`: ID review Shopee dan Tokopedia
  // sama-sama angka dan BISA bertabrakan — tanpa ini, satu bisa menimpa yang
  // lain diam-diam.
  const KUNCI = "source,feedback_id";

  if (newOnes.length) {
    const rows = newOnes.map((n) => ({ ...toRow(source, n, pulledAt), first_run_id: runId }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from("marketplace_reviews").upsert(rows.slice(i, i + 200), { onConflict: KUNCI });
      if (error) throw new Error(error.message);
    }
  }

  // Halaman pertama tiap produk hampir selalu berisi review yang sudah dimiliki.
  // Tautan fotonya yang baru ikut disimpan — gratis, dan itulah yang membuat
  // ekspor ulang batch lama tetap membawa foto yang hidup (penting untuk
  // Tokopedia, yang tautannya mati dalam hitungan jam).
  if (revisited.length) {
    const rows = revisited.map((n) => toRow(source, n, pulledAt)).filter((r) => r.picture_urls.length > 0);
    for (let i = 0; i < rows.length; i += 200) {
      await admin.from("marketplace_reviews").upsert(rows.slice(i, i + 200), { onConflict: KUNCI });
    }
  }

  // ── Foto disalin ke penyimpanan sendiri, SESUDAH barisnya tersimpan ──
  //
  // Urutannya disengaja: kalau penyalinan gagal atau kehabisan waktu, review
  // barunya sudah aman di ledger dan hanya fotonya yang tertinggal — run
  // berikutnya melanjutkan. Kebalikannya (menyalin dulu) membuat kegagalan
  // foto ikut menjatuhkan review yang sah.
  const berfoto = [...newOnes, ...revisited]
    .filter((n) => n.pictureUrls.length && n.pictureUrls.some((u) => !sudahDisalin(u)))
    .map((n) => ({ feedbackId: n.feedbackId, urls: n.pictureUrls }));

  let fotoDisalin = 0, fotoGagal = 0, fotoTertunda = 0;
  if (berfoto.length) {
    const hasil = await salinFoto(admin, source, berfoto);
    fotoDisalin = hasil.disalin;
    fotoGagal = hasil.gagal;
    fotoTertunda = hasil.dilewati;
    for (const [feedbackId, urls] of hasil.peta) {
      await admin
        .from("marketplace_reviews")
        .update({
          picture_urls: urls,
          // Sudah tersalin seluruhnya = tidak ada lagi yang kedaluwarsa.
          pictures_expire_at: urls.every(sudahDisalin) ? null : undefined,
        })
        .eq("source", source)
        .eq("feedback_id", feedbackId);
    }
  }

  const withBody = newOnes.filter((n) => n.body).length;
  return {
    seenCount: fresh.size,
    newCount: newOnes.length,
    withBody,
    noBody: newOnes.length - withBody,
    discarded: fresh.size - usable.length,
    fotoDisalin,
    fotoGagal,
    fotoTertunda,
  };
}

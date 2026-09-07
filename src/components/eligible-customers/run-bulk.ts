"use client";

import type { EligibleState, GrantInput, GrantResult } from "@/lib/eligible-customers/types";
import { MAX_BULK_ROWS, OUT_OF_TIME } from "@/lib/eligible-customers/validate";

/** Berapa kali baris yang kehabisan waktu di server dikirim ulang otomatis. */
const MAX_PASSES = 3;

/**
 * Menjalankan grant massal dari browser, per potongan, berurutan.
 *
 * Dipakai impor berkas DAN "ulangi / grant ulang semua" — dua tombol yang
 * berbeda asal barisnya tapi sama persis jalannya. Potongan dikirim satu per
 * satu (bukan paralel) supaya Shopify tidak dihujani dan urutan hasil tetap
 * sama dengan urutan berkas.
 */
export interface BulkProgress {
  done: number;
  total: number;
  results: GrantResult[];
}

export async function runBulk(
  rows: GrantInput[],
  onProgress: (p: BulkProgress) => void,
  onState?: (s: EligibleState) => void,
): Promise<GrantResult[]> {
  // Hasil disimpan per posisi baris supaya urutannya tetap sama dengan berkas
  // walaupun sebagian baris dikirim ulang di putaran berikutnya.
  const results: GrantResult[] = rows.map((r) => ({ email: r.email, ok: false, error: OUT_OF_TIME }));
  let pending = rows.map((_, idx) => idx);

  for (let pass = 0; pass < MAX_PASSES && pending.length; pass++) {
    const next: number[] = [];
    for (let i = 0; i < pending.length; i += MAX_BULK_ROWS) {
      const idxs = pending.slice(i, i + MAX_BULK_ROWS);
      const chunk = idxs.map((idx) => rows[idx]);
      let chunkResults: GrantResult[];
      try {
        const res = await fetch("/api/eligible-customers/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          results?: GrantResult[]; state?: EligibleState; error?: string;
        };
        if (!res.ok || !Array.isArray(data.results)) {
          // Seluruh potongan ditolak (sesi habis, izin, server) — tiap barisnya
          // dicatat gagal dengan kode yang sama, bukan hilang tanpa jejak.
          chunkResults = chunk.map((r) => ({
            email: r.email, ok: false, error: data.error ?? `http_${res.status}`,
          }));
        } else {
          chunkResults = data.results;
          if (data.state) onState?.(data.state);
        }
      } catch {
        chunkResults = chunk.map((r) => ({ email: r.email, ok: false, error: "request_failed" }));
      }
      idxs.forEach((idx, k) => {
        const r = chunkResults[k] ?? { email: rows[idx].email, ok: false, error: "request_failed" };
        results[idx] = r;
        // Server kehabisan anggaran waktu sebelum baris ini — bukan kegagalan
        // baris itu; masuk antrean putaran berikutnya.
        if (!r.ok && r.error === OUT_OF_TIME) next.push(idx);
      });
      const done = results.filter((r) => r.ok || r.error !== OUT_OF_TIME).length;
      onProgress({ done, total: rows.length, results: [...results] });
    }
    pending = next;
  }
  return results;
}

/** Ringkasan hasil — dipakai layar impor dan toast setelah grant ulang. */
export function tally(results: GrantResult[]) {
  let seeded = 0, pending = 0, failedSeed = 0, error = 0;
  for (const r of results) {
    if (!r.ok) error++;
    else if (r.customer?.seedStatus === "seeded") seeded++;
    else if (r.customer?.seedStatus === "failed") failedSeed++;
    else pending++;
  }
  return { seeded, pending, failedSeed, error };
}

"use client";

import type { EligibleState, GrantInput, GrantResult } from "@/lib/eligible-customers/types";
import { MAX_BULK_ROWS } from "@/lib/eligible-customers/validate";

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
  const results: GrantResult[] = [];
  for (let i = 0; i < rows.length; i += MAX_BULK_ROWS) {
    const chunk = rows.slice(i, i + MAX_BULK_ROWS);
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
    results.push(...chunkResults);
    onProgress({ done: results.length, total: rows.length, results: [...results] });
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

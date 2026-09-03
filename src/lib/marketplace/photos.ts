import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketplaceSource } from "./sources";

/* ============================================================
   Menyalin foto review ke penyimpanan sendiri.

   Tokopedia menyajikan foto review lewat URL bertanda tangan yang hidup
   sekitar TIGA JAM. Judge.me mengunduh fotonya saat import diproses — bukan
   saat CSV dibuat — sehingga CSV yang ditarik pagi lalu diimport malam masuk
   tanpa foto, tanpa peringatan apa pun. Terbukti: 328 foto di ledger ini
   seluruhnya mati beberapa jam setelah ditarik.

   Menyalin fotonya menghapus seluruh masalah itu sekaligus: tautannya
   permanen, batch lama tetap bisa diekspor ulang berbulan-bulan kemudian,
   dan tidak ada lagi balapan dengan jam.
   ============================================================ */

const BUCKET = "review-photos";

/** Sudah tersalin? Ditandai dari alamatnya sendiri — tanpa kolom tambahan. */
export function sudahDisalin(url: string): boolean {
  return url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
};

/**
 * Satu foto: unduh lalu simpan. Mengembalikan alamat permanennya, atau alamat
 * ASLI kalau gagal — foto yang gagal disalin masih lebih berguna daripada
 * baris tanpa foto sama sekali, dan run berikutnya akan mencobanya lagi.
 */
async function salinSatu(
  admin: SupabaseClient,
  jalur: string,
  urlAsli: string,
  timeoutMs: number,
): Promise<string> {
  try {
    const res = await fetch(urlAsli, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return urlAsli;
    const tipe = (res.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    const ext = EXT[tipe];
    if (!ext) return urlAsli; // bukan gambar yang dikenali — jangan disimpan
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.byteLength) return urlAsli;

    const nama = `${jalur}.${ext}`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(nama, buf, { contentType: tipe, upsert: true, cacheControl: "31536000" });
    if (error) return urlAsli;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(nama);
    return data?.publicUrl || urlAsli;
  } catch {
    return urlAsli;
  }
}

export interface HasilSalin {
  /** feedbackId → daftar alamat baru. Hanya berisi yang BERUBAH. */
  peta: Map<string, string[]>;
  disalin: number;
  gagal: number;
  dilewati: number;
}

/**
 * Menyalin foto untuk sekumpulan review, dengan ANGGARAN WAKTU.
 *
 * Fungsi ini dipanggil di dalam permintaan HTTP yang punya batas waktu.
 * Menyalin sampai habis tanpa memperhatikan jam akan membuat seluruh run
 * gagal di detik terakhir — dan run yang gagal berarti review barunya ikut
 * hilang, bukan cuma fotonya. Jadi begitu anggaran habis, sisanya dibiarkan
 * memakai alamat aslinya; run berikutnya melanjutkan, karena yang sudah
 * tersalin dikenali dari alamatnya.
 */
export async function salinFoto(
  admin: SupabaseClient,
  source: MarketplaceSource,
  daftar: { feedbackId: string; urls: string[] }[],
  anggaranMs = 35_000,
): Promise<HasilSalin> {
  const batas = Date.now() + anggaranMs;
  const peta = new Map<string, string[]>();
  let disalin = 0, gagal = 0, dilewati = 0;

  // Lima sekaligus: cukup untuk menghabiskan ratusan foto dalam hitungan
  // detik, tanpa membanjiri CDN-nya maupun jaringan fungsi ini.
  const antre = daftar.filter((d) => d.urls.some((u) => !sudahDisalin(u)));
  const PARALEL = 5;

  for (let i = 0; i < antre.length; i += PARALEL) {
    if (Date.now() > batas) {
      dilewati += antre.length - i;
      break;
    }
    await Promise.all(
      antre.slice(i, i + PARALEL).map(async (d) => {
        const baru = await Promise.all(
          d.urls.map((u, n) =>
            sudahDisalin(u) ? Promise.resolve(u) : salinSatu(admin, `${source}/${d.feedbackId}-${n}`, u, 15_000),
          ),
        );
        const berubah = baru.some((u, n) => u !== d.urls[n]);
        if (berubah) peta.set(d.feedbackId, baru);
        for (let n = 0; n < baru.length; n++) {
          if (sudahDisalin(d.urls[n])) continue;
          if (baru[n] !== d.urls[n]) disalin++;
          else gagal++;
        }
      }),
    );
  }
  return { peta, disalin, gagal, dilewati };
}

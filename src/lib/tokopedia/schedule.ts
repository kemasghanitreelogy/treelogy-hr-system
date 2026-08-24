import type { TokopediaRun } from "./types";

/* ============================================================
   Penjaga jeda antar-run.

   Di skrip aslinya, "bulanan ideal; jangan lebih rapat dari mingguan" hanya
   sebuah kalimat di dokumen — dan kalimat tidak menahan siapa pun menekan
   tombol dua kali. Di sini aturannya jadi kode: fungsi ini yang memutuskan,
   dan endpoint penariknya menolak berjalan sebelum jendelanya lewat.
   ============================================================ */

/** Jeda normal antar-run sukses. Bawaan seminggu = batas keras dokumen §9.1. */
export const DEFAULT_MIN_INTERVAL_HOURS = 168;

/**
 * Sesudah run yang DITOLAK endpoint: diam sehari penuh.
 *
 * Ini yang paling tidak boleh dilonggarkan. Menekan tombol lagi di hari yang
 * sama setelah ditolak persis seperti retry — perilaku yang sengaja dihindari
 * seluruh rancangan ini.
 */
export const REJECTED_COOLDOWN_HOURS = 24;

/**
 * Sesudah run `partial` (kehabisan anggaran waktu, bukan ditolak): jeda pendek.
 *
 * Pekerjaannya memang belum selesai dan sisanya menunggu, jadi memaksa
 * menunggu seminggu penuh justru membuat run berikutnya lebih besar — bukan
 * lebih kecil. Enam jam masih jauh dari irama mesin.
 */
export const PARTIAL_COOLDOWN_HOURS = 6;

export function minIntervalHours(): number {
  const raw = Number(process.env.TOKOPEDIA_MIN_INTERVAL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MIN_INTERVAL_HOURS;
}

export interface PullGate {
  allowed: boolean;
  /** ISO — kapan boleh dicoba lagi. Null saat sudah boleh sekarang. */
  nextPullAt: string | null;
  /** Alasan penolakan, dipakai sebagai kode galat API. */
  reason: "cooldown" | "cooldown_rejected" | "already_running" | null;
  /** True bila penundaan ini boleh ditembus pemegang `reviews.manage`. */
  overridable: boolean;
}

const hoursMs = (h: number) => h * 3_600_000;

/**
 * Boleh menarik sekarang?
 *
 * `runs` harus terurut terbaru dulu. Yang diperiksa hanya run terakhir: run
 * yang lebih tua sudah tidak bisa memberi larangan baru.
 */
export function pullGate(runs: TokopediaRun[], now = new Date()): PullGate {
  const last = runs[0];
  if (!last) return { allowed: true, nextPullAt: null, reason: null, overridable: false };

  // Run yang masih berjalan menahan yang lain — dua penarik serentak akan
  // saling melihat ledger yang belum lengkap dan menarik halaman yang sama.
  // Batas 10 menit menutup kemungkinan baris `running` yang tertinggal karena
  // prosesnya mati sebelum sempat menutup dirinya.
  if (last.status === "running") {
    const stuckAt = new Date(last.startedAt).getTime() + hoursMs(1 / 6);
    if (stuckAt > now.getTime()) {
      return {
        allowed: false,
        nextPullAt: new Date(stuckAt).toISOString(),
        reason: "already_running",
        overridable: false,
      };
    }
    return { allowed: true, nextPullAt: null, reason: null, overridable: false };
  }

  const waitHours =
    last.status === "rejected"
      ? REJECTED_COOLDOWN_HOURS
      : last.status === "partial"
        ? PARTIAL_COOLDOWN_HOURS
        : last.status === "failed"
          ? // Galat isi (mis. schema drift) bukan penolakan — mencobanya lagi
            // tidak menambah tekanan ke endpoint, tapi tetap diberi jeda agar
            // query yang rusak tidak dipukul berulang-ulang.
            1
          : minIntervalHours();

  const readyAt = new Date(last.startedAt).getTime() + hoursMs(waitHours);
  if (readyAt <= now.getTime()) {
    return { allowed: true, nextPullAt: null, reason: null, overridable: false };
  }
  return {
    allowed: false,
    nextPullAt: new Date(readyAt).toISOString(),
    reason: last.status === "rejected" ? "cooldown_rejected" : "cooldown",
    // Penolakan endpoint TIDAK bisa ditembus siapa pun, termasuk admin.
    overridable: last.status !== "rejected",
  };
}

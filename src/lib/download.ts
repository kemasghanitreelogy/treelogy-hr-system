"use client";

/**
 * Penyimpan berkas unduhan — satu jalur untuk semua ekspor.
 *
 * Dulu tiap modul ekspor menyalin pola yang sama: buat alamat sementara, klik
 * tautan, cabut alamatnya. Pola itu punya dua celah yang khusus muncul di
 * Safari, dan karena disalin ke mana-mana, celahnya ikut tersalin:
 *
 *  • Tautan yang tidak pernah dimasukkan ke halaman — Safari mengabaikan
 *    kliknya, jadi tidak ada yang terunduh sama sekali.
 *  • Alamat sementara yang dicabut tepat setelah klik — Safari membaca isinya
 *    secara asinkron, sehingga berkas bisa tersimpan tidak utuh. Rusaknya diam:
 *    tidak ada pesan, dan baru ketahuan saat berkasnya ditolak di tempat lain.
 */

/** Berapa lama alamat sementara dibiarkan hidup setelah klik. */
const REVOKE_DELAY_MS = 10_000;

export function saveBlobAsFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}

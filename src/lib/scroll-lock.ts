"use client";

/**
 * Kunci scroll body terpusat dengan hitungan referensi.
 *
 * Sebelumnya tiap overlay (Sheet, ConfirmDialog, RejectDialog, kamera, …)
 * menyetel `document.body.style.overflow` sendiri dengan pola simpan/pulihkan.
 * Saat dua overlay bertumpuk — mis. dialog konfirmasi di atas sheet detail —
 * urutan cleanup yang salah memulihkan nilai "hidden" milik overlay lain, dan
 * halaman terkunci tidak bisa di-scroll sampai reload.
 *
 * Dengan hitungan referensi, body baru dibuka kembali saat SEMUA kunci lepas,
 * dan tidak ada yang pernah "memulihkan" nilai basi milik overlay lain.
 */

let locks = 0;

/** Kunci scroll body; panggil fungsi kembaliannya untuk melepas (idempoten). */
export function lockBodyScroll(): () => void {
  locks++;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = "";
  };
}

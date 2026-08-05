import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/* ============================================================
   Tautan berkas bertanda tangan.

   Baris di Google Sheet keuangan dibaca banyak orang — Finance, atasan, kadang
   auditor — dan tidak semuanya punya akun aplikasi HR. Tautan yang mewajibkan
   login membuat mereka mentok di halaman masuk.

   Solusinya BUKAN membuka bucket ke publik (semua faktur jadi bisa ditebak
   siapa pun), melainkan menandatangani setiap path dengan HMAC:

     /api/payment-requests/file?path=<path>&t=<tanda-tangan>

   · Tautan hanya berlaku untuk SATU path — mengubah path membatalkannya.
   · Tidak bisa dipalsukan tanpa rahasia server.
   · Tidak kedaluwarsa: baris keuangan sering dibuka bertahun-tahun kemudian,
     dan tautan mati di arsip lebih merepotkan daripada bermanfaat.

   Batasnya jujur: siapa pun yang MEMEGANG tautannya bisa membuka berkas itu.
   Jadi yang menjaga kerahasiaan adalah akses ke sheet-nya, sama seperti tautan
   Google Drive yang selama ini dipakai di kolom yang sama.
   ============================================================ */

/** Rahasia khusus bila diisi; kalau tidak, pakai service role key (server-only). */
const SECRET = process.env.FILE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function signFilePath(path: string): string {
  if (!SECRET) return "";
  return createHmac("sha256", SECRET).update(path).digest("base64url");
}

/** Perbandingan waktu-tetap agar tanda tangan tidak bisa ditebak byte per byte. */
export function verifyFileToken(path: string, token: string | null): boolean {
  if (!SECRET || !token) return false;
  const expected = signFilePath(path);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** URL lengkap siap ditulis ke Google Sheet. */
export function signedFileUrl(origin: string, path: string): string {
  const t = signFilePath(path);
  const q = `path=${encodeURIComponent(path)}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
  return `${origin.replace(/\/+$/, "")}/api/payment-requests/file?${q}`;
}

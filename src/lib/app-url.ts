import "server-only";

/**
 * Alamat asal aplikasi, untuk tautan di dalam email dan notifikasi.
 *
 * Dulu domainnya ditulis langsung di dalam kode pengirim email. Itu berarti
 * setiap kali alamat aplikasi berganti, ada tautan yang diam-diam menunjuk ke
 * tempat yang sudah tidak ada — dan yang menemukannya adalah penerima email,
 * bukan yang mengganti domainnya.
 *
 * Urutannya sengaja: `APP_ORIGIN` menang supaya domain kustom bisa dipaksa,
 * lalu `VERCEL_PROJECT_PRODUCTION_URL` yang diisi Vercel sendiri — jadi
 * mengganti nama proyek tidak menuntut satu pun perubahan kode.
 */
export function appOrigin(): string {
  const explicit = process.env.APP_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

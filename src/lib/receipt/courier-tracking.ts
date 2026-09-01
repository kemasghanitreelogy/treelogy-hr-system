/* ============================================================
   Kurir → nama pengangkut & tautan lacak untuk Shopify.

   Shopify menyimpan tiga hal pada sebuah fulfillment: nama kurir, nomor resi,
   dan tautan lacak. Untuk kurir yang dikenalinya, Shopify membuat tautannya
   sendiri; kurir Indonesia TIDAK dikenali — di aplikasi Shopify pun ia jatuh
   ke "Other" — jadi tautannya harus kita isi sendiri.

   Soal tautan: yang dipakai di sini adalah HALAMAN LACAK UMUM tiap kurir,
   bukan tautan langsung ke satu resi. Alasannya bukan kemalasan — tidak ada
   satu pun kurir ini yang mendokumentasikan format tautan langsungnya, dan
   percobaan langsung tidak menyelesaikan pertanyaannya: J&T membalas 418
   (deteksi bot) sehingga tidak bisa diuji sama sekali, sedangkan Lion Parcel
   menjawab 200 untuk pola apa pun — termasuk yang salah — karena halamannya
   dirender JavaScript. Menebak lalu memasangnya ke email pelanggan berarti
   mengirim tautan yang mungkin membuka halaman kosong.

   Pembeli tetap tidak dirugikan: Shopify menampilkan NOMOR RESI di samping
   tautannya, jadi tinggal disalin di halaman yang terbuka.

   Kalau suatu saat format tautan langsungnya terkonfirmasi, cukup ubah
   `trackUrl` kurir itu menjadi fungsi yang menyisipkan `awb`.
   ============================================================ */

export interface CourierTracking {
  /** Nama yang tersimpan di Shopify (`trackingInfo.company`). */
  company: string;
  /** Tautan lacak untuk sebuah nomor resi. */
  trackUrl: (awb: string) => string;
}

const COURIERS: Record<string, CourierTracking> = {
  "j&t express": { company: "J&T Express", trackUrl: () => "https://jet.co.id/track" },
  "lion parcel": { company: "Lion Parcel", trackUrl: () => "https://lionparcel.com/track/stt" },
  jne: { company: "JNE", trackUrl: () => "https://jne.co.id/tracking-package" },
};

/**
 * Cari kurir dari teks bebas hasil pembacaan label.
 *
 * Dicocokkan longgar karena label menuliskannya bermacam-macam ("J&T",
 * "J&T Express", "JNE Express"). Kurir yang tidak dikenali mengembalikan null —
 * dan itu ditangani sebagai "tidak bisa di-fulfill otomatis", bukan ditebak
 * jadi kurir terdekat.
 */
export function courierTracking(raw: string | null | undefined): CourierTracking | null {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return null;
  if (COURIERS[k]) return COURIERS[k];
  if (k.includes("lion")) return COURIERS["lion parcel"];
  if (k.includes("j&t") || k.includes("jnt") || k.includes("global jet")) return COURIERS["j&t express"];
  // "jne" diperiksa PALING AKHIR dan hanya sebagai kata utuh: mencocokkannya
  // sebagai potongan akan menyambar "J&T Express Jne..." dan sejenisnya.
  if (/\bjne\b/.test(k)) return COURIERS.jne;
  return null;
}

/** Daftar kurir yang didukung — untuk pesan di layar. */
export const SUPPORTED_COURIERS = Object.values(COURIERS).map((c) => c.company);

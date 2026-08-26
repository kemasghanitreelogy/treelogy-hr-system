/**
 * Pembacaan lapisan teks PDF — murni, tanpa dependensi browser maupun Node,
 * supaya logika yang sama dipakai di perangkat pengguna DAN di server saat
 * perangkatnya tidak sanggup membaca sendiri.
 */

/** Sebuah halaman dianggap punya lapisan teks yang layak kalau sebanyak ini
 *  karakter terbaca DAN ada penanda label di dalamnya. */
export const TEXT_LAYER_MIN_CHARS = 80;

interface TextItemLike {
  str?: string;
  transform?: number[];
}

/**
 * Susun ulang baris dari item teks pdf.js.
 *
 * pdf.js mengembalikan potongan teks beserta posisinya, tanpa baris. Parser
 * label bekerja per baris ("Penerima: NAMA ****1234" lalu alamat di bawahnya),
 * jadi potongan dengan posisi Y yang sama digabung menjadi satu baris dan
 * diurutkan kiri→kanan. Tanpa ini, nama dan alamat bisa tertukar urutannya.
 */
export function linesFromTextContent(
  tc: { items?: TextItemLike[] } | null | undefined,
  tolerance = 2,
): string[] {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
  for (const it of tc?.items ?? []) {
    const str = it?.str ?? "";
    if (!str.trim()) continue;
    const t = it?.transform;
    // Item tanpa matriks posisi tidak bisa ditempatkan; jangan sampai
    // membaca indeks dari nilai kosong dan menjatuhkan seluruh halaman.
    if (!t || t.length < 6) continue;
    const y = t[5];
    const x = t[4];
    let row = rows.find((r) => Math.abs(r.y - y) <= tolerance);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) =>
    r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(" ").replace(/\s+/g, " ").trim(),
  );
}

export function hasUsableTextLayer(lines: string[]): boolean {
  const flat = lines.join(" ");
  return flat.length >= TEXT_LAYER_MIN_CHARS && /penerima|pengirim/i.test(flat);
}

/* ============================================================
   Packing slip pesanan website (Shopify) — format kedua.

   Ini BUKAN label pengiriman: tidak ada barcode, tidak ada nomor resi. Yang
   ada justru hal yang pada label harus dikejar ke Shopify — nama penerima dan
   nomor HP-nya tercetak langsung di halaman.

   Yang membuatnya perlu penanganan sendiri adalah tata letaknya: SHIP TO dan
   BILL TO berdiri BERDAMPINGAN pada ketinggian yang sama. Penyusun baris biasa
   menggabungkan keduanya jadi satu baris —

       "Hotmaria Siregar Hotmaria Siregar"

   — dan memotongnya di tengah hanya benar selama penerima dan pembayar orang
   yang sama. Begitu pesanannya dikirim ke alamat orang lain (hadiah, kantor),
   potongan itu diam-diam mengambil nama yang salah. Karena itu kolomnya
   dipisah dari POSISI X-nya, bukan dari isi teksnya.
   ============================================================ */

/** Penanda format; dicari pada baris hasil penyusunan biasa. */
const SHIP_TO_RE = /\bSHIP\s*TO\b/i;
const BILL_TO_RE = /\bBILL\s*TO\b/i;

export function isPackingSlip(lines: string[]): boolean {
  const flat = lines.join(" ");
  return SHIP_TO_RE.test(flat) && BILL_TO_RE.test(flat);
}

/**
 * Baris kolom SHIP TO saja, atau null bila halaman ini bukan packing slip.
 *
 * Batas kolomnya diambil dari posisi "BILL TO" itu sendiri, bukan dari angka
 * tetap: lebar kolom berubah mengikuti panjang alamat, dan menuliskan batas
 * yang dihitung sekali akan meleset pada pesanan berikutnya.
 */
export function shipToLines(
  tc: { items?: TextItemLike[] } | null | undefined,
  tolerance = 2,
): string[] | null {
  const items = (tc?.items ?? []).filter((it) => (it?.str ?? "").trim() && (it?.transform?.length ?? 0) >= 6);
  if (!items.length) return null;

  const shipTo = items.find((it) => SHIP_TO_RE.test(it.str ?? ""));
  const billTo = items.find((it) => BILL_TO_RE.test(it.str ?? ""));
  if (!shipTo || !billTo) return null;

  const shipX = shipTo.transform![4];
  const billX = billTo.transform![4];
  // BILL TO harus benar-benar di KANAN. Kalau tidak, tata letaknya bukan yang
  // kita kenali — lebih baik mundur ke penyusunan biasa daripada memotong
  // halaman menurut asumsi yang keliru.
  if (billX <= shipX) return null;

  // Sedikit lega ke kiri dari BILL TO: huruf pertama sebuah kolom tidak selalu
  // persis di x penandanya.
  const batas = billX - 4;
  return linesFromTextContent({ items: items.filter((it) => it.transform![4] < batas) }, tolerance);
}

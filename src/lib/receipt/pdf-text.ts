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

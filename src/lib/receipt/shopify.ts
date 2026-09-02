/**
 * Pencocok order Shopify — menghubungkan tiap label resi ke satu order dan
 * mengembalikan data kontak penerima yang BERSIH (nama, HP, alamat) plus nomor
 * ordernya. Dirancang untuk bekerja dari hasil OCR lokal yang berisik, tanpa LLM.
 *
 * Strategi — angka dulu, fuzzy, berbasis kumpulan (pool):
 *   1. Ambil POOL order di sekitar tanggal kirim (satu query terpaginasi).
 *   2. Cocokkan tiap label ke pool lewat tiga sinyal INDEPENDEN:
 *        • 4 digit HP — label menyamarkan nomor jadi "****1234"; empat digit itu
 *          harus sama dengan ekor nomor order (toleransi 1 salah baca).
 *        • kodepos    — 5 digit dari alamat label vs zip order (toleransi 1).
 *        • irisan nama — token nama yang sama (tahan terhadap sampah OCR).
 *   3. Sebuah kecocokan baru "certain" kalau DUA sinyal independen setuju —
 *      jadi tebakan satu-sinyal tidak pernah lolos diam-diam.
 *
 * Ini mengalahkan pencarian-nama karena OCR membaca angka jauh lebih andal
 * daripada area nama yang tercetak kecil, dan nama/HP final justru datang dari
 * Shopify sendiri.
 */

export interface MatchResult {
  phone: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  orderName: string | null;
  /** ID numerik order Shopify (= `ref_no` di Jubelio). */
  legacyId: string | null;
  confidence: "certain" | "high" | "low";
  reasons: string[];
  flag: string | null;
  candidateCount: number;
}

export interface MatchInput {
  page: number;
  name: string;
  zip: string;
  phoneLast4: string;
  /** ISO date; kosong = pakai hari ini. */
  shipDate: string;
}

interface PoolOrder {
  orderName: string;
  legacyId: string;
  createdAt: string;
  shipName: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  /** Order ini sudah pernah di-fulfill di Shopify. */
  fulfilled: boolean;
}

const API_VERSION = "2026-07";
/** Jendela pencarian order relatif tanggal kirim di label (hari). */
const WINDOW_BEFORE_DAYS = 30;
const WINDOW_AFTER_DAYS = 10;
/**
 * Jendela dipecah jadi beberapa potongan yang diambil BERSAMAAN.
 *
 * Paginasi Shopify berbasis kursor: halaman ke-2 baru bisa diminta setelah
 * halaman ke-1 tiba. Satu jendela 40 hari di toko ini berisi ±1.800 order —
 * kalau ditarik berurutan, itu 18 kali bolak-balik yang saling menunggu.
 * Dengan memecah jendelanya menurut tanggal, tiap potongan punya rantai
 * kursornya sendiri dan semuanya berjalan serentak: kedalaman menunggu turun
 * jadi ±3 permintaan, sementara cakupannya justru naik.
 */
const POOL_SHARDS = 8;
/** Maksimum halaman × 100 order per potongan. */
const MAX_PAGES_PER_SHARD = 3;

const digits = (s: string | null) => (s || "").replace(/\D/g, "");
const nameTokens = (s: string) =>
  new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m][n];
}

/**
 * Apakah nomor order berakhir dengan 4 digit dari label (persis, atau 1 salah
 * baca)? Yang dibandingkan hanya EKOR nomor — bukan sembarang jendela 4 digit di
 * tengah — supaya kecocokan kebetulan (label "3555" vs "…3155 88" milik orang
 * lain) tidak terlihat seperti kecocokan telepon.
 */
function phoneTail(phone: string, last4: string): "exact" | "fuzzy" | null {
  if (!phone || last4.length < 3) return null;
  const p = digits(phone);
  if (p.length < last4.length) return null;
  if (p.endsWith(last4)) return "exact";
  if (lev(p.slice(-last4.length), last4) <= 1) return "fuzzy";
  return null;
}

const POOL_QUERY = `query Pool($q: String!, $c: String) {
  orders(first: 100, after: $c, query: $q, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges { node { name legacyResourceId createdAt displayFulfillmentStatus shippingAddress { name address1 city province zip phone } } }
  }
}`;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Satu potongan jendela tanggal, ditarik sampai habis atau sampai batas halaman. */
async function fetchShard(
  store: string,
  token: string,
  from: string,
  to: string,
): Promise<PoolOrder[]> {
  const q = `created_at:>=${from} created_at:<=${to}`;
  const out: PoolOrder[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    // Satu halaman bisa ditolak dengan THROTTLED kalau kuota kalkulasi Shopify
    // sedang habis. Itu keadaan sementara, bukan kegagalan — tunggu sebentar
    // lalu ulangi halaman yang sama, jangan buang yang sudah terkumpul.
    let json: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res: Response = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ query: POOL_QUERY, variables: { q, c: cursor } }),
        // Tanpa batas waktu, satu panggilan yang menggantung menahan seluruh
        // pencocokan — dan halamannya berputar tanpa akhir. Bentuk cacat yang
        // sama dengan yang menjatuhkan aplikasi 27 Agustus.
        signal: AbortSignal.timeout(25_000),
      });
      json = await res.json().catch(() => null);
      const throttled =
        res.status === 429 ||
        (json?.errors ?? []).some((e: any) => e?.extensions?.code === "THROTTLED");
      if (!throttled) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!json || json.errors) {
      // Bedakan "tokennya tidak berizin" dari "Shopify sedang bermasalah".
      // Keduanya menghasilkan nol kecocokan, tapi hanya satu yang bisa
      // diperbaiki — dan tanpa dibedakan, layarnya terlanjur menyimpulkan
      // "order tidak ada di Shopify" padahal kita tidak pernah boleh melihat.
      const ditolak = (json?.errors ?? []).some(
        (e: any) => e?.extensions?.code === "ACCESS_DENIED" || /access denied/i.test(e?.message ?? ""),
      );
      throw new Error(ditolak ? "shopify_forbidden" : "shopify_error");
    }

    const conn = json.data?.orders;
    for (const e of conn?.edges ?? []) {
      const a = e.node.shippingAddress ?? {};
      out.push({
        orderName: e.node.name,
        legacyId: String(e.node.legacyResourceId ?? ""),
        createdAt: e.node.createdAt,
        fulfilled: e.node.displayFulfillmentStatus === "FULFILLED",
        shipName: a.name ?? "",
        address: [a.address1, a.city, a.province, a.zip].filter(Boolean).join(", "),
        city: a.city ?? "",
        zip: digits(a.zip ?? ""),
        phone: a.phone ?? "",
      });
    }
    cursor = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < MAX_PAGES_PER_SHARD);
  return out;
}

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function buildPool(store: string, token: string, shipDate: string): Promise<PoolOrder[]> {
  const base = +new Date(shipDate);
  const start = base - WINDOW_BEFORE_DAYS * DAY;
  const end = base + WINDOW_AFTER_DAYS * DAY;
  const span = Math.max(1, Math.ceil((end - start) / DAY));
  const perShard = Math.ceil(span / POOL_SHARDS);

  const ranges: [string, string][] = [];
  for (let d = 0; d < span; d += perShard) {
    const from = start + d * DAY;
    const to = Math.min(end, start + (d + perShard - 1) * DAY);
    ranges.push([iso(from), iso(to)]);
  }

  const shards = await Promise.all(ranges.map(([from, to]) => fetchShard(store, token, from, to)));
  // Potongan tanggal tidak tumpang tindih, tetapi satu order tetap bisa muncul
  // dua kali di batas hari (zona waktu) — disatukan menurut id ordernya.
  const seen = new Set<string>();
  const pool: PoolOrder[] = [];
  for (const shard of shards) {
    for (const o of shard) {
      const key = o.legacyId || o.orderName;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(o);
    }
  }
  // TERBARU DULU. Shard dirakit dari potongan tanggal tertua, dan pemilih
  // kandidat memenangkan skor-seri untuk yang DULUAN diperiksa — kombinasi
  // yang membuat pembeli langganan tercocok ke order LAMA-nya: sembilan label
  // batch reg1 jatuh ke order Agustus yang sudah terkirim, gagal deterministik
  // di verifikasi, dan retry pun gagal identik. Urutan ini membalik nasib seri.
  pool.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return pool;
}

/**
 * Simpanan pool di memori instance.
 *
 * Satu batch label biasanya diproses beberapa kali berturut-turut (unggah
 * susulan, ulang setelah perbaikan), dan semuanya memakai jendela tanggal yang
 * sama. Menyimpan hasilnya sebentar membuat pengambilan kedua dan seterusnya
 * tidak menyentuh jaringan sama sekali. Yang disimpan adalah PROMISE-nya, bukan
 * hasilnya: dua permintaan yang datang bersamaan ikut menunggu pengambilan yang
 * sama, bukan menembak Shopify dua kali.
 */
const POOL_TTL_MS = 3 * 60 * 1000;
const POOL_CACHE_MAX = 4;
const poolCache = new Map<string, { at: number; pool: Promise<PoolOrder[]> }>();

function fetchPool(store: string, token: string, shipDate: string): Promise<PoolOrder[]> {
  const key = `${store}|${shipDate}`;
  const hit = poolCache.get(key);
  if (hit && Date.now() - hit.at < POOL_TTL_MS) return hit.pool;

  const pool = buildPool(store, token, shipDate);
  // Pengambilan yang gagal tidak boleh ikut tersimpan — kalau tidak, satu
  // gangguan jaringan akan terus dijawab dari cache selama TTL berjalan.
  pool.catch(() => poolCache.delete(key));
  poolCache.set(key, { at: Date.now(), pool });

  for (const [k, v] of poolCache) {
    if (poolCache.size <= POOL_CACHE_MAX) break;
    if (k !== key) poolCache.delete(k);
    else void v;
  }
  return pool;
}

/** Siapkan pool lebih awal (dipanggil saat pembacaan label baru dimulai), agar
 *  ongkos jaringannya habis di belakang layar sebelum hasilnya dibutuhkan. */
export async function warmPool(shipDate: string): Promise<number> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY;
  if (!store || !token) return 0;
  try {
    return (await fetchPool(store, token, shipDate || new Date().toISOString().slice(0, 10))).length;
  } catch {
    return 0;
  }
}

function emptyResult(flag: string, candidateCount = 0): MatchResult {
  return {
    phone: null, name: null, address: null, city: null, zip: null,
    orderName: null, legacyId: null, confidence: "low", reasons: [], flag, candidateCount,
  };
}

/**
 * Indeks terbalik atas pool.
 *
 * Tanpa ini, tiap label harus diadu dengan SETIAP order di pool: 150 label ×
 * 1.100 order = 165.000 pembandingan, masing-masing menghitung jarak edit —
 * beberapa detik CPU hanya untuk mencocokkan. Dengan indeks, tiap label hanya
 * mengambil order yang setidaknya berbagi satu kunci dengannya (ekor nomor HP,
 * kodepos, atau token nama), biasanya belasan saja.
 */
interface PoolIndex {
  pool: PoolOrder[];
  byPhone: Map<string, PoolOrder[]>;
  byZip: Map<string, PoolOrder[]>;
  byToken: Map<string, PoolOrder[]>;
}

function push(map: Map<string, PoolOrder[]>, key: string, o: PoolOrder) {
  const cur = map.get(key);
  if (cur) cur.push(o);
  else map.set(key, [o]);
}

/** Panjang ekor nomor yang mungkin terbaca di label (masker "****1234"). */
const TAIL_LENGTHS = [3, 4];
const phoneKey = (len: number, tail: string) => `${len}:${tail}`;

function buildIndex(pool: PoolOrder[]): PoolIndex {
  const byPhone = new Map<string, PoolOrder[]>();
  const byZip = new Map<string, PoolOrder[]>();
  const byToken = new Map<string, PoolOrder[]>();
  for (const o of pool) {
    const p = digits(o.phone);
    // Kuncinya EKOR nomor — persis yang dibandingkan phoneTail(). Label bisa
    // menampilkan 3 atau 4 digit, jadi keduanya diindeks; kalau hanya satu
    // panjang yang diindeks, label dengan panjang lain tidak akan pernah ketemu.
    for (const len of TAIL_LENGTHS) if (p.length >= len) push(byPhone, phoneKey(len, p.slice(-len)), o);
    if (o.zip) push(byZip, o.zip, o);
    for (const t of nameTokens(o.shipName)) push(byToken, t, o);
  }
  return { pool, byPhone, byZip, byToken };
}

/**
 * Semua deret digit yang berjarak edit ≤1 dari `s` pada panjang yang sama.
 *
 * Karena yang dibandingkan selalu potongan sepanjang `s`, jarak edit 1 pada
 * panjang yang sama berarti tepat satu digit berbeda — cukup 9 kemungkinan per
 * posisi. Membangkitkan kuncinya (puluhan) jauh lebih murah daripada menyapu
 * seluruh pool, dan hasilnya identik dengan perbandingan satu per satu.
 */
function digitNeighbors(s: string): string[] {
  const out = [s];
  for (let i = 0; i < s.length; i++) {
    for (let d = 0; d <= 9; d++) {
      const c = String(d);
      if (c === s[i]) continue;
      out.push(s.slice(0, i) + c + s.slice(i + 1));
    }
  }
  return out;
}

/** Kandidat = order yang berbagi minimal satu kunci dengan label ini. */
function candidatesFor(inp: MatchInput, idx: PoolIndex, inTokens: Set<string>): PoolOrder[] {
  const seen = new Set<PoolOrder>();
  const take = (list?: PoolOrder[]) => {
    if (list) for (const o of list) seen.add(o);
  };

  if (inp.phoneLast4.length >= 3) {
    const len = inp.phoneLast4.length;
    for (const k of digitNeighbors(inp.phoneLast4)) take(idx.byPhone.get(phoneKey(len, k)));
  }
  if (inp.zip) for (const k of digitNeighbors(inp.zip)) take(idx.byZip.get(k));
  for (const t of inTokens) take(idx.byToken.get(t));

  return [...seen];
}

function matchAgainstPool(inp: MatchInput, idx: PoolIndex): MatchResult {
  const pool = idx.pool;
  const inTokens = nameTokens(inp.name);
  let best: PoolOrder | null = null;
  let bestScore = -Infinity;
  let bestReasons: string[] = [];

  for (const o of candidatesFor(inp, idx, inTokens)) {
    let score = 0;
    const reasons: string[] = [];

    const ph = phoneTail(o.phone, inp.phoneLast4);
    if (ph === "exact") {
      score += 4;
      reasons.push("HP-4 ✓");
    } else if (ph === "fuzzy") {
      score += 3;
      reasons.push("HP-4 ~");
    }

    if (inp.zip && o.zip) {
      if (o.zip === inp.zip) {
        score += 3;
        reasons.push("kodepos");
      } else if (lev(o.zip, inp.zip) <= 1) {
        score += 1.5;
        reasons.push("kodepos ~");
      }
    }

    const shared = [...inTokens].filter((t) => nameTokens(o.shipName).has(t)).length;
    if (shared >= 2) {
      score += 3;
      reasons.push("nama×" + shared);
    } else if (shared === 1) {
      score += 1.5;
      reasons.push("nama×1");
    }

    const days = Math.abs((+new Date(o.createdAt) - +new Date(inp.shipDate)) / 86400000);
    if (days <= 4) score += 1;

    // Label resi yang SEDANG dipindai adalah paket yang baru mau berangkat —
    // ordernya hampir pasti belum ter-fulfill. Bobot ini yang memisahkan dua
    // order pembeli langganan yang sinyal HP/kodepos/namanya identik persis:
    // tanpa ini keduanya seri, dan seri pernah dimenangkan order lama.
    if (!o.fulfilled) {
      score += 2;
      reasons.push("belum terkirim");
    }

    if (score > bestScore) {
      bestScore = score;
      best = o;
      bestReasons = reasons;
    }
  }

  if (!best || bestScore <= 0) return emptyResult("tidak ada order yang cocok", pool.length);

  const phoneExact = bestReasons.includes("HP-4 ✓");
  const phoneAny = bestReasons.some((r) => r.startsWith("HP-4"));
  const hasZip = bestReasons.some((r) => r.startsWith("kodepos"));
  const hasName = bestReasons.some((r) => r.startsWith("nama"));

  // Kalau label MENAMPILKAN 4 digit HP dan digit itu TIDAK cocok dengan order
  // ini, order tersebut hampir pasti milik orang lain (nama/area sama, nomor
  // beda) — jangan pernah sebut pasti, sekalipun nama + kodepos cocok.
  const phoneContradicts =
    inp.phoneLast4.length >= 3 && !!best.phone && !phoneTail(best.phone, inp.phoneLast4);

  let confidence: MatchResult["confidence"];
  let flag: string | null = null;

  if (phoneContradicts) {
    confidence = "low";
    flag = "4 digit HP berbeda dari order ini — cek ke label";
  } else if (hasName && phoneAny) {
    // Nama + 4 digit HP (persis atau selisih 1): nomor HP nyaris unik → pasti.
    confidence = "certain";
  } else if (phoneExact && hasZip) {
    // HP persis + kodepos persis: bukti angka sangat kuat meski nama kacau.
    confidence = "certain";
  } else if (hasName && hasZip) {
    // Nama + kodepos tanpa konfirmasi HP. Aman hanya kalau nama itu unik di area
    // tersebut — kalau tidak, dua tetangga bernama mirip bisa tertukar.
    const dupes = (inp.zip ? (idx.byZip.get(inp.zip) ?? []) : []).filter((o) => {
      return [...inTokens].some((t) => nameTokens(o.shipName).has(t));
    }).length;
    if (dupes <= 1) {
      confidence = "certain";
    } else {
      confidence = "low";
      flag = "ada beberapa order dengan nama + area yang sama — cek ke label";
    }
  } else {
    confidence = "low";
    flag = hasName || phoneAny || hasZip ? "cocok satu sinyal saja — cek ke label" : "kecocokan lemah — perlu diperiksa";
  }

  if (best.fulfilled) {
    // Menang PADAHAL sudah terkirim berarti tidak ada kandidat belum-terkirim
    // yang menyainginya — label lama tercetak ulang, atau ordernya memang tak
    // ada di jendela. Apa pun itu, mata manusia harus tahu.
    flag = flag
      ? `${flag} · order ini sudah pernah terkirim di Shopify`
      : "order ini sudah pernah terkirim di Shopify — kemungkinan label lama, cek dulu";
  }

  return {
    phone: best.phone || null,
    name: best.shipName || null,
    address: best.address || null,
    city: best.city || null,
    zip: best.zip || null,
    orderName: best.orderName,
    legacyId: best.legacyId || null,
    confidence,
    reasons: bestReasons,
    flag,
    candidateCount: pool.length,
  };
}

export async function matchAll(inputs: MatchInput[]): Promise<Map<number, MatchResult>> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY;
  const out = new Map<number, MatchResult>();

  if (!store || !token) {
    for (const i of inputs) out.set(i.page, emptyResult("Shopify belum dikonfigurasi"));
    return out;
  }

  // Satu batch bisa memuat beberapa berkas dengan tanggal cetak berbeda; pool
  // dibangun di sekitar tanggal yang PALING SERING muncul, bukan yang kebetulan
  // terbaca pertama (satu label dengan tanggal salah-baca tidak boleh menggeser
  // jendela pencarian seluruh batch).
  const tally = new Map<string, number>();
  for (const i of inputs) if (i.shipDate) tally.set(i.shipDate, (tally.get(i.shipDate) ?? 0) + 1);
  let shipDate = new Date().toISOString().slice(0, 10);
  let bestCount = 0;
  for (const [date, count] of tally) {
    if (count > bestCount) {
      bestCount = count;
      shipDate = date;
    }
  }
  let pool: PoolOrder[];
  try {
    pool = await fetchPool(store, token, shipDate);
  } catch {
    for (const i of inputs) out.set(i.page, emptyResult("gagal menghubungi Shopify"));
    return out;
  }

  // Indeks dibangun sekali untuk seluruh batch, lalu dipakai ulang tiap label.
  const idx = buildIndex(pool);
  for (const inp of inputs) out.set(inp.page, matchAgainstPool(inp, idx));
  return out;
}

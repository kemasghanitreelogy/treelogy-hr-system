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
}

const API_VERSION = "2026-07";
/** Jendela pencarian order relatif tanggal kirim di label (hari). */
const WINDOW_BEFORE_DAYS = 30;
const WINDOW_AFTER_DAYS = 10;
/** Maksimum halaman × 100 order. */
const MAX_POOL_PAGES = 8;

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
    edges { node { name legacyResourceId createdAt shippingAddress { name address1 city province zip phone } } }
  }
}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchPool(store: string, token: string, shipDate: string): Promise<PoolOrder[]> {
  const base = +new Date(shipDate);
  const from = new Date(base - WINDOW_BEFORE_DAYS * 86400000).toISOString().slice(0, 10);
  const to = new Date(base + WINDOW_AFTER_DAYS * 86400000).toISOString().slice(0, 10);
  const q = `created_at:>=${from} created_at:<=${to}`;
  const pool: PoolOrder[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    // Satu halaman bisa ditolak dengan THROTTLED kalau kuota kalkulasi Shopify
    // sedang habis (pool 800 order = 8 permintaan berat berturut-turut). Itu
    // keadaan sementara, bukan kegagalan — tunggu sebentar lalu ulangi halaman
    // yang sama, jangan buang seluruh pool yang sudah terkumpul.
    let json: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res: Response = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ query: POOL_QUERY, variables: { q, c: cursor } }),
      });
      json = await res.json().catch(() => null);
      const throttled =
        res.status === 429 ||
        (json?.errors ?? []).some((e: any) => e?.extensions?.code === "THROTTLED");
      if (!throttled) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (!json || json.errors) throw new Error("shopify_error");
    const conn = json.data?.orders;
    for (const e of conn?.edges ?? []) {
      const a = e.node.shippingAddress ?? {};
      pool.push({
        orderName: e.node.name,
        legacyId: String(e.node.legacyResourceId ?? ""),
        createdAt: e.node.createdAt,
        shipName: a.name ?? "",
        address: [a.address1, a.city, a.province, a.zip].filter(Boolean).join(", "),
        city: a.city ?? "",
        zip: digits(a.zip ?? ""),
        phone: a.phone ?? "",
      });
    }
    cursor = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
    pages++;
    // Batas 8×100 menjaga satu permintaan tetap cepat. Pool diambil dari yang
    // TERBARU dulu, jadi kalau batas ini tercapai yang terpotong adalah ujung
    // paling lama dari jendela — order yang baru dikirim (kasus normal) selalu
    // ikut. Toko dengan volume sangat tinggi yang memproses label lama sebaiknya
    // memperkecil jendela di bawah, bukan memperbesar pool.
  } while (cursor && pages < MAX_POOL_PAGES);
  return pool;
}

function emptyResult(flag: string, candidateCount = 0): MatchResult {
  return {
    phone: null, name: null, address: null, city: null, zip: null,
    orderName: null, legacyId: null, confidence: "low", reasons: [], flag, candidateCount,
  };
}

function matchAgainstPool(inp: MatchInput, pool: PoolOrder[]): MatchResult {
  const inTokens = nameTokens(inp.name);
  let best: PoolOrder | null = null;
  let bestScore = -Infinity;
  let bestReasons: string[] = [];

  for (const o of pool) {
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
    const dupes = pool.filter((o) => {
      const shared = [...inTokens].filter((t) => nameTokens(o.shipName).has(t)).length;
      return shared >= 1 && !!inp.zip && o.zip === inp.zip;
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

  for (const inp of inputs) out.set(inp.page, matchAgainstPool(inp, pool));
  return out;
}

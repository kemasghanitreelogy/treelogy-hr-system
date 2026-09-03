#!/usr/bin/env node
/**
 * Penarik review marketplace — dijalankan dari LAPTOP, bukan dari server.
 *
 *   node scripts/marketplace-pull.mjs --source=tokopedia
 *   node scripts/marketplace-pull.mjs --source=shopee
 *
 * Kenapa di laptop: Tokopedia mem-blackhole IP datacenter, dan Shopee menjawab
 * 403 (error 90309999) untuk permintaan dari sana. Diuji langsung: panggilan
 * yang sama dari IP rumahan berjalan normal. Ini bukan pembatasan yang bisa
 * disiasati dari server — jadi tidak dicoba.
 *
 * Skrip ini sengaja BODOH soal kebijakan. Ia hanya melakukan HTTP dan
 * menunggu; seluruh keputusan tetap di server:
 *   • boleh menarik atau belum      → dijawab /ingest saat "start"
 *   • review mana yang sudah punya  → dikirim server sebagai daftar `seen`
 *   • dedup, validasi, penyimpanan  → dikerjakan server saat "finish"
 * Menjalankannya dua kali berturut-turut tidak merusak apa pun.
 *
 * ── Sopan santun yang ditegakkan di sini ──
 * Tujuannya bukan "menghindari deteksi", melainkan menjadi tamu yang tidak
 * merepotkan: satu permintaan pada satu waktu, jeda yang diacak agar tidak
 * berpola mesin, berhenti TOTAL begitu ditolak, dan berhenti lebih awal
 * begitu halaman tidak lagi membawa review baru. Beban ke marketplace jauh di
 * bawah satu orang yang membuka-buka halaman produk.
 *
 * Perlu dua env (taruh di .env.local):
 *   TOKOPEDIA_INGEST_URL=https://<domain>/api/marketplace-reviews/ingest
 *   TOKOPEDIA_INGEST_SECRET=<sama persis dengan env di Vercel>
 */

import { readFileSync } from "node:fs";

/* ───────────────────────── env ───────────────────────── */
function loadEnv() {
  const env = { ...process.env };
  // .env.local SELALU dibaca. Berhenti lebih awal ketika dua env ingest
  // kebetulan sudah ada di shell akan membuat SHOPEE_COOKIE tidak pernah
  // terbaca — dan gejalanya cuma "403" yang membingungkan.
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* biarkan pengecekan di bawah yang bicara */ }
  return env;
}
const ENV = loadEnv();
const INGEST_URL = ENV.TOKOPEDIA_INGEST_URL;
const SECRET = ENV.TOKOPEDIA_INGEST_SECRET;
if (!INGEST_URL || !SECRET) {
  console.error("\n  Kurang konfigurasi. Tambahkan TOKOPEDIA_INGEST_URL & TOKOPEDIA_INGEST_SECRET ke .env.local\n");
  process.exit(1);
}

/**
 * Cookie sesi Shopee dari browser Anda sendiri (opsional tapi sangat membantu).
 *
 * Pelajaran dari scraper Shopee yang beredar: yang membuka pintu bukan header
 * yang dirapikan, melainkan SESI BROWSER SUNGGUHAN — mereka memakai Selenium
 * dengan login manual dan CAPTCHA. Menambah browser otomatis (~300 MB) demi
 * satu marketplace itu berat, dan CAPTCHA-nya tetap harus dikerjakan orang.
 * Jadi intinya saja yang diambil: pakai sesi yang SUDAH ada di browser Anda.
 * Anda pemilik tokonya; cookie-nya cukup disalin sekali ke .env.local.
 */
const SHOPEE_COOKIE_ENV = "SHOPEE_COOKIE";

const SOURCE = (process.argv.find((a) => a.startsWith("--source="))?.split("=")[1] ?? "tokopedia").toLowerCase();
/** --discover=<username-toko> → temukan produk toko, lalu daftarkan. */
const DISCOVER = process.argv.find((a) => a.startsWith("--discover="))?.split("=")[1]?.trim() ?? null;
/** --check → periksa sesi Shopee saja, tanpa menarik apa pun. */
const CHECK = process.argv.includes("--check");
if (!["tokopedia", "shopee"].includes(SOURCE)) {
  console.error(`\n  Sumber tidak dikenal: ${SOURCE}. Pilih tokopedia atau shopee.\n`);
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

class Rejected extends Error { constructor(status) { super(`HTTP ${status}`); this.status = status; } }
class Unreachable extends Error {}

/**
 * Jeda acak antar-permintaan.
 *
 * Angkanya diacak, bukan tetap, karena dua alasan yang sama-sama nyata: irama
 * yang persis seragam adalah tanda paling jelas dari robot, DAN jeda tetap
 * membuat lonjakan beban jatuh bersamaan kalau kelak dijalankan dari beberapa
 * mesin. Rentangnya sengaja longgar — menarik review bukan pekerjaan terburu.
 */
const jeda = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

/* ───────────────────── protokol /ingest ───────────────────── */
async function ingest(payload) {
  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ source: SOURCE, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `HTTP ${res.status}`);
    err.payload = data; err.status = res.status;
    throw err;
  }
  return data;
}

/* ════════════════════ ADAPTER: TOKOPEDIA ════════════════════ */
const TOKO_URL = "https://gql.tokopedia.com/graphql/productReviewList";
const TOKO_QUERY = `
query productReviewList($productID: String!, $page: Int!, $limit: Int!, $sortBy: String, $filterBy: String) {
  productrevGetProductReviewList(productID: $productID, page: $page, limit: $limit, sortBy: $sortBy, filterBy: $filterBy) {
    totalReviews hasNext
    list {
      feedbackID message productRating reviewCreateTime variantName isAnonymous
      user { fullName }
      imageAttachments { imageUrl }
      reviewResponse { message }
    }
  }
}`;

const tokopedia = {
  label: "Tokopedia",
  pageLimit: 50,
  maxPages: 12,
  jeda: [2500, 5000],
  /** Tokopedia tidak butuh pemanasan sesi. */
  async priming() {},
  async page(productId, page) {
    let res;
    try {
      res = await fetch(TOKO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.tokopedia.com",
          Referer: "https://www.tokopedia.com/",
          "User-Agent": UA,
        },
        body: JSON.stringify({
          operationName: "productReviewList",
          variables: { productID: productId, page, limit: 50, sortBy: "create_time desc", filterBy: "" },
          query: TOKO_QUERY,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new Unreachable([e?.name, e?.message, e?.cause?.code].filter(Boolean).join(" · "));
    }
    if (!res.ok) throw new Rejected(res.status);
    const data = await res.json().catch(() => null);
    if (data?.errors?.length) throw new Error(`schema: ${data.errors.map((e) => e?.message ?? "?").join("; ")}`);
    const out = data?.data?.productrevGetProductReviewList;
    if (!out) throw new Error("schema: empty_payload");
    return { hasNext: Boolean(out.hasNext), list: out.list ?? [], id: (r) => String(r.feedbackID) };
  },
};

/* ═════════════════════ ADAPTER: SHOPEE ═════════════════════ */
/**
 * ID produk Shopee ditulis "<shopid>_<itemid>" — dua angka, karena satu itemid
 * tidak unik lintas toko.
 *
 * Endpoint publiknya `/api/v2/item/get_ratings`, yang sama dipakai halaman
 * produk di browser. Bedanya: browser sudah memegang cookie sesi, sedangkan
 * permintaan telanjang dijawab 403 (error 90309999). Karena itu ada langkah
 * PEMANASAN di bawah — mengunjungi halaman produknya lebih dulu, persis
 * seperti orang yang membuka halaman itu sebelum menggulir ke bagian ulasan.
 */
const SHOPEE_ORIGIN = "https://shopee.co.id";
// Cookie dari .env.local dipakai sejak awal; kalau kosong, pemanasan sesi
// anonim yang mengisinya (dan itu belum tentu cukup — lihat pesan 403).
let shopeeCookie = (ENV[SHOPEE_COOKIE_ENV] ?? "").trim();

const shopee = {
  label: "Shopee",
  pageLimit: 50,
  maxPages: 12,
  // Lebih lambat dari Tokopedia: Shopee lebih ketat, dan run yang dihentikan
  // di tengah jauh lebih mahal daripada run yang selesai pelan-pelan.
  jeda: [4000, 8000],

  async priming(productId) {
    if (shopeeCookie) return; // sudah punya sesi — tidak perlu mengetuk lagi
    const [shopid, itemid] = String(productId).split("_");
    const halaman = shopid && itemid ? `${SHOPEE_ORIGIN}/product/${shopid}/${itemid}` : SHOPEE_ORIGIN;
    try {
      const res = await fetch(halaman, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(30_000),
      });
      // getSetCookie() ada sejak Node 20; kalau tidak, pakai header gabungan.
      const raw = typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean);
      shopeeCookie = raw.map((c) => String(c).split(";")[0]).filter(Boolean).join("; ");
    } catch {
      // Pemanasan gagal bukan alasan berhenti — endpoint kadang tetap menjawab.
      // Biarkan permintaan sebenarnya yang memberi vonis.
    }
    await jeda(1200, 2500);
  },

  async page(productId, page) {
    const [shopid, itemid] = String(productId).split("_");
    if (!shopid || !itemid) throw new Error(`schema: id_produk_shopee_harus_"<shopid>_<itemid>" (dapat "${productId}")`);
    const offset = (page - 1) * 50;
    const url =
      `${SHOPEE_ORIGIN}/api/v2/item/get_ratings?filter=0&flag=1&type=0` +
      `&itemid=${encodeURIComponent(itemid)}&shopid=${encodeURIComponent(shopid)}&limit=50&offset=${offset}`;
    let res;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
          Referer: `${SHOPEE_ORIGIN}/product/${shopid}/${itemid}`,
          "X-Requested-With": "XMLHttpRequest",
          "X-API-SOURCE": "pc",
          "X-Shopee-Language": "id",
          ...(shopeeCookie ? { Cookie: shopeeCookie } : {}),
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new Unreachable([e?.name, e?.message, e?.cause?.code].filter(Boolean).join(" · "));
    }
    if (!res.ok) throw new Rejected(res.status);
    const data = await res.json().catch(() => null);
    // Shopee membalas 200 dengan `error` bukan-nol saat menolak — status HTTP
    // saja tidak cukup untuk menyimpulkan berhasil.
    if (data?.error) throw new Rejected(data.error === 90309999 ? 403 : 429);
    const list = data?.data?.ratings;
    if (!Array.isArray(list)) throw new Error("schema: empty_payload");
    return { hasNext: list.length >= 50, list, id: (r) => String(r.cmtid) };
  },
};

const ADAPTER = SOURCE === "shopee" ? shopee : tokopedia;

/**
 * Ditolak 403 berarti Shopee tidak mengenali sesinya — bukan berarti datanya
 * tidak ada. Yang dibutuhkan sesi browser sungguhan, dan Anda sudah punya.
 */
/**
 * Cookie Shopee datang dari DUA domain yang berbeda, dan keduanya tidak
 * pernah saling mengirim cookie:
 *
 *   shopee.co.id         → situs belanja. API ulasan publik ada di sini.
 *   seller.shopee.co.id  → Seller Centre. Domain lain, cookie lain.
 *
 * Login di Seller Centre karena itu TIDAK berpengaruh pada API ulasan — dan
 * itu jebakan yang sangat masuk akal untuk dilangkahi. Nama cookienya
 * membedakan keduanya: Seller Centre memakai awalan SPC_SC_*, situs belanja
 * memakai SPC_EC / SPC_ST / SPC_U. Diperiksa supaya diagnosanya tepat, bukan
 * sekadar "403".
 */
function periksaAsalCookie(cookie) {
  if (!cookie) return "kosong";
  const sellerCentre = /\bSPC_SC_/.test(cookie);
  const belanja = /\bSPC_(EC|ST|U)\b/.test(cookie) || /\bSPC_EC=/.test(cookie);
  if (sellerCentre && !belanja) return "seller";
  if (belanja) return "belanja";
  return "tidak dikenali";
}

function petunjukCookieShopee() {
  const asal = periksaAsalCookie(shopeeCookie);
  if (asal === "seller") {
    console.error(
      "\n  Cookie yang dipakai berasal dari SELLER CENTRE (seller.shopee.co.id).\n" +
        "  Cookie bersifat per-domain: yang dari Seller Centre tidak pernah dikirim\n" +
        "  ke shopee.co.id, tempat API ulasan berada. Jadi login Seller Centre\n" +
        "  memang tidak berpengaruh di sini.\n\n" +
        "  Ambil dari situs BELANJA-nya:\n" +
        "    1. Buka https://shopee.co.id  (bukan seller.shopee.co.id)\n" +
        "    2. Pastikan sudah login di sana juga — akunnya boleh sama\n" +
        "    3. F12 → Network → muat ulang → klik permintaan mana pun\n" +
        `    4. Salin baris "cookie:" di Request Headers → .env.local sebagai ${SHOPEE_COOKIE_ENV}\n`,
    );
    return;
  }
  if (shopeeCookie) {
    console.error(
      `\n  Cookie ${SHOPEE_COOKIE_ENV} (${asal}) dipakai, tapi tetap ditolak.\n\n` +
        "  Sebabnya bukan cookie yang salah. Permintaan asli dari browser membawa\n" +
        "  header x-sap-sec dan x-sap-ri — TANDA TANGAN yang dihitung ulang oleh\n" +
        "  JavaScript Shopee (x-sz-sdk-version) untuk SETIAP permintaan, terikat\n" +
        "  pada alamat yang dituju. Tanda tangan itu tidak bisa disalin ulang, dan\n" +
        "  menirunya berarti membongkar sistem anti-bot: rapuh, berubah sewaktu-\n" +
        "  waktu, dan melanggar ketentuan Shopee. Jalan itu tidak ditempuh di sini.\n\n" +
        "  Jalan yang benar — dan Anda berhak atasnya sebagai pemilik toko:\n" +
        "    • Shopee Open Platform (open.shopee.com) → API resmi product.get_comment.\n" +
        "      Daftarkan app, otorisasi toko sendiri, dapatkan partner_id + partner_key.\n" +
        "    • Atau ekspor penilaian dari Seller Centre kalau tersedia sebagai CSV.\n\n" +
        "  Beri tahu jalur mana yang dipilih — penariknya tinggal disambungkan.\n",
    );
    return;
  }
  console.error(
    `\n  Shopee menolak sesi anonim. Pakai sesi browser Anda sendiri — sekali saja:\n\n` +
      "    1. Buka https://shopee.co.id di Chrome — situs BELANJA-nya,\n" +
      "       BUKAN seller.shopee.co.id (domain berbeda, cookie berbeda)\n" +
      "    2. F12 → tab Network → muat ulang halaman → klik permintaan mana pun\n" +
      "    3. Di Request Headers, salin SELURUH baris setelah \"cookie:\"\n" +
      `    4. Tempel ke .env.local:\n\n` +
      `         ${SHOPEE_COOKIE_ENV}=\"<tempel di sini>\"\n\n` +
      "  Cookie itu milik Anda sendiri dan tidak pernah dikirim ke server —\n" +
      "  hanya dipakai skrip ini di laptop Anda.\n",
  );
}

/**
 * Uji sesi tanpa menarik apa pun.
 *
 *   node scripts/marketplace-pull.mjs --source=shopee --check
 *
 * Menguji lewat run penuh itu lambat dan hasilnya bercampur dengan kegagalan
 * lain. Pemeriksaan ini menyentuh dua endpoint saja dan menyebut PERSIS yang
 * mana yang menolak — sehingga jelas apakah masalahnya cookie, IP, atau
 * memang tokonya.
 */
async function periksaSesi() {
  const asal = periksaAsalCookie(shopeeCookie);
  console.log(`\n  Cookie: ${shopeeCookie ? `${asal}, ${shopeeCookie.length} karakter` : "belum diisi (mencoba sesi anonim)"}`);
  if (asal === "seller") {
    console.log("  ⚠ Ini cookie Seller Centre — domainnya berbeda dari API ulasan.");
  }

  const H = {
    "User-Agent": UA, Accept: "application/json",
    Referer: `${SHOPEE_ORIGIN}/`, "X-Requested-With": "XMLHttpRequest", "X-API-SOURCE": "pc",
    ...(shopeeCookie ? { Cookie: shopeeCookie } : {}),
  };

  const nama = DISCOVER || "treelogy.moringa";
  let shopid = null;
  try {
    const r = await fetch(`${SHOPEE_ORIGIN}/api/v4/shop/get_shop_base?username=${encodeURIComponent(nama)}`, { headers: H, signal: AbortSignal.timeout(25_000) });
    const d = await r.json().catch(() => null);
    shopid = d?.data?.shopid ?? null;
    console.log(`  [1/2] info toko          : ${d?.error ? `DITOLAK (error ${d.error})` : `OK — ${d?.data?.name} · shopid ${shopid}`}`);
  } catch (e) {
    console.log(`  [1/2] info toko          : GAGAL — ${e.message}`);
  }

  if (shopid) {
    await jeda(1500, 3000);
    try {
      const url = `${SHOPEE_ORIGIN}/api/v4/search/search_items?by=pop&limit=5&newest=0&order=desc&page_type=shop&scenario=PAGE_OTHERS&version=2&match_id=${shopid}`;
      const r = await fetch(url, { headers: { ...H, Referer: `${SHOPEE_ORIGIN}/${nama}` }, signal: AbortSignal.timeout(25_000) });
      const d = await r.json().catch(() => null);
      const n = (d?.items ?? []).length;
      console.log(`  [2/2] daftar produk      : ${d?.error || !r.ok ? `DITOLAK (HTTP ${r.status}, error ${d?.error ?? "?"})` : `OK — ${n} produk terbaca`}`);
      if (!d?.error && r.ok) {
        console.log("\n  Sesi bekerja. Lanjutkan:\n    node scripts/marketplace-pull.mjs --source=shopee --discover=" + nama + "\n");
        return;
      }
    } catch (e) {
      console.log(`  [2/2] daftar produk      : GAGAL — ${e.message}`);
    }
  }
  petunjukCookieShopee();
}

/* ═══════════════ PENEMUAN PRODUK (Shopee) ═══════════════ */
/**
 * Mengetik ID produk satu per satu adalah pekerjaan yang seharusnya dikerjakan
 * mesin — dan ID yang salah ketik baru ketahuan berjam-jam kemudian.
 *
 * Dijalankan dari laptop karena endpoint daftar produk Shopee menolak IP pusat
 * data (403, error 90309999) sama seperti endpoint ulasannya. Menariknya:
 * `get_shop_base` JUSTRU lolos dari server — tapi menyandarkan fitur ini pada
 * satu endpoint yang kebetulan lebih longgar hanya akan patah diam-diam kelak.
 *
 * Pencocokan ke produk Shopify dikerjakan SERVER, bukan di sini: token Admin
 * Shopify tidak boleh keluar dari server.
 */
async function temukanProdukShopee(username) {
  console.log(`\n  Mencari toko "${username}"…`);
  const base = await fetch(
    `${SHOPEE_ORIGIN}/api/v4/shop/get_shop_base?username=${encodeURIComponent(username)}`,
    { headers: { "User-Agent": UA, Accept: "application/json", Referer: `${SHOPEE_ORIGIN}/${username}` },
      signal: AbortSignal.timeout(30_000) },
  ).then((r) => r.json()).catch(() => null);

  const shopid = base?.data?.shopid;
  if (base?.error || !shopid) throw new Error(`toko tidak ditemukan (error ${base?.error ?? "?"})`);
  console.log(`  ${base.data.name} · shopid ${shopid} · ${base.data.follower_count ?? "?"} pengikut`);

  const produk = [];
  for (let halaman = 0; halaman < 8; halaman++) {
    if (halaman) await jeda(...shopee.jeda);
    const url =
      `${SHOPEE_ORIGIN}/api/v4/search/search_items?by=pop&limit=30&newest=${halaman * 30}` +
      `&order=desc&page_type=shop&scenario=PAGE_OTHERS&version=2&match_id=${shopid}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA, Accept: "application/json",
        Referer: `${SHOPEE_ORIGIN}/${username}`,
        "X-Requested-With": "XMLHttpRequest", "X-API-SOURCE": "pc",
        ...(shopeeCookie ? { Cookie: shopeeCookie } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) throw new Rejected(res.status === 200 ? 403 : res.status);
    const items = data?.items ?? [];
    if (!items.length) break;
    for (const it of items) {
      const b = it?.item_basic ?? it;
      if (b?.itemid && b?.name) produk.push({ productId: `${shopid}_${b.itemid}`, name: String(b.name) });
    }
    if (items.length < 30) break;
  }
  return produk;
}

async function jalankanPenemuan() {
  if (SOURCE !== "shopee") {
    console.error("\n  --discover baru tersedia untuk Shopee.\n");
    process.exit(1);
  }
  // Pemanasan sesi lebih dulu, sama seperti saat menarik ulasan.
  await shopee.priming("");
  let produk;
  try {
    produk = await temukanProdukShopee(DISCOVER);
  } catch (e) {
    console.error(`\n  Gagal: ${e.message}`);
    if (e instanceof Rejected && e.status === 403) petunjukCookieShopee();
    else console.error("");
    process.exit(1);
  }
  if (!produk.length) {
    console.error("\n  Tidak ada produk yang terbaca dari toko itu.\n");
    process.exit(1);
  }
  console.log(`\n  ${produk.length} produk ditemukan. Mencocokkan ke katalog Shopify…`);

  const url = INGEST_URL.replace(/\/ingest\/?$/, "/products/discover");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ source: "shopee", products: produk }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`\n  Server menolak: ${data.error ?? res.status}\n`);
    process.exit(1);
  }

  console.log(`  Katalog Shopify: ${data.katalog} produk aktif\n`);
  for (const h of data.hasil ?? []) {
    const tanda = h.status === "cocok" ? "✓" : h.status === "sudah ada" ? "·" : "!";
    const ket = h.status === "cocok" ? `→ ${h.handle} (${h.skor})` : h.status === "sudah ada" ? "sudah dipetakan" : `tebakan terbaik: ${h.handle || "—"} (${h.skor}) — perlu diperiksa`;
    console.log(`   ${tanda} ${h.name.slice(0, 58).padEnd(58)} ${ket}`);
  }
  console.log(
    `\n  ${data.aktif} produk siap ditarik, ${(data.ditambahkan ?? 0) - (data.aktif ?? 0)} menunggu diperiksa di layar.\n` +
    `  Buka Review Marketplace → peta produk untuk memeriksanya, lalu:\n` +
    `    node scripts/marketplace-pull.mjs --source=shopee\n`,
  );
}

/* ───────────────────────── jalannya ───────────────────────── */
async function main() {
  if (CHECK) {
    if (SOURCE !== "shopee") { console.error("\n  --check baru tersedia untuk Shopee.\n"); process.exit(1); }
    return periksaSesi();
  }
  if (DISCOVER) return jalankanPenemuan();
  console.log(`\n  ${ADAPTER.label} — meminta izin ke server…`);
  let start;
  try {
    start = await ingest({ action: "start" });
  } catch (e) {
    if (e.status === 429) {
      const at = e.payload?.nextPullAt ? new Date(e.payload.nextPullAt).toLocaleString("id-ID") : "?";
      console.error(`\n  Belum waktunya menarik lagi (${e.message}). Bisa dicoba lagi: ${at}\n`);
      process.exit(2);
    }
    console.error(`\n  Server menolak: ${e.message}\n`);
    process.exit(1);
  }

  const { runId, products, seen: seenList } = start;
  const seen = new Set(seenList);
  if (!products.length) {
    console.error(`\n  Belum ada produk ${ADAPTER.label} di peta. Tambahkan dulu lewat layarnya.\n`);
    await ingest({ action: "finish", runId, status: "ok", requests: 0, reviews: [] });
    process.exit(0);
  }
  console.log(`  ${products.length} produk · ${seen.size} review sudah di ledger\n`);

  const reviews = [];
  let requests = 0;
  let pertama = true;
  let ditolakBeruntun = 0;

  try {
    for (const p of products) {
      await ADAPTER.priming(p.productId);
      let page = 1;
      let baruProduk = 0;

      while (page <= ADAPTER.maxPages) {
        if (!pertama) await jeda(...ADAPTER.jeda);
        pertama = false;

        const { hasNext, list, id } = await ADAPTER.page(p.productId, page);
        requests++;
        ditolakBeruntun = 0;

        let baruHalaman = 0;
        for (const r of list) {
          const key = id(r);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          baruHalaman++;
          reviews.push({ ...r, _productId: p.productId, _shopifyHandle: p.shopifyHandle });
        }
        baruProduk += baruHalaman;

        // BERHENTI AWAL. Review diurutkan terbaru dulu, jadi satu halaman penuh
        // yang seluruhnya sudah ada di ledger berarti sisanya pasti sudah ada
        // juga. Melanjutkan hanya menambah beban tanpa menambah data.
        if (list.length && baruHalaman === 0) break;
        if (!hasNext || !list.length) break;
        page++;
      }
      console.log(`  ${p.name ?? p.productId}: +${baruProduk} review baru`);
    }

    console.log(`\n  ${requests} permintaan · ${reviews.length} review baru — mengirim ke server…`);
    const hasil = await ingest({ action: "finish", runId, status: "ok", requests, reviews });
    console.log(`  Tersimpan: ${hasil.stored ?? reviews.length} baris.\n`);
  } catch (e) {
    // Ditolak = BERHENTI hari itu, tanpa mencoba ulang. Mencoba ulang setelah
    // ditolak adalah cara tercepat berubah dari tamu menjadi gangguan — dan
    // yang terlewat akan terambil sendiri di run berikutnya, karena ledger
    // tahu persis mana yang belum punya.
    ditolakBeruntun++;
    const status = e instanceof Unreachable ? "unreachable" : e instanceof Rejected ? "rejected" : "failed";
    const pesan = e instanceof Rejected ? `ditolak ${e.message}` : e.message;
    console.error(`\n  Berhenti: ${pesan}`);
    if (SOURCE === "shopee" && e instanceof Rejected && e.status === 403) petunjukCookieShopee();
    if (reviews.length) console.error(`  ${reviews.length} review yang terlanjur terkumpul tetap dikirim.`);
    try {
      await ingest({ action: "finish", runId, status: reviews.length ? "partial" : status, requests, reviews, error: pesan });
    } catch (e2) {
      console.error(`  Gagal menutup run di server: ${e2.message}`);
    }
    console.error("");
    process.exit(1);
  }
}

main().catch((e) => { console.error(`\n  Galat tak terduga: ${e?.message}\n`); process.exit(1); });

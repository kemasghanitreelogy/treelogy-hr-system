#!/usr/bin/env node
/**
 * Penarik review Tokopedia — dijalankan dari LAPTOP, bukan dari server.
 *
 *   node scripts/tokopedia-pull.mjs
 *
 * Kenapa di laptop: Tokopedia mem-blackhole IP datacenter. Dari Vercel,
 * koneksinya menggantung 30 detik lalu mati tanpa satu byte pun balasan —
 * sementara panggilan ke Shopify dan Jubelio dari server yang sama berjalan
 * normal, dan endpoint yang sama menjawab seketika dari IP rumahan.
 *
 * Skrip ini sengaja BODOH. Ia hanya melakukan HTTP dan menunggu; seluruh
 * kebijakan tetap di server:
 *   • boleh menarik atau belum      → dijawab /ingest saat "start"
 *   • review mana yang sudah punya  → dikirim server sebagai daftar `seen`
 *   • dedup, validasi, penyimpanan  → dikerjakan server saat "finish"
 * Jadi menjalankan skrip ini dua kali berturut-turut tidak merusak apa pun:
 * yang kedua akan ditolak servernya sendiri.
 *
 * Perlu dua env (taruh di .env.local):
 *   TOKOPEDIA_INGEST_URL=https://treelogy-hr-system.vercel.app/api/tokopedia-reviews/ingest
 *   TOKOPEDIA_INGEST_SECRET=<sama persis dengan env di Vercel>
 */

import { readFileSync } from "node:fs";

/* ---- env: dari environment, atau dibaca dari .env.local ---- */
function loadEnv() {
  const env = { ...process.env };
  if (env.TOKOPEDIA_INGEST_URL && env.TOKOPEDIA_INGEST_SECRET) return env;
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* tidak ada .env.local — biarkan pengecekan di bawah yang bicara */
  }
  return env;
}

const ENV = loadEnv();
const INGEST_URL = ENV.TOKOPEDIA_INGEST_URL;
const SECRET = ENV.TOKOPEDIA_INGEST_SECRET;

if (!INGEST_URL || !SECRET) {
  console.error(
    "\n  Kurang konfigurasi. Tambahkan ke .env.local:\n" +
      "    TOKOPEDIA_INGEST_URL=https://<domain-anda>/api/tokopedia-reviews/ingest\n" +
      "    TOKOPEDIA_INGEST_SECRET=<sama persis dengan env di Vercel>\n",
  );
  process.exit(1);
}

const GQL_URL = "https://gql.tokopedia.com/graphql/productReviewList";
const PAGE_LIMIT = 50;
const MAX_PAGES_PER_PRODUCT = 12;

/**
 * ⚠️ Jebakan schema: field `shopName` RUSAK di endpoint ini — memintanya
 * membuat SELURUH query ditolak dengan galat generik "Invalid request schema
 * received". Kalau galat itu muncul lagi, bisect field satu per satu.
 */
const QUERY = `
query productReviewList($productID: String!, $page: Int!, $limit: Int!, $sortBy: String, $filterBy: String) {
  productrevGetProductReviewList(productID: $productID, page: $page, limit: $limit, sortBy: $sortBy, filterBy: $filterBy) {
    totalReviews
    hasNext
    list {
      feedbackID
      message
      productRating
      reviewCreateTime
      variantName
      isAnonymous
      user { fullName }
      reviewResponse { message }
      imageAttachments { imageUrl }
    }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Jeda acak ala manusia, bukan interval mesin yang presisi. */
const politePause = () => sleep(3000 + Math.random() * 4000);

class Rejected extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}
class Unreachable extends Error {}

async function ingest(payload) {
  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `HTTP ${res.status}`);
    err.payload = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function fetchPage(productId, page) {
  let res;
  try {
    res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.tokopedia.com",
        Referer: "https://www.tokopedia.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      body: JSON.stringify({
        operationName: "productReviewList",
        variables: { productID: productId, page, limit: PAGE_LIMIT, sortBy: "create_time desc", filterBy: "" },
        query: QUERY,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new Unreachable([e?.name, e?.message, e?.cause?.code].filter(Boolean).join(" · "));
  }
  if (!res.ok) throw new Rejected(res.status);

  const data = await res.json().catch(() => null);
  if (data?.errors?.length) {
    throw new Error(`schema: ${data.errors.map((e) => e?.message ?? "?").join("; ")}`);
  }
  const out = data?.data?.productrevGetProductReviewList;
  if (!out) throw new Error("schema: empty_payload");
  return { totalReviews: out.totalReviews ?? 0, hasNext: Boolean(out.hasNext), list: out.list ?? [] };
}

async function main() {
  console.log("\n  Meminta izin ke server…");
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
  console.log(`  ${products.length} produk · ${seen.size} review sudah di ledger\n`);

  const reviews = [];
  let requests = 0;
  let firstRequest = true;

  try {
    for (const p of products) {
      let page = 1;
      let fetched = 0;
      let total = 0;

      while (page <= MAX_PAGES_PER_PRODUCT) {
        if (!firstRequest) await politePause();
        firstRequest = false;

        const result = await fetchPage(p.productId, page);
        requests += 1;
        total = result.totalReviews;

        let pageNew = 0;
        for (const r of result.list) {
          reviews.push({ ...r, _productId: p.productId, _shopifyHandle: p.shopifyHandle, _productName: p.name });
          fetched += 1;
          if (!seen.has(r.feedbackID)) pageNew += 1;
        }
        console.log(`  ${p.name}: halaman ${page} (${pageNew} baru) — ${fetched}/${total}`);

        if (!result.hasNext || result.list.length === 0) break;
        // Berhenti-awal: urutannya terbaru-dulu, jadi satu halaman tanpa review
        // baru berarti sisanya sudah pasti dimiliki.
        if (seen.size > 0 && pageNew === 0) break;
        page += 1;
      }
    }
  } catch (e) {
    // Ditolak endpoint = berhenti hari itu, TANPA retry. Yang terlewat otomatis
    // terambil di run berikutnya; memaksa hari ini justru yang mengubah pola
    // ini dari pengunjung jadi bot.
    const rejected = e instanceof Rejected;
    const unreachable = e instanceof Unreachable;
    const kind = rejected ? "rejected" : unreachable ? "unreachable" : "failed";
    const detail = unreachable ? `tidak tersambung — ${e.message}` : e.message;
    await ingest({ action: "fail", runId, kind, detail }).catch(() => {});
    console.error(
      `\n  Berhenti: ${detail}\n` +
        (rejected ? "  Ini batas laju. JANGAN diulang hari ini — coba lagi besok.\n" : "\n"),
    );
    process.exit(1);
  }

  console.log(`\n  Mengirim ${reviews.length} review ke server (${requests} permintaan)…`);
  const done = await ingest({ action: "finish", runId, requests, reviews });

  console.log(
    `\n  Selesai.\n` +
      `    Terlihat        : ${done.seenCount}\n` +
      `    Baru            : ${done.newCount}\n` +
      `      siap import   : ${done.withBody}\n` +
      `      bintang-saja  : ${done.noBody}\n` +
      (done.discarded ? `    Dibuang (rating tidak sah): ${done.discarded}\n` : "") +
      `\n  Buka halaman Review Tokopedia untuk mengunduh CSV-nya.\n` +
      `  Foto review pakai tautan yang mati ±3 jam — import hari ini juga.\n`,
  );
}

main().catch((e) => {
  console.error(`\n  Gagal: ${e?.message ?? e}\n`);
  process.exit(1);
});

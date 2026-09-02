import "server-only";

import { courierTracking } from "./courier-tracking";

/* ============================================================
   Tandai order Shopify sebagai terkirim, lengkap dengan nomor resi.

   Nomor resinya datang dari barcode label yang dipindai di Receipt Sales —
   bukan diketik ulang, bukan hasil tebakan OCR.

   Bentuk pertama fitur ini berjalan SATU PER SATU dengan dua panggilan
   Shopify per order. Untuk 57 label itu ±114 bolak-balik berurutan — anggaran
   waktunya habis di tengah dan sisanya dipulangkan sebagai "out_of_time".
   Pelan-nya bukan karena hati-hati, tapi karena boros bolak-balik. Sekarang:

     1. PENCARIAN DIGABUNG — fulfillment order untuk 20 order sekaligus
        diambil dalam SATU permintaan GraphQL (alias o0..o19). 57 order =
        3 permintaan, bukan 57.
     2. MUTATION BERJALAN 3 SEKALIGUS — cukup paralel untuk cepat, cukup
        sempit untuk tidak menabrak kuota; dan tiap order tetap membawa
        hasilnya sendiri-sendiri ke layar.
     3. SADAR-KUOTA — Shopify menjawab THROTTLED saat kuota kalkulasi habis.
        Itu keadaan sementara, bukan kegagalan: tunggu sebentar, ulangi
        permintaan yang sama. Kuota Shopify tidak bisa "dihilangkan" oleh
        siapa pun — yang bisa dilakukan adalah menari mengikutinya.

   Order yang SUDAH terkirim dijawab sebagai sukses (`already: true`), bukan
   kegagalan: tujuan akhirnya sudah tercapai, dan itulah yang membuat menekan
   tombolnya dua kali aman — sinkron yang bersih berarti idempoten.
   ============================================================ */

const API_VERSION = "2026-07";
/** Berapa order per permintaan pencarian gabungan. */
const LOOKUP_BATCH = 20;
/** Berapa mutation berjalan bersamaan. */
const MUTATE_CONCURRENCY = 3;

const FULFILL_MUTATION = `mutation FulfillWithTracking($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status }
    userErrors { field message }
  }
}`;

export interface FulfillInput {
  page: number;
  legacyId: string;
  awb: string;
  courier: string | null;
}

export type FulfillOutcome =
  | { page: number; ok: true; orderName: string | null; company: string; url: string; already?: boolean }
  | { page: number; ok: false; reason: string; detail?: string };

/**
 * Satu panggilan GraphQL, dengan tarian kuota di dalamnya: THROTTLED bukan
 * kegagalan melainkan "tunggu dulu" — diulang sampai tiga kali dengan jeda
 * membesar sebelum benar-benar menyerah.
 */
async function shopifyGql(query: string, variables?: unknown): Promise<any> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY;
  let json: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token as string, "Content-Type": "application/json" },
      body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
      signal: AbortSignal.timeout(25_000),
    });
    json = await res.json().catch(() => null);
    const throttled =
      res.status === 429 ||
      (json?.errors ?? []).some((e: any) => e?.extensions?.code === "THROTTLED");
    if (!throttled) break;
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  if (!json || json.errors) {
    const ditolak = (json?.errors ?? []).some(
      (e: any) => e?.extensions?.code === "ACCESS_DENIED" || /access denied/i.test(e?.message ?? ""),
    );
    throw new Error(ditolak ? "shopify_forbidden" : "shopify_error");
  }
  return json.data;
}

interface OrderTarget {
  orderName: string | null;
  status: string | null;
  fulfillmentOrderIds: string[];
}

/**
 * Ambil fulfillment order untuk BANYAK order dalam satu permintaan.
 *
 * `legacyId` sudah lolos pemeriksaan bentuk (angka murni) sebelum sampai ke
 * sini, jadi menyisipkannya ke teks query aman — dan alias `o<index>` membuat
 * jawabannya bisa dipetakan kembali ke halamannya masing-masing.
 */
async function lookupOrders(items: FulfillInput[]): Promise<Map<number, OrderTarget | null>> {
  const out = new Map<number, OrderTarget | null>();
  for (let i = 0; i < items.length; i += LOOKUP_BATCH) {
    const batch = items.slice(i, i + LOOKUP_BATCH);
    const body = batch
      .map(
        (it, j) => `o${j}: order(id: "gid://shopify/Order/${it.legacyId.trim()}") {
          name
          displayFulfillmentStatus
          fulfillmentOrders(first: 10, query: "status:open OR status:in_progress") {
            edges { node { id } }
          }
        }`,
      )
      .join("\n");
    const data = await shopifyGql(`query BatchTargets {\n${body}\n}`);
    batch.forEach((it, j) => {
      const node = data?.[`o${j}`];
      out.set(
        it.page,
        node
          ? {
              orderName: node.name ?? null,
              status: node.displayFulfillmentStatus ?? null,
              fulfillmentOrderIds: (node.fulfillmentOrders?.edges ?? []).map((e: any) => e.node.id),
            }
          : null,
      );
    });
  }
  return out;
}

/** Pemeriksaan bentuk — di server, karena layar bisa dilewati. */
function validate(item: FulfillInput): { awb: string; legacyId: string } | { reason: string } {
  const awb = (item.awb ?? "").trim();
  const legacyId = (item.legacyId ?? "").trim();
  if (!awb) return { reason: "missing_awb" };
  if (!/^[A-Za-z0-9-]{6,40}$/.test(awb)) return { reason: "invalid_awb" };
  if (!legacyId || !/^\d{1,25}$/.test(legacyId)) return { reason: "missing_order" };
  return { awb, legacyId };
}

/** Jalankan `fn` untuk tiap item, paling banyak `limit` bersamaan. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fulfillMany(
  items: FulfillInput[],
  notifyCustomer: boolean,
  budgetMs = 240_000,
): Promise<FulfillOutcome[]> {
  const mulai = Date.now();
  const out: FulfillOutcome[] = [];

  // Kembaran ditolak di server juga, bukan hanya di layar. AWB kembar berarti
  // satu pembeli akan melacak paket milik orang lain; order kembar berarti
  // pencocokannya meleset di salah satunya.
  const hitung = (f: (x: FulfillInput) => string) => {
    const n = new Map<string, number>();
    for (const x of items) n.set(f(x), (n.get(f(x)) ?? 0) + 1);
    return n;
  };
  const perAwb = hitung((x) => (x.awb ?? "").trim().toUpperCase());
  const perOrder = hitung((x) => (x.legacyId ?? "").trim());

  const siap: (FulfillInput & { awbBersih: string })[] = [];
  for (const item of items) {
    const kurir = courierTracking(item.courier);
    if (!kurir) { out.push({ page: item.page, ok: false, reason: "unknown_courier" }); continue; }
    const v = validate(item);
    if ("reason" in v) { out.push({ page: item.page, ok: false, reason: v.reason }); continue; }
    if ((perAwb.get(v.awb.toUpperCase()) ?? 0) > 1) { out.push({ page: item.page, ok: false, reason: "duplicate_awb" }); continue; }
    if ((perOrder.get(v.legacyId) ?? 0) > 1) { out.push({ page: item.page, ok: false, reason: "duplicate_order" }); continue; }
    siap.push({ ...item, legacyId: v.legacyId, awbBersih: v.awb });
  }
  if (!siap.length) return out;

  // Tahap 1 — satu permintaan gabungan per 20 order.
  let targets: Map<number, OrderTarget | null>;
  try {
    targets = await lookupOrders(siap);
  } catch (e) {
    const reason = e instanceof Error && e.message === "shopify_forbidden" ? "shopify_forbidden" : "shopify_error";
    for (const it of siap) out.push({ page: it.page, ok: false, reason });
    return out;
  }

  // Tahap 2 — mutation, tiga sekaligus.
  const hasil = await pool(siap, MUTATE_CONCURRENCY, async (item): Promise<FulfillOutcome> => {
    const target = targets.get(item.page);
    if (!target) return { page: item.page, ok: false, reason: "order_not_found" };

    const kurir = courierTracking(item.courier)!;
    const url = kurir.trackUrl(item.awbBersih);

    if (!target.fulfillmentOrderIds.length) {
      // Tidak ada yang tersisa untuk dikirim — hampir selalu berarti sudah
      // pernah di-fulfill. Itu SUKSES menurut tujuan akhirnya, bukan galat:
      // memperlakukannya sebagai galat membuat tombolnya tidak pernah aman
      // ditekan dua kali, dan sinkron yang tidak berani diulang bukan sinkron
      // yang bersih.
      if (target.status === "FULFILLED") {
        return { page: item.page, ok: true, orderName: target.orderName, company: kurir.company, url, already: true };
      }
      return { page: item.page, ok: false, reason: "nothing_to_fulfill", detail: target.orderName ?? undefined };
    }

    // Anggaran waktu: lebih baik melaporkan sisa daripada dipotong platform
    // di tengah — sebagian pesanan berubah tanpa satu pun laporan.
    if (Date.now() - mulai > budgetMs) return { page: item.page, ok: false, reason: "out_of_time" };

    try {
      const payload = await shopifyGql(FULFILL_MUTATION, {
        fulfillment: {
          notifyCustomer,
          trackingInfo: { company: kurir.company, number: item.awbBersih, url },
          lineItemsByFulfillmentOrder: target.fulfillmentOrderIds.map((id) => ({ fulfillmentOrderId: id })),
        },
      });
      const errs = payload?.fulfillmentCreate?.userErrors ?? [];
      if (errs.length) {
        return { page: item.page, ok: false, reason: "shopify_rejected", detail: errs.map((e: any) => e.message).join("; ").slice(0, 200) };
      }
      if (!payload?.fulfillmentCreate?.fulfillment?.id) {
        return { page: item.page, ok: false, reason: "shopify_rejected" };
      }
      return { page: item.page, ok: true, orderName: target.orderName, company: kurir.company, url };
    } catch (e) {
      const reason = e instanceof Error && e.message === "shopify_forbidden" ? "shopify_forbidden" : "shopify_error";
      return { page: item.page, ok: false, reason };
    }
  });

  return [...out, ...hasil];
}

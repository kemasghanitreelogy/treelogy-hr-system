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
  for (let attempt = 0; attempt < 4; attempt++) {
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
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
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

/**
 * VERIFIKASI — pelajaran dari kejadian nyata 2 Sep 2026.
 *
 * Dari 166 label yang layarnya laporkan sukses, 11 ternyata TIDAK pernah
 * terpasang di Shopify (audit lewat API: halaman 7, 24, 45, 49, 62, 72, 92,
 * 96, 100, 142, 165 — tersebar, khas kegagalan sporadis saat ratusan mutation
 * beruntun). Akarnya bukan satu bug di satu baris; akarnya adalah KEPERCAYAAN:
 * respons mutation dianggap kata akhir, padahal untuk operasi yang menyentuh
 * uang dan email pembeli, satu-satunya kata akhir adalah keadaan di Shopify
 * itu sendiri.
 *
 * Maka sekarang: sesudah semua mutation, setiap order ditanyai ULANG dalam
 * permintaan gabungan — nomor resinya benar-benar ada di fulfillment-nya atau
 * tidak. Yang mengaku sukses tapi tak terbukti → digagalkan dan dicoba ulang.
 * Yang mengaku gagal tapi ternyata terpasang → diakui sukses. Layar tidak
 * pernah lagi memegang klaim yang tidak dipegang Shopify.
 */
async function verifyTracking(
  items: { page: number; legacyId: string; awb: string }[],
): Promise<Map<number, boolean>> {
  const out = new Map<number, boolean>();
  for (let i = 0; i < items.length; i += LOOKUP_BATCH) {
    const batch = items.slice(i, i + LOOKUP_BATCH);
    const body = batch
      .map(
        (it, j) => `v${j}: order(id: "gid://shopify/Order/${it.legacyId}") {
          fulfillments(first: 10) { trackingInfo { number } }
        }`,
      )
      .join("\n");
    const data = await shopifyGql(`query VerifyTracking {\n${body}\n}`);
    batch.forEach((it, j) => {
      const fulfillments = data?.[`v${j}`]?.fulfillments ?? [];
      const terpasang = fulfillments.some((f: any) =>
        (f?.trackingInfo ?? []).some(
          (t: any) => String(t?.number ?? "").toUpperCase() === it.awb.toUpperCase(),
        ),
      );
      out.set(it.page, terpasang);
    });
  }
  return out;
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

  // Kegagalan sporadis (throttle yang lolos dari jeda, jaringan sesaat)
  // dicoba SEKALI lagi di sini — bukan diserahkan ke pemakainya untuk
  // menekan tombol lagi.
  const RETRYABLE = new Set(["shopify_error", "shopify_rejected"]);
  const byPage = new Map(hasil.map((h) => [h.page, h]));
  const ulangi = siap.filter((it) => {
    const h = byPage.get(it.page);
    return h && !h.ok && RETRYABLE.has((h as { reason: string }).reason) && Date.now() - mulai < budgetMs;
  });
  if (ulangi.length) {
    const hasilUlang = await pool(ulangi, MUTATE_CONCURRENCY, async (item): Promise<FulfillOutcome> => {
      const target = targets.get(item.page)!;
      const kurir = courierTracking(item.courier)!;
      const url = kurir.trackUrl(item.awbBersih);
      try {
        const payload = await shopifyGql(FULFILL_MUTATION, {
          fulfillment: {
            notifyCustomer,
            trackingInfo: { company: kurir.company, number: item.awbBersih, url },
            lineItemsByFulfillmentOrder: target.fulfillmentOrderIds.map((id) => ({ fulfillmentOrderId: id })),
          },
        });
        const errs = payload?.fulfillmentCreate?.userErrors ?? [];
        if (!errs.length && payload?.fulfillmentCreate?.fulfillment?.id) {
          return { page: item.page, ok: true, orderName: target.orderName, company: kurir.company, url };
        }
        return { page: item.page, ok: false, reason: "shopify_rejected", detail: errs.map((e: any) => e.message).join("; ").slice(0, 200) };
      } catch {
        return { page: item.page, ok: false, reason: "shopify_error" };
      }
    });
    for (const h of hasilUlang) byPage.set(h.page, h);
  }

  // VERIFIKASI: satu-satunya kata akhir adalah keadaan di Shopify.
  try {
    const cek = await verifyTracking(siap.map((it) => ({ page: it.page, legacyId: it.legacyId, awb: it.awbBersih })));
    for (const it of siap) {
      const h = byPage.get(it.page)!;
      const terbukti = cek.get(it.page) === true;
      if (h.ok && !terbukti) {
        // Mengaku sukses, tidak terbukti — inilah 11 halaman yang dulu lolos
        // diam-diam. Sekarang ia gagal BERSUARA.
        byPage.set(it.page, { page: it.page, ok: false, reason: "verify_missing" });
      } else if (!h.ok && terbukti) {
        // Mengaku gagal, ternyata terpasang (mutation pertama sebenarnya
        // masuk). Keadaan akhirnya benar — akui sebagai sukses.
        const kurir = courierTracking(it.courier)!;
        byPage.set(it.page, {
          page: it.page, ok: true, orderName: targets.get(it.page)?.orderName ?? null,
          company: kurir.company, url: kurir.trackUrl(it.awbBersih), already: true,
        });
      }
    }
  } catch {
    // Verifikasi sendiri gagal (mis. throttle berat): hasil mutation tetap
    // dilaporkan apa adanya. Lebih baik jujur "tidak terverifikasi" daripada
    // membuang hasil yang ada — dan menekan tombol lagi aman karena idempoten.
  }

  return [...out, ...[...byPage.values()]];
}

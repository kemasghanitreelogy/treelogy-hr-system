import "server-only";

import { courierTracking } from "./courier-tracking";

/* ============================================================
   Tandai order Shopify sebagai terkirim, lengkap dengan nomor resi.

   Nomor resinya datang dari barcode label yang dipindai di Receipt Sales —
   bukan diketik ulang, bukan hasil tebakan OCR. Itu sebabnya menuliskannya ke
   Shopify aman: yang dikirim persis yang tercetak di paket.

   Dua langkah, keduanya sudah divalidasi ke schema Admin API 2026-07:
     1. `order.fulfillmentOrders` — Shopify tidak menerima "fulfill order ini"
        begitu saja; yang di-fulfill adalah fulfillment order di dalamnya.
     2. `fulfillmentCreate` — dengan trackingInfo { company, number, url }.
   ============================================================ */

const API_VERSION = "2026-07";

const TARGETS_QUERY = `query FulfillmentTargets($id: ID!) {
  order(id: $id) {
    name
    displayFulfillmentStatus
    fulfillmentOrders(first: 10, query: "status:open OR status:in_progress") {
      edges { node { id status } }
    }
  }
}`;

const FULFILL_MUTATION = `mutation FulfillWithTracking($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status trackingInfo { company number url } }
    userErrors { field message }
  }
}`;

export interface FulfillInput {
  /** Nomor halaman — kunci balasan ke kartu di layar. */
  page: number;
  /** ID numerik order Shopify (dari pencocokan). */
  legacyId: string;
  /** Nomor resi hasil pindai barcode. */
  awb: string;
  /** Nama kurir hasil pembacaan label. */
  courier: string | null;
}

export type FulfillOutcome =
  | { page: number; ok: true; orderName: string | null; company: string; url: string }
  | { page: number; ok: false; reason: string; detail?: string };

async function shopifyGql(query: string, variables: unknown): Promise<any> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY;
  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token as string, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => null);
  if (!json || json.errors) {
    const ditolak = (json?.errors ?? []).some(
      (e: any) => e?.extensions?.code === "ACCESS_DENIED" || /access denied/i.test(e?.message ?? ""),
    );
    throw new Error(ditolak ? "shopify_forbidden" : "shopify_error");
  }
  return json.data;
}

/**
 * Fulfill satu order. Setiap kegagalan dikembalikan sebagai HASIL, bukan
 * dilempar — supaya satu order bermasalah tidak menggagalkan sisanya, dan
 * setiap kartu di layar bisa menyebut sebabnya sendiri.
 */
async function fulfillOne(item: FulfillInput, notifyCustomer: boolean): Promise<FulfillOutcome> {
  const kurir = courierTracking(item.courier);
  if (!kurir) return { page: item.page, ok: false, reason: "unknown_courier" };

  // Bentuknya diperiksa ULANG di sini, bukan hanya di layar. Layar bisa keliru,
  // bisa usang, dan bisa dilewati sama sekali oleh siapa pun yang memanggil
  // endpoint ini langsung — sementara yang ditulis adalah pesanan sungguhan.
  const awb = (item.awb ?? "").trim();
  const legacyId = (item.legacyId ?? "").trim();
  if (!awb) return { page: item.page, ok: false, reason: "missing_awb" };
  // Nomor resi kurir: huruf/angka/strip, panjang wajar. Menolak spasi dan
  // simbol menutup kiriman yang jelas bukan nomor resi.
  if (!/^[A-Za-z0-9-]{6,40}$/.test(awb)) return { page: item.page, ok: false, reason: "invalid_awb" };
  if (!legacyId) return { page: item.page, ok: false, reason: "missing_order" };
  // ID order Shopify selalu angka. Apa pun selain itu akan membentuk GID palsu.
  if (!/^\d{1,25}$/.test(legacyId)) return { page: item.page, ok: false, reason: "missing_order" };

  const orderGid = `gid://shopify/Order/${legacyId}`;
  const data = await shopifyGql(TARGETS_QUERY, { id: orderGid });
  const order = data?.order;
  if (!order) return { page: item.page, ok: false, reason: "order_not_found" };

  const ids: string[] = (order.fulfillmentOrders?.edges ?? []).map((e: any) => e.node.id);
  if (!ids.length) {
    // Tidak ada yang tersisa untuk dikirim — hampir selalu berarti ordernya
    // sudah pernah di-fulfill. Itu keadaan yang wajar, bukan kegagalan.
    return {
      page: item.page,
      ok: false,
      reason: order.displayFulfillmentStatus === "FULFILLED" ? "already_fulfilled" : "nothing_to_fulfill",
      detail: order.name,
    };
  }

  const url = kurir.trackUrl(awb);
  const payload = await shopifyGql(FULFILL_MUTATION, {
    fulfillment: {
      notifyCustomer,
      trackingInfo: { company: kurir.company, number: awb, url },
      lineItemsByFulfillmentOrder: ids.map((id) => ({ fulfillmentOrderId: id })),
    },
  });

  const errs = payload?.fulfillmentCreate?.userErrors ?? [];
  if (errs.length) {
    return { page: item.page, ok: false, reason: "shopify_rejected", detail: errs.map((e: any) => e.message).join("; ").slice(0, 200) };
  }
  if (!payload?.fulfillmentCreate?.fulfillment?.id) {
    return { page: item.page, ok: false, reason: "shopify_rejected" };
  }
  return { page: item.page, ok: true, orderName: order.name ?? null, company: kurir.company, url };
}

/**
 * Fulfill beberapa order, SATU PER SATU.
 *
 * Sengaja berurutan, bukan paralel: ini menulis ke pesanan sungguhan dan
 * memicu email ke pembeli. Kuota Shopify yang habis di tengah sekumpulan
 * permintaan paralel meninggalkan keadaan yang sulit dijelaskan — sebagian
 * terkirim, sebagian tidak, tanpa urutan yang bisa ditelusuri.
 */
export async function fulfillMany(
  items: FulfillInput[],
  notifyCustomer: boolean,
  budgetMs = 90_000,
): Promise<FulfillOutcome[]> {
  const out: FulfillOutcome[] = [];
  const mulai = Date.now();

  // Kembaran ditolak di server juga, bukan hanya di layar — sama alasannya
  // dengan validasi bentuk di atas. AWB kembar berarti satu pembeli akan
  // melacak paket milik orang lain; order kembar berarti pencocokannya meleset.
  const hitung = (f: (x: FulfillInput) => string) => {
    const n = new Map<string, number>();
    for (const x of items) n.set(f(x), (n.get(f(x)) ?? 0) + 1);
    return n;
  };
  const perAwb = hitung((x) => (x.awb ?? "").trim().toUpperCase());
  const perOrder = hitung((x) => (x.legacyId ?? "").trim());

  for (const item of items) {
    if ((perAwb.get((item.awb ?? "").trim().toUpperCase()) ?? 0) > 1) {
      out.push({ page: item.page, ok: false, reason: "duplicate_awb" });
      continue;
    }
    if ((perOrder.get((item.legacyId ?? "").trim()) ?? 0) > 1) {
      out.push({ page: item.page, ok: false, reason: "duplicate_order" });
      continue;
    }
    // Anggaran waktu: lebih baik berhenti dan MELAPORKAN sisanya daripada
    // dipotong platform di tengah penulisan — sebagian pesanan sudah berubah
    // dan sudah mengirim email, tanpa satu pun laporan kembali ke layar.
    if (Date.now() - mulai > budgetMs) {
      out.push({ page: item.page, ok: false, reason: "out_of_time" });
      continue;
    }
    try {
      out.push(await fulfillOne(item, notifyCustomer));
    } catch (e) {
      const reason = e instanceof Error && e.message === "shopify_forbidden" ? "shopify_forbidden" : "shopify_error";
      out.push({ page: item.page, ok: false, reason });
      // Izin yang kurang tidak akan membaik pada order berikutnya — berhenti
      // daripada mengulang kegagalan yang sama belasan kali.
      if (reason === "shopify_forbidden") {
        for (const sisa of items.slice(items.indexOf(item) + 1)) {
          out.push({ page: sisa.page, ok: false, reason: "shopify_forbidden" });
        }
        break;
      }
    }
  }
  return out;
}

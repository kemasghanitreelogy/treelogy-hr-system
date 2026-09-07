import "server-only";

import type { MetafieldState } from "./types";

/**
 * Membaca metafield `$app:combined-discount-state` — apa yang BENAR-BENAR
 * dilihat Function saat checkout.
 *
 * Token yang dipakai adalah token offline milik app Combined Discount sendiri
 * (`ADMIN_API_KEY_COMBINED_DISCOUNT`), bukan token toko: metafield ini
 * app-owned dengan akses MERCHANT_READ, jadi hanya token app pemiliknya yang
 * bisa membacanya lewat API — dan bagi token itu namespace `$app` otomatis
 * menunjuk ke `app--<id>` yang benar.
 *
 * SENGAJA hanya membaca. Menulis metafield dari sini tanpa menulis row
 * `CustomerPurchaseFact` di database app akan tertimpa oleh webhook order
 * pertama — jalur tulis tetap lewat endpoint backend app (`seed.ts`).
 */

const API_VERSION = "2026-07";

export function cdTokenConfigured(): boolean {
  return Boolean(process.env.STORE_NAME && process.env.ADMIN_API_KEY_COMBINED_DISCOUNT);
}

const READ = `query EligibleCustomerState($id: ID!, $namespace: String!, $key: String!) {
  customer(id: $id) {
    id
    metafield(namespace: $namespace, key: $key) { jsonValue compareDigest updatedAt }
  }
}`;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** null = tidak bisa dibaca (token kosong / galat) — BUKAN "metafield kosong". */
export async function readCustomerStateMetafield(customerGid: string): Promise<MetafieldState | null> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY_COMBINED_DISCOUNT;
  if (!store || !token || !customerGid) return null;

  let json: any = null;
  try {
    const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: READ,
        variables: { id: customerGid, namespace: "$app", key: "combined-discount-state" },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    json = await res.json().catch(() => null);
  } catch {
    return null;
  }
  if (!json || json.errors || !json.data?.customer) return null;

  const mf = json.data.customer.metafield;
  if (!mf) return { exists: false, firstPurchaseAt: null, campaigns: [], updatedAt: null };

  const v = mf.jsonValue ?? {};
  const campaigns = Array.isArray(v.campaigns)
    ? v.campaigns
        .filter((c: any) => c && typeof c.key === "string")
        .map((c: any) => ({
          key: String(c.key),
          qualifiedAt: typeof c.qualifiedAt === "string" ? c.qualifiedAt : null,
          uses: Number.isFinite(Number(c.uses)) ? Number(c.uses) : 0,
        }))
    : [];
  return {
    exists: true,
    firstPurchaseAt: typeof v.firstPurchaseAt === "string" ? v.firstPurchaseAt : null,
    campaigns,
    updatedAt: typeof mf.updatedAt === "string" ? mf.updatedAt : null,
  };
}

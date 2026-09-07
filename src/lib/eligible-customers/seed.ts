import "server-only";

import type { SeededCampaign } from "./types";

/**
 * Seeding eligibility lewat backend app Combined Discount.
 *
 * Kontrak (ADMIN_ELIGIBLE_CUSTOMER_FLOW.md §3.2):
 *   POST {COMBINED_DISCOUNT_API_URL}/api/admin/customers
 *   X-Admin-Secret: {COMBINED_DISCOUNT_ADMIN_SECRET}
 *   { email, firstName, lastName, tags, campaignKeys, seedDate }
 *   → 200 { customerId, created, seeded: { firstPurchaseAt, campaigns[] } }
 *
 * Kenapa bukan langsung ke Shopify: metafield `$app:combined-discount-state`
 * app-owned + MERCHANT_READ, jadi token app lain ditolak. Dan backend itu juga
 * menulis row `CustomerPurchaseFact` — tanpa row itu webhook orders/create akan
 * menimpa firstPurchaseAt setelah order pertama dan eligibility-nya hilang.
 */

export function seedConfigured(): boolean {
  return Boolean(process.env.COMBINED_DISCOUNT_API_URL && process.env.COMBINED_DISCOUNT_ADMIN_SECRET);
}

export interface SeedRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  tags: string[];
  campaignKeys?: string[] | null;
  seedDate?: string | null;
}

export type SeedOutcome =
  | {
      ok: true;
      customerId: string | null;
      created: boolean;
      firstPurchaseAt: string | null;
      campaigns: SeededCampaign[];
    }
  | { ok: false; code: string; detail?: string };

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function seedEligibility(req: SeedRequest): Promise<SeedOutcome> {
  const base = process.env.COMBINED_DISCOUNT_API_URL?.replace(/\/+$/, "");
  const secret = process.env.COMBINED_DISCOUNT_ADMIN_SECRET;
  if (!base || !secret) return { ok: false, code: "seed_not_configured" };

  let res: Response;
  try {
    res = await fetch(`${base}/api/admin/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
      body: JSON.stringify({
        email: req.email,
        firstName: req.firstName || null,
        lastName: req.lastName || null,
        tags: req.tags,
        campaignKeys: req.campaignKeys?.length ? req.campaignKeys : null,
        seedDate: req.seedDate || null,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return { ok: false, code: "seed_unreachable" };
  }

  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      typeof json?.error === "string"
        ? json.error
        : Array.isArray(json?.userErrors)
          ? json.userErrors.map((e: any) => e?.message).filter(Boolean).join("; ")
          : typeof json?.message === "string"
            ? json.message
            : undefined;
    // Tabel §3.2: 401 secret, 422 userErrors Shopify, 409 tak ada campaign,
    // 500 tulis gagal (ulangi, idempoten). Dibedakan supaya layar menyuruh
    // tindakan yang benar, bukan "gagal" saja.
    const code =
      res.status === 401 ? "seed_unauthorized"
      : res.status === 422 ? "seed_user_error"
      : res.status === 409 ? "seed_no_campaign"
      : "seed_failed";
    return { ok: false, code, detail: detail || `HTTP ${res.status}` };
  }

  const seeded = json?.seeded ?? {};
  const campaigns: SeededCampaign[] = Array.isArray(seeded.campaigns)
    ? seeded.campaigns
        .filter((c: any) => c && typeof c.key === "string")
        .map((c: any) => ({ key: String(c.key), qualifiedAt: String(c.qualifiedAt ?? "") }))
    : [];
  return {
    ok: true,
    customerId: typeof json?.customerId === "string" ? json.customerId : null,
    created: json?.created === true,
    firstPurchaseAt: typeof seeded.firstPurchaseAt === "string" ? seeded.firstPurchaseAt : null,
    campaigns,
  };
}

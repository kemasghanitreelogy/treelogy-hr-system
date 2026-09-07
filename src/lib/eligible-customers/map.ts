import type { EligibleCustomer, MetafieldState, SeedStatus, SeededCampaign } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapMetafield(v: any): MetafieldState | null {
  if (!v || typeof v !== "object") return null;
  return {
    exists: v.exists === true,
    firstPurchaseAt: typeof v.firstPurchaseAt === "string" ? v.firstPurchaseAt : null,
    campaigns: Array.isArray(v.campaigns)
      ? v.campaigns.filter((c: any) => c && typeof c.key === "string").map((c: any) => ({
          key: String(c.key),
          qualifiedAt: typeof c.qualifiedAt === "string" ? c.qualifiedAt : null,
          uses: Number.isFinite(Number(c.uses)) ? Number(c.uses) : 0,
        }))
      : [],
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : null,
  };
}

/** Baris tabel `eligible_customers` → bentuk layar. */
export function mapEligibleRow(r: any): EligibleCustomer {
  const campaigns: SeededCampaign[] = Array.isArray(r.seed_campaigns)
    ? r.seed_campaigns
        .filter((c: any) => c && typeof c.key === "string")
        .map((c: any) => ({ key: String(c.key), qualifiedAt: String(c.qualifiedAt ?? "") }))
    : [];
  return {
    email: String(r.email),
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    shopifyCustomerId: r.shopify_customer_id ?? null,
    createdInShopify: typeof r.created_in_shopify === "boolean" ? r.created_in_shopify : null,
    seedStatus: (r.seed_status ?? "pending") as SeedStatus,
    seedFirstPurchaseAt: r.seed_first_purchase_at ?? null,
    seedCampaigns: campaigns,
    seedError: r.seed_error ?? null,
    seedErrorDetail: r.seed_error_detail ?? null,
    seedDate: r.seed_date ?? null,
    source: r.source === "import" ? "import" : "manual",
    metafield: mapMetafield(r.metafield_state),
    verifiedAt: r.verified_at ?? null,
    grantedByName: r.granted_by_name ?? null,
    grantedAt: r.granted_at,
    lastAttemptAt: r.last_attempt_at ?? r.granted_at,
  };
}

/** ID numerik dari GID — untuk tautan ke halaman customer di admin Shopify. */
export function numericCustomerId(gid: string | null): string | null {
  if (!gid) return null;
  const m = /\/Customer\/(\d+)/.exec(gid);
  return m ? m[1] : null;
}

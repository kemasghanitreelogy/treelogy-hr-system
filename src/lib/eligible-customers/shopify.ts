import "server-only";

/**
 * Customer Shopify lewat token Admin API di env (STORE_NAME + ADMIN_API_KEY).
 *
 * Token ini HANYA dipakai untuk membuat / menemukan / menandai customer-nya.
 * Metafield `$app:combined-discount-state` milik app Combined Discount dan
 * tidak bisa ditulis token app lain (MERCHANT_READ) — itu urusan `seed.ts`.
 *
 * Ketiga operasi di bawah divalidasi ke schema Admin API 2026-07 (scope:
 * read_customers + write_customers; token toko sudah memilikinya).
 */

const API_VERSION = "2026-07";

/** Penanda customer buatan admin — dasar filter, segment, dan aksi grant ulang. */
export const ADMIN_CREATED_TAG = "admin-created";

export function shopifyConfigured(): boolean {
  return Boolean(process.env.STORE_NAME && process.env.ADMIN_API_KEY);
}

export function storeHandle(): string | null {
  const s = process.env.STORE_NAME;
  return s ? s.split(".")[0] : null;
}

export class ShopifyError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

/**
 * Pencarian LANGSUNG, bukan lewat indeks pencarian. `customers(query:"email:…")`
 * membaca indeks yang tertinggal beberapa detik dari customer yang baru dibuat
 * — dan modul ini justru sering memanggil lookup sesaat setelah membuat.
 * `customerByIdentifier` membaca penyimpanan utama, konsisten seketika.
 */
const BY_EMAIL = `query CustomerByEmail($identifier: CustomerIdentifierInput!) {
  customerByIdentifier(identifier: $identifier) { id tags defaultEmailAddress { emailAddress } }
}`;

const FIND = `query FindCustomerByEmail($q: String!) {
  customers(first: 5, query: $q) {
    nodes { id tags defaultEmailAddress { emailAddress } }
  }
}`;

const CREATE = `mutation CreateEligibleCustomer($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { id tags defaultEmailAddress { emailAddress } }
    userErrors { field message }
  }
}`;

const TAG = `mutation TagEligibleCustomer($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node { id }
    userErrors { field message }
  }
}`;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables: Record<string, unknown>): Promise<any> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY;
  if (!store || !token) throw new ShopifyError("shopify_not_configured");

  let json: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ShopifyError("shopify_error");
    }
    json = await res.json().catch(() => null);
    // THROTTLED = kuota kalkulasi sedang habis, bukan kegagalan — tunggu lalu
    // ulangi permintaan yang sama (pola yang sama dengan pencocok resi).
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
    throw new ShopifyError(
      ditolak ? "shopify_forbidden_customers" : "shopify_error",
      (json?.errors ?? []).map((e: any) => e?.message).filter(Boolean).join("; ") || undefined,
    );
  }
  return json.data;
}

export interface ShopifyCustomer {
  id: string;
  email: string;
  tags: string[];
}

function mapNode(n: any): ShopifyCustomer {
  return {
    id: String(n.id),
    email: String(n.defaultEmailAddress?.emailAddress ?? "").toLowerCase(),
    tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
  };
}

/**
 * Cari customer menurut email — PERSIS, bukan sekadar hasil pencarian.
 * `query: email:x` di Shopify bisa mengembalikan kecocokan longgar; yang
 * dipulangkan hanya node yang emailnya identik setelah diseragamkan.
 */
export async function findCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  const target = email.trim().toLowerCase();
  const direct = await gql(BY_EMAIL, { identifier: { emailAddress: target } });
  if (direct?.customerByIdentifier) return mapNode(direct.customerByIdentifier);

  const data = await gql(FIND, { q: `email:"${target.replace(/"/g, "")}"` });
  const nodes: any[] = data?.customers?.nodes ?? [];
  const hit = nodes.map(mapNode).find((c) => c.email === target);
  return hit ?? null;
}

export async function createCustomer(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  tags: string[];
}): Promise<ShopifyCustomer> {
  const data = await gql(CREATE, {
    input: {
      email: input.email.trim().toLowerCase(),
      firstName: input.firstName?.trim() || undefined,
      lastName: input.lastName?.trim() || undefined,
      tags: input.tags,
    },
  });
  const payload = data?.customerCreate;
  const errs: any[] = payload?.userErrors ?? [];
  if (errs.length || !payload?.customer) {
    // "Email has already been taken" = customer-nya ADA tapi belum terlihat
    // lookup mana pun — baca ulang langsung beberapa kali sebelum menyerah.
    if (errs.some((e) => /already been taken/i.test(e?.message ?? ""))) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        const found = await findCustomerByEmail(input.email);
        if (found) return found;
      }
    }
    throw new ShopifyError(
      "shopify_user_error",
      errs.map((e) => e?.message).filter(Boolean).join("; ") || undefined,
    );
  }
  return mapNode(payload.customer);
}

/** Tambahkan tag yang belum ada. Tidak memanggil Shopify kalau semuanya sudah ada. */
export async function ensureTags(customer: ShopifyCustomer, wanted: string[]): Promise<string[]> {
  const have = new Set(customer.tags.map((t) => t.toLowerCase()));
  const missing = wanted.filter((t) => t && !have.has(t.toLowerCase()));
  if (!missing.length) return customer.tags;
  const data = await gql(TAG, { id: customer.id, tags: missing });
  const errs: any[] = data?.tagsAdd?.userErrors ?? [];
  if (errs.length) {
    throw new ShopifyError("shopify_user_error", errs.map((e) => e?.message).filter(Boolean).join("; "));
  }
  return [...customer.tags, ...missing];
}

/**
 * Idempoten: cari dulu, buat kalau belum ada, pastikan tag penandanya
 * terpasang. `customerCreate` gagal dengan "Email has already been taken"
 * untuk email yang sudah ada — karena itu lookup selalu lebih dulu, dan email
 * yang sudah ada BUKAN kegagalan: seeding tetap dilanjutkan.
 */
export async function ensureShopifyCustomer(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  tags: string[];
}): Promise<{ customer: ShopifyCustomer; created: boolean }> {
  const tags = [...new Set([ADMIN_CREATED_TAG, ...input.tags.map((t) => t.trim()).filter(Boolean)])];
  const existing = await findCustomerByEmail(input.email);
  if (existing) {
    const merged = await ensureTags(existing, tags);
    return { customer: { ...existing, tags: merged }, created: false };
  }
  const created = await createCustomer({ ...input, tags });
  return { customer: created, created: true };
}

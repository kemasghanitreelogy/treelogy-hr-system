import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth";
import { cdTokenConfigured, readCustomerStateMetafield } from "./cd-state";
import { mapEligibleRow } from "./map";
import { seedConfigured, seedEligibility } from "./seed";
import { ADMIN_CREATED_TAG, ShopifyError, ensureShopifyCustomer, shopifyConfigured } from "./shopify";
import type { GrantInput, GrantResult } from "./types";
import { isValidEmail, isValidSeedDate, normalizeEmail, splitTags } from "./validate";

/**
 * Satu grant, dari awal sampai ledger — dipakai formulir satuan, impor
 * massal, dan tombol "ulangi". Urutannya mengikuti dokumen alur:
 *
 *   1. customer ada di Shopify (cari → buat → tag `admin-created`)
 *   2. backend Combined Discount menyeed DB app + metafield
 *   3. ledger mencatat sampai mana langkahnya berhasil
 *
 * Idempoten: email yang sudah ada tidak gagal, seeding boleh diulang (CAS di
 * backend), dan ledger di-upsert menurut email. Menekan "ulangi" untuk baris
 * yang sudah `seeded` pun aman — hanya menyegarkan tanggal percobaan.
 */
export async function grantOne(
  supabase: SupabaseClient,
  me: SessionUser,
  input: GrantInput,
): Promise<GrantResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { email, ok: false, error: "email_required" };
  if (!isValidEmail(email)) return { email, ok: false, error: "invalid_email" };

  const seedDate = (input.seedDate ?? "").trim() || null;
  if (seedDate && !isValidSeedDate(seedDate)) return { email, ok: false, error: "invalid_date" };

  if (!shopifyConfigured()) return { email, ok: false, error: "shopify_not_configured" };

  const firstName = (input.firstName ?? "").trim().slice(0, 120);
  const lastName = (input.lastName ?? "").trim().slice(0, 120);
  const tags = splitTags(input.tags ?? []);
  const source = input.source === "import" ? "import" : "manual";

  // ── 1. Customer di Shopify ──
  let shopifyId: string;
  let created: boolean;
  let finalTags: string[];
  try {
    const r = await ensureShopifyCustomer({ email, firstName, lastName, tags });
    shopifyId = r.customer.id;
    created = r.created;
    finalTags = r.customer.tags;
  } catch (e) {
    const err = e instanceof ShopifyError ? e : new ShopifyError("shopify_error");
    return { email, ok: false, error: err.code, detail: err.detail };
  }

  // ── 2. Seeding eligibility ──
  let seedStatus: "pending" | "seeded" | "failed" = "pending";
  let seedError: string | null = null;
  let seedErrorDetail: string | null = null;
  let seedFirstPurchaseAt: string | null = null;
  let seedCampaigns: { key: string; qualifiedAt: string }[] = [];

  if (seedConfigured()) {
    const out = await seedEligibility({
      email, firstName, lastName,
      tags: [...new Set([ADMIN_CREATED_TAG, ...tags])],
      campaignKeys: input.campaignKeys ?? null,
      seedDate,
    });
    if (out.ok) {
      seedStatus = "seeded";
      seedFirstPurchaseAt = out.firstPurchaseAt;
      seedCampaigns = out.campaigns;
      // Backend melihat customer yang sama; kalau ia yang lebih dulu tahu ID-nya
      // (mis. merge di Shopify), ID dari backend yang dipercaya.
      if (out.customerId) shopifyId = out.customerId;
    } else {
      seedStatus = "failed";
      seedError = out.code;
      seedErrorDetail = out.detail ?? null;
    }
  } else {
    seedError = "seed_not_configured";
  }

  // ── 2b. Verifikasi: apa yang benar-benar tertulis di metafield ──
  // Dibaca lewat token app Combined Discount, terlepas dari jawaban backend —
  // bukti, bukan kepercayaan. Gagal baca bukan kegagalan grant.
  const metafield = cdTokenConfigured() ? await readCustomerStateMetafield(shopifyId) : null;

  // ── 3. Ledger ──
  const { data: existing } = await supabase
    .from("eligible_customers")
    .select("granted_by, granted_by_name, granted_at, source")
    .eq("email", email)
    .maybeSingle();

  const now = new Date().toISOString();
  const row = {
    email,
    shopify_customer_id: shopifyId,
    first_name: firstName,
    last_name: lastName,
    tags: finalTags,
    // Sekali "dibuat dari sini" tetap begitu — percobaan ulang menemukan
    // customer yang tadi dibuat, dan itu bukan berarti ia "sudah ada duluan".
    created_in_shopify: existing ? undefined : created,
    seed_status: seedStatus,
    seed_first_purchase_at: seedFirstPurchaseAt,
    seed_campaigns: seedCampaigns,
    seed_error: seedError,
    seed_error_detail: seedErrorDetail,
    seed_date: seedDate,
    source: existing?.source ?? source,
    granted_by: existing?.granted_by ?? (me.id.startsWith("seed-") ? null : me.id),
    granted_by_name: existing?.granted_by_name ?? me.name,
    granted_at: existing?.granted_at ?? now,
    last_attempt_at: now,
    updated_at: now,
    ...(metafield ? { metafield_state: metafield, verified_at: now } : {}),
  };
  if (row.created_in_shopify === undefined) delete (row as { created_in_shopify?: boolean }).created_in_shopify;

  const { data: saved, error: dbError } = await supabase
    .from("eligible_customers")
    .upsert(row, { onConflict: "email" })
    .select("*")
    .single();
  if (dbError || !saved) {
    // Customer & seeding sudah terjadi di luar; yang gagal hanya catatannya.
    // Dilaporkan apa adanya supaya orangnya tahu harus menekan ulang (aman).
    return { email, ok: false, error: "save_failed", detail: dbError?.message };
  }

  return { email, ok: true, customer: mapEligibleRow(saved) };
}

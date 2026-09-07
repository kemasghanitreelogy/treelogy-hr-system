import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cdTokenConfigured, readCustomerStateMetafield } from "./cd-state";
import { mapEligibleRow } from "./map";
import type { GrantResult } from "./types";
import { normalizeEmail } from "./validate";

/**
 * Baca ulang metafield seorang pelanggan dan simpan hasilnya di ledger.
 * Langkah verifikasi §5 dokumen alur, dijadikan tombol — supaya "sudah
 * eligible" bukan sekadar jawaban backend yang dipercaya, melainkan isi
 * metafield yang dibaca sendiri.
 */
export async function verifyOne(supabase: SupabaseClient, rawEmail: string): Promise<GrantResult> {
  const email = normalizeEmail(rawEmail);
  if (!cdTokenConfigured()) return { email, ok: false, error: "verify_not_configured" };

  const { data: row } = await supabase.from("eligible_customers").select("*").eq("email", email).maybeSingle();
  if (!row) return { email, ok: false, error: "not_found" };
  if (!row.shopify_customer_id) return { email, ok: false, error: "verify_no_customer" };

  const metafield = await readCustomerStateMetafield(row.shopify_customer_id);
  if (!metafield) return { email, ok: false, error: "verify_failed" };

  const { data: saved, error } = await supabase
    .from("eligible_customers")
    .update({ metafield_state: metafield, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("email", email)
    .select("*")
    .single();
  if (error || !saved) return { email, ok: false, error: "save_failed", detail: error?.message };
  return { email, ok: true, customer: mapEligibleRow(saved) };
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { cdTokenConfigured } from "@/lib/eligible-customers/cd-state";
import { mapEligibleRow } from "@/lib/eligible-customers/map";
import { seedConfigured } from "@/lib/eligible-customers/seed";
import { shopifyConfigured, storeHandle } from "@/lib/eligible-customers/shopify";
import type { EligibleState } from "@/lib/eligible-customers/types";

/**
 * Seluruh isi layar dalam satu muatan: ledger + kesiapan dua kredensial.
 * Dipakai halaman (render server) dan route (setelah grant) agar keduanya
 * membaca sumber yang sama.
 */
export async function readState(): Promise<EligibleState> {
  const base: EligibleState = {
    customers: [],
    shopifyReady: shopifyConfigured(),
    seedReady: seedConfigured(),
    verifyReady: cdTokenConfigured(),
    storeHandle: storeHandle(),
  };
  const supabase = await createClient();
  if (!supabase) return base;

  const { data } = await supabase
    .from("eligible_customers")
    .select("*")
    .order("granted_at", { ascending: false })
    .limit(5000);

  return { ...base, customers: (data ?? []).map(mapEligibleRow) };
}

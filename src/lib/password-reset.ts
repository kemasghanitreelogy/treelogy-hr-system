import type { SupabaseClient } from "@supabase/supabase-js";
import { hashCode, hashesEqual } from "./otp";

const MAX_ATTEMPTS = 5;

/**
 * Look up the latest active OTP for an email and compare (constant-time).
 * Increments attempts on mismatch and enforces the attempt cap.
 * Returns the row id when valid so the caller can consume it.
 */
export async function checkCode(
  admin: SupabaseClient,
  email: string,
  code: string,
): Promise<{ valid: boolean; id?: string }> {
  const { data: row } = await admin
    .from("password_reset_codes")
    .select("id, code_hash, expires_at, attempts, consumed")
    .eq("email", email)
    .eq("consumed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { valid: false };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false };
  if (row.attempts >= MAX_ATTEMPTS) return { valid: false };

  const ok = hashesEqual(row.code_hash, hashCode(code, email));
  if (!ok) {
    await admin
      .from("password_reset_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return { valid: false };
  }
  return { valid: true, id: row.id as string };
}

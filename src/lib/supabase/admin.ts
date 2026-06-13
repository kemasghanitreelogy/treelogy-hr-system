import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when the server can perform admin tasks (password reset, user lookup). */
export const isAdminConfigured = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

/**
 * Service-role Supabase client. SERVER-ONLY — never import from client code.
 * Bypasses RLS; used for OTP storage and admin auth operations.
 */
export function createAdminClient(): SupabaseClient | null {
  if (!isAdminConfigured) return null;
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Find an auth user by email (case-insensitive). Returns id + email, or null
 * when the user genuinely does not exist.
 *
 * THROWS on a real lookup failure (e.g. GoTrue's "Database error finding users",
 * which happens when an auth.users row has NULL token columns). Callers MUST
 * distinguish this from `null` — treating a lookup error as "not found" silently
 * hid a 2-day OTP outage. See request/route.ts for the surfacing pattern.
 */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const target = email.trim().toLowerCase();
  // Paginate through users; HR org is small, but stay correct for growth.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (!data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return { id: match.id, email: match.email ?? target };
    if (data.users.length < 200) return null; // last page
  }
  return null;
}

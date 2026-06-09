import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Pepper for hashing OTP codes. Dedicated secret, or fall back to the service-role key. */
const PEPPER = process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "treelogy-otp";

/** Generate a cryptographically-random 6-digit code, zero-padded. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Hash a code bound to its email so a leaked hash can't be reused elsewhere. */
export function hashCode(code: string, email: string): string {
  return createHash("sha256").update(`${email.toLowerCase()}.${code}.${PEPPER}`).digest("hex");
}

/** Constant-time comparison of two hex hashes. */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

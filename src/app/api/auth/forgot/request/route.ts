import { NextResponse } from "next/server";
import { createAdminClient, findUserByEmail } from "@/lib/supabase/admin";
import { isSmtpConfigured, sendOtpEmail } from "@/lib/email";
import { generateCode, hashCode } from "@/lib/otp";

export const runtime = "nodejs";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 45 * 1000; // min gap between sends per email

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Always returns { ok: true } regardless of whether the email exists (anti-enumeration). */
export async function POST(req: Request) {
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin || !isSmtpConfigured) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const user = await findUserByEmail(admin, email);
    // Only send if the account exists — but respond the same either way.
    if (user) {
      // Cooldown: skip if a code was just sent.
      const { data: recent } = await admin
        .from("password_reset_codes")
        .select("created_at")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastMs = recent?.created_at ? Date.now() - new Date(recent.created_at).getTime() : Infinity;
      if (lastMs >= RESEND_COOLDOWN_MS) {
        // Invalidate any prior unconsumed codes, then issue a fresh one.
        await admin.from("password_reset_codes").delete().eq("email", email).eq("consumed", false);
        const code = generateCode();
        const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
        await admin.from("password_reset_codes").insert({
          email,
          code_hash: hashCode(code, email),
          expires_at: expiresAt,
        });
        await sendOtpEmail(email, code);
      }
    }
  } catch (err) {
    // Swallow errors to avoid leaking whether the email exists / SMTP state.
    console.error("[forgot/request]", err);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

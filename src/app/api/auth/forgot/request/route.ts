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

  // 1) Look the user up. A failure here is infrastructure-level (it does NOT
  //    depend on whether THIS email exists — listUsers scans every row), so
  //    surfacing it as 503 leaks nothing about enumeration and, crucially,
  //    stops a broken lookup from silently masquerading as "user not found"
  //    (that swallowed a 2-day OTP outage). See findUserByEmail.
  let user: { id: string; email: string } | null;
  try {
    user = await findUserByEmail(admin, email);
  } catch (err) {
    console.error("[forgot/request] user lookup failed:", err);
    return NextResponse.json({ error: "lookup_unavailable" }, { status: 503 });
  }

  // 2) Unknown email: respond OK without sending (anti-enumeration). This is the
  //    ONLY place existence is hidden — and it is, identically, for any address.
  if (!user) return NextResponse.json({ ok: true });

  // 3) Issue a fresh code (with a resend cooldown).
  let code: string;
  try {
    const { data: recent } = await admin
      .from("password_reset_codes")
      .select("created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastMs = recent?.created_at ? Date.now() - new Date(recent.created_at).getTime() : Infinity;
    if (lastMs < RESEND_COOLDOWN_MS) return NextResponse.json({ ok: true }); // just sent one
    // Invalidate any prior unconsumed codes, then issue a fresh one.
    await admin.from("password_reset_codes").delete().eq("email", email).eq("consumed", false);
    code = generateCode();
    const { error: insErr } = await admin.from("password_reset_codes").insert({
      email,
      code_hash: hashCode(code, email),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (insErr) throw insErr;
  } catch (err) {
    console.error("[forgot/request] could not issue reset code:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // 4) Send. A failure here means a real, actionable outage (SMTP down / wrong
  //    creds) — surface it instead of pretending success. Drop the just-issued
  //    code so a stale, unusable one isn't left behind.
  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error("[forgot/request] OTP email send FAILED (SMTP) for an existing user:", err);
    await admin.from("password_reset_codes").delete().eq("email", email).eq("consumed", false);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

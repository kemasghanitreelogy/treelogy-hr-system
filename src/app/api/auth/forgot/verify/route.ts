import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCode } from "@/lib/password-reset";

export const runtime = "nodejs";

/** Validate an OTP code without consuming it (consumption happens on reset). */
export async function POST(req: Request) {
  let email: string;
  let code: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    code = String(body?.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const { valid } = await checkCode(admin, email, code);
    if (!valid) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot/verify]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

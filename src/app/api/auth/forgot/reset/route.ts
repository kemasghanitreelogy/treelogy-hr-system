import { NextResponse } from "next/server";
import { createAdminClient, findUserByEmail } from "@/lib/supabase/admin";
import { checkCode } from "@/lib/password-reset";

export const runtime = "nodejs";

/** Verify the OTP one final time, set the new password via admin API, consume the code. */
export async function POST(req: Request) {
  let email: string;
  let code: string;
  let password: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    code = String(body?.code ?? "").trim();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const { valid, id } = await checkCode(admin, email, code);
    if (!valid || !id) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

    const user = await findUserByEmail(admin, email);
    if (!user) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) {
      console.error("[forgot/reset] updateUser", error);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    // Consume the code so it can't be reused.
    await admin.from("password_reset_codes").update({ consumed: true }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot/reset]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

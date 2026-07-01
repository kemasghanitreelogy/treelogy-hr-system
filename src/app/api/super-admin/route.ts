import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPER_ADMIN_EMAIL } from "@/lib/super-admin";

export const runtime = "nodejs";

interface Payload {
  /** profiles.id (auth user id) to toggle. */
  id?: string;
  value?: boolean;
}

// ---- Grant / revoke super-admin access (super-admin only) ----
export async function PATCH(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id || typeof body.value !== "boolean") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Only a super admin may assign super-admin access.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: target } = await admin.from("profiles").select("id").eq("id", body.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // The fixed root can never be revoked.
  const { data: authUser } = await admin.auth.admin.getUserById(body.id);
  const email = (authUser?.user?.email ?? "").toLowerCase();
  if (email === SUPER_ADMIN_EMAIL && body.value === false) {
    return NextResponse.json({ error: "root_locked" }, { status: 400 });
  }

  const { error } = await admin.from("profiles").update({ is_super_admin: body.value }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, id: body.id, isSuperAdmin: body.value });
}

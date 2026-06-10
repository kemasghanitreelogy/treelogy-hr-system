import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Custom role id → legacy `role` enum, kept in sync so is_hr()/RLS stay correct.
const ROLE_ENUM: Record<string, "admin" | "hr" | "manager" | "employee"> = {
  "role-admin": "admin",
  "role-hr": "hr",
  "role-manager": "manager",
  "role-employee": "employee",
};

interface Payload {
  employeeId?: string;
  roleId?: string;
}

// ---- Assign a role to an employee's profile ----
export async function PATCH(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.employeeId || !body.roleId) {
    return NextResponse.json({ error: "employee_and_role_required" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The role must exist (also guards against typo'd ids).
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("id", body.roleId)
    .maybeSingle();
  if (!role) return NextResponse.json({ error: "unknown_role" }, { status: 400 });

  const update: Record<string, unknown> = { role_id: body.roleId };
  if (ROLE_ENUM[body.roleId]) update.role = ROLE_ENUM[body.roleId];

  // RLS ("assign roles") permits this only for users with access.users.
  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("employee_id", body.employeeId)
    .select("employee_id, role_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  // No matching profile = this employee has no login account yet.
  if (!data) return NextResponse.json({ error: "no_account" }, { status: 404 });

  return NextResponse.json({ ok: true, employeeId: data.employee_id, roleId: data.role_id });
}

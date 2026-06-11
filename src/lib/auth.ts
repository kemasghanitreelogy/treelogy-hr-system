import { cache } from "react";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";
import { ALL_PERMISSION_IDS } from "./rbac";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleId: string | null;
  roleName: string;
  permissions: string[];
  employeeId: string | null;
}

/** Demo identity used when Supabase isn't configured (seed mode). */
const SEED_USER: SessionUser = {
  id: "seed-admin",
  email: "dewi.lestari@treelogy.com",
  name: "Dewi Lestari",
  roleId: "role-admin",
  roleName: "Administrator",
  permissions: [...ALL_PERMISSION_IDS],
  employeeId: "e08",
};

async function resolveSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured) return SEED_USER;

  const supabase = await createClient();
  if (!supabase) return SEED_USER;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("employee_id, role_id, role")
    .eq("id", user.id)
    .maybeSingle();

  // roles & employees hanya bergantung pada profile — ambil paralel (1 roundtrip, bukan 2).
  const [roleRes, empRes] = await Promise.all([
    profile?.role_id
      ? supabase.from("roles").select("name, permissions").eq("id", profile.role_id).maybeSingle()
      : Promise.resolve({ data: null }),
    profile?.employee_id
      ? supabase.from("employees").select("name").eq("id", profile.employee_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let roleName = "Karyawan";
  let permissions: string[] = ["dashboard.view"];
  if (roleRes.data) {
    roleName = roleRes.data.name;
    permissions = roleRes.data.permissions ?? permissions;
  }

  const local = (user.email ?? "pengguna").split("@")[0].replace(/[._-]+/g, " ");
  let name = local.replace(/\b\w/g, (c) => c.toUpperCase());
  if (empRes.data?.name) name = empRes.data.name;

  return {
    id: user.id,
    email: user.email ?? "",
    name,
    roleId: profile?.role_id ?? null,
    roleName,
    permissions,
    employeeId: profile?.employee_id ?? null,
  };
}

/**
 * Resolve the current user (session → profile → role permissions → employee).
 * Returns SEED_USER in seed mode, or null when configured but not signed in.
 * Dibungkus React cache(): layout + page dalam satu render berbagi satu hasil
 * (tidak ada query auth ganda per request).
 */
export const getSessionUser = cache(resolveSessionUser);

export function can(user: SessionUser | null, permission: string): boolean {
  return !!user && user.permissions.includes(permission);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, findUserByEmail } from "@/lib/supabase/admin";
import { mapEmployee } from "@/lib/data";
import type { Employee, Team } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Buat akun login untuk karyawan baru (service-role). Password awal = email
 * agar mudah login pertama kali; karyawan diberi peran default "Karyawan".
 * Jika email sudah punya akun, cukup tautkan profilnya.
 */
async function ensureAccount(employeeId: string, email: string | null | undefined): Promise<boolean> {
  const admin = createAdminClient();
  const mail = email?.trim();
  if (!admin || !mail) return false;
  let userId: string | undefined;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: mail,
    password: mail, // password awal = email (default login)
    email_confirm: true,
  });
  userId = created?.user?.id;
  if (error || !userId) {
    const existing = await findUserByEmail(admin, mail);
    if (!existing) return false;
    userId = existing.id;
  }
  const { error: pErr } = await admin
    .from("profiles")
    .upsert(
      { id: userId, employee_id: employeeId, role_id: "role-employee", role: "employee" },
      { onConflict: "id" },
    );
  return !pErr;
}

const TEAM_PREFIX: Record<Team, string> = { factory: "01", farm: "02", office: "04" };
const LOCATION: Record<Team, Employee["location"]> = {
  factory: "Factory · Bali",
  farm: "Farm · Bali",
  office: "Office · Bali",
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface Payload {
  id?: string;
  name?: string;
  team?: Team;
  position?: string;
  email?: string | null;
  phone?: string;
  baseSalary?: number;
  allowance?: number;
  ptkp?: string;
  religion?: string | null;
  npwp?: string | null;
  bankName?: string;
  bankAccount?: string;
  workStart?: string;
  workEnd?: string;
  status?: "active" | "inactive";
  managerId?: string | null;
}

/** Map a camelCase payload to the employees table row (snake_case). Only defined keys. */
function toRow(p: Payload): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.team !== undefined) {
    row.team = p.team;
    row.location = LOCATION[p.team] ?? "Office · Bali";
  }
  if (p.position !== undefined) row.position = p.position || "Staff";
  if (p.email !== undefined) row.email = p.email || null;
  if (p.phone !== undefined) row.phone = p.phone || null;
  if (p.baseSalary !== undefined) row.base_salary = Number(p.baseSalary) || 0;
  if (p.allowance !== undefined) row.allowance = Number(p.allowance) || 0;
  if (p.ptkp !== undefined) row.ptkp = p.ptkp;
  if (p.religion !== undefined) row.religion = p.religion || null;
  if (p.npwp !== undefined) row.npwp = p.npwp || null;
  if (p.bankName !== undefined) row.bank_name = p.bankName || null;
  if (p.bankAccount !== undefined) row.bank_account = p.bankAccount || null;
  if (p.workStart !== undefined && HHMM.test(p.workStart)) row.work_start = p.workStart;
  if (p.workEnd !== undefined && HHMM.test(p.workEnd)) row.work_end = p.workEnd;
  if (p.status !== undefined) row.status = p.status;
  if (p.managerId !== undefined) row.manager_id = p.managerId || null;
  return row;
}

async function auth() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase };
}

// ---- Create ----
export async function POST(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.name || !body.team) {
    return NextResponse.json({ error: "name_and_team_required" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Auto-generate the next NIK within the team (TRL-<prefix><seq>).
  const prefix = TEAM_PREFIX[body.team] ?? "04";
  const { data: existing } = await supabase!
    .from("employees")
    .select("nik")
    .like("nik", `TRL-${prefix}%`);
  let maxSeq = 0;
  for (const r of existing ?? []) {
    const seq = parseInt(String((r as { nik: string }).nik).slice(-2), 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  const nik = `TRL-${prefix}${String(maxSeq + 1).padStart(2, "0")}`;

  const row = {
    nik,
    status: "active",
    join_date: new Date().toISOString().slice(0, 10),
    bpjs_kes: true,
    bpjs_tk: true,
    ...toRow(body),
  };

  const { data, error } = await supabase!.from("employees").insert(row).select("*").single();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  const employee = mapEmployee(data);
  // Akun login otomatis (password awal = email).
  const accountCreated = await ensureAccount(employee.id, employee.email);
  return NextResponse.json({ ok: true, employee, accountCreated });
}

// ---- Update ----
export async function PATCH(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const row = toRow(body);
  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("employees")
    .update(row)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();

  // RLS filters non-HR writes to 0 rows (no error) — treat as forbidden.
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, employee: mapEmployee(data) });
}

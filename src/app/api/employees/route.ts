import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, findUserByEmail } from "@/lib/supabase/admin";
import { mapEmployee } from "@/lib/data";
import { witaToday } from "@/lib/utils";
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
    // createUser failed (likely the email already exists) — fall back to a
    // lookup. findUserByEmail can throw on a real lookup error; account
    // creation is best-effort, so treat that as "couldn't link" rather than
    // failing the whole employee create.
    let existing: { id: string; email: string } | null = null;
    try {
      existing = await findUserByEmail(admin, mail);
    } catch (err) {
      console.error("[employees/ensureAccount] lookup failed:", err);
      return false;
    }
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

// --- KTP photo upload (private bucket; HR + the employee can read via RLS) ---
const KTP_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const KTP_MAX_BYTES = 5 * 1024 * 1024;
type SbClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

function parseDataUrl(dataUrl?: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl) return null;
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

/** Upload a KTP scan to `ktp-photos/<employeeId>/...`. Returns the path or an error response. */
async function uploadKtpPhoto(supabase: SbClient, employeeId: string, dataUrl: string): Promise<string | NextResponse> {
  const file = parseDataUrl(dataUrl);
  if (!file || !KTP_EXT[file.mime]) return NextResponse.json({ error: "invalid_ktp_type" }, { status: 400 });
  if (file.buffer.length > KTP_MAX_BYTES) return NextResponse.json({ error: "ktp_too_large" }, { status: 400 });
  const path = `${employeeId}/${crypto.randomUUID()}.${KTP_EXT[file.mime]}`;
  const { error } = await supabase.storage.from("ktp-photos").upload(path, file.buffer, { contentType: file.mime, upsert: false });
  if (error) return NextResponse.json({ error: "ktp_upload_failed" }, { status: 403 });
  return path;
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
  religion?: string | null;
  birthPlace?: string | null;
  dateOfBirth?: string | null;
  ktpAddress?: string | null;
  ktpNik?: string | null;
  /** KTP scan as a `data:<mime>;base64,...` URL; uploaded to the private bucket. */
  ktpPhotoFile?: string;
  npwp?: string | null;
  bankName?: string;
  bankAccount?: string;
  workStart?: string;
  workEnd?: string;
  status?: "active" | "inactive";
  managerId?: string | null;
  contractType?: "pkwt" | "pkwtt";
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
  if (p.religion !== undefined) row.religion = p.religion || null;
  if (p.birthPlace !== undefined) row.birth_place = p.birthPlace || null;
  if (p.dateOfBirth !== undefined) row.date_of_birth = p.dateOfBirth || null;
  if (p.ktpAddress !== undefined) row.ktp_address = p.ktpAddress || null;
  if (p.ktpNik !== undefined) row.ktp_nik = p.ktpNik || null;
  if (p.npwp !== undefined) row.npwp = p.npwp || null;
  if (p.bankName !== undefined) row.bank_name = p.bankName || null;
  if (p.bankAccount !== undefined) row.bank_account = p.bankAccount || null;
  if (p.workStart !== undefined && HHMM.test(p.workStart)) row.work_start = p.workStart;
  if (p.workEnd !== undefined && HHMM.test(p.workEnd)) row.work_end = p.workEnd;
  if (p.status !== undefined) row.status = p.status;
  if (p.managerId !== undefined) row.manager_id = p.managerId || null;
  if (p.contractType === "pkwt" || p.contractType === "pkwtt") row.contract_type = p.contractType;
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
    join_date: witaToday(),
    bpjs_kes: true,
    bpjs_tk: true,
    ...toRow(body),
  };

  const { data, error } = await supabase!.from("employees").insert(row).select("*").single();
  if (error || !data) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  let saved = data;
  // KTP scan needs the new id for its storage path, so upload after the insert.
  if (body.ktpPhotoFile) {
    const path = await uploadKtpPhoto(supabase!, String(data.id), body.ktpPhotoFile);
    if (path instanceof NextResponse) return path;
    const { data: withPhoto } = await supabase!
      .from("employees").update({ ktp_photo_path: path }).eq("id", data.id).select("*").maybeSingle();
    if (withPhoto) saved = withPhoto;
  }
  const employee = mapEmployee(saved);
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
  if (body.ktpPhotoFile) {
    const path = await uploadKtpPhoto(supabase!, body.id, body.ktpPhotoFile);
    if (path instanceof NextResponse) return path;
    row.ktp_photo_path = path;
  }
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

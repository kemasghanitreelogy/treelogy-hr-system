// Create login accounts for every employee the CORRECT way: via the GoTrue
// Admin API (createUser), which always initialises auth.users token columns to
// '' — never NULL. This is the antidote to the raw `INSERT INTO auth.users`
// seeding that produced NULL tokens and broke listUsers / the OTP flow.
//
// Idempotent: existing accounts are left untouched (roles are NOT reset).
// Convention: initial password = the employee's email (matches the app).
//
// Run: node --env-file=.env.local scripts/seed-accounts.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Employees that should have a login.
const { data: employees, error } = await admin
  .from("employees")
  .select("id, name, email")
  .not("email", "is", null);
if (error) {
  console.error("Failed to read employees:", error.message);
  process.exit(1);
}

// Index existing auth users by email so we skip ones that already exist.
const existing = new Map();
for (let page = 1; page <= 20; page++) {
  const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (e) {
    console.error("listUsers failed:", e.message);
    process.exit(1);
  }
  for (const u of data.users) existing.set((u.email || "").toLowerCase(), u.id);
  if (data.users.length < 200) break;
}

let created = 0;
let skipped = 0;
for (const emp of employees) {
  const mail = (emp.email || "").trim().toLowerCase();
  if (!mail) continue;
  if (existing.has(mail)) {
    skipped++;
    continue; // leave existing accounts (and their roles) as-is
  }
  const { data, error: e } = await admin.auth.admin.createUser({
    email: mail,
    password: mail, // initial password = email
    email_confirm: true,
  });
  if (e || !data?.user?.id) {
    console.error(`  ✗ ${mail}: ${e?.message || "no id returned"}`);
    continue;
  }
  // Link the profile for the new account (default role; adjust in the UI).
  const { error: pErr } = await admin
    .from("profiles")
    .upsert({ id: data.user.id, employee_id: emp.id, role_id: "role-employee", role: "employee" }, { onConflict: "id" });
  if (pErr) console.error(`  ✗ profile ${mail}: ${pErr.message}`);
  else {
    created++;
    console.log(`  ✓ ${mail}`);
  }
}

console.log(`Done. created=${created} skipped(existing)=${skipped}`);

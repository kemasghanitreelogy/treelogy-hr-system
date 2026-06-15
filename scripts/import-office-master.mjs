// One-shot import of the real OFFICE workforce from the master spreadsheet.
//
// DESTRUCTIVE: wipes every existing employee (cascades attendance, contracts,
// leave, payslips, KPIs, notifications, …), all payroll runs, and ALL auth
// users, then recreates the 12 office employees + their login accounts.
//
// Convention (matches the app): initial password = the employee's email.
//   - Admin login:  kemasghani123@gmail.com  (role admin, not an employee row)
//   - kemas@treelogy.com is imported as a regular employee (role employee)
//
// Source: "OFFICE_EMPLOYEE MASTER FILE (1).xlsx" (sheet "01. CONTRACT").
// Stored fields: name, ktp_nik (NIK / national ID), email, phone, position,
// team=office, join_date, and a current contract row (PKWT/PKWTT + dates).
// Birth place / DOB / KTP address have no column in the schema and are skipped.
//
// Run: node --env-file=.env.local scripts/import-office-master.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { execSync } from "node:child_process";

const XLSX = "OFFICE_EMPLOYEE MASTER FILE (1).xlsx";
const ADMIN_EMAIL = "kemasghani123@gmail.com";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

// ---- minimal .xlsx reader (no deps) -------------------------------------
function readXlsx(file) {
  const tmp = fs.mkdtempSync("/tmp/xlsx-");
  execSync(`unzip -o ${JSON.stringify(file)} -d ${tmp} >/dev/null`);
  const dir = `${tmp}/xl/`;
  const ss = fs.readFileSync(dir + "sharedStrings.xml", "utf8");
  const strings = [];
  for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let txt = "";
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) txt += t[1];
    strings.push(
      txt.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&#10;/g, "\n").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
    );
  }
  const sheet = fs.readFileSync(dir + "worksheets/sheet1.xml", "utf8");
  const colNum = (c) => [...c].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  const rows = {};
  for (const r of sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*?\bt="([^"]*)")?[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = c[3] || "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      if (!v) continue;
      cells[colNum(c[1])] = c[2] === "s" ? strings[+v[1]] : v[1];
    }
    rows[+r[1]] = cells;
  }
  return rows;
}

const MON = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12 };
const serialToISO = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
function dateISO(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "-") return null;
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 20000 && n < 60000) return serialToISO(n); }
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
  return s;
}
function phone(v) {
  if (!v) return null;
  let s = String(v);
  if (/[eE]/.test(s)) s = Number(v).toFixed(0);
  s = s.replace(/\D/g, "");
  if (s.startsWith("62")) s = "0" + s.slice(2);
  return s || null;
}

// ---- parse the sheet into employee records ------------------------------
const rows = readXlsx(XLSX);
const emps = [];
for (let rn = 2; rn <= 100; rn++) {
  const c = rows[rn];
  if (!c || !c[1] || !String(c[1]).trim()) continue;
  emps.push({
    name: String(c[1]).trim(),
    ktpNik: (c[2] || "").trim() || null,
    birthPlace: (c[4] || "").trim() || null,
    dob: dateISO(c[5]),
    ktpAddress: (c[6] || "").trim() || null,
    email: (c[7] || "").trim().toLowerCase() || null,
    phone: phone(c[8]),
    position: (c[10] || "").replace(/\s+/g, " ").trim() || "Staff",
    type: (c[11] || "").trim().toLowerCase() === "pkwtt" ? "pkwtt" : "pkwt",
    joinDate: dateISO(c[12]),
    ccStart: dateISO(c[13]),
    ccEnd: dateISO(c[14]),
  });
}
if (!emps.length) { console.error("No rows parsed from", XLSX); process.exit(1); }
if (emps.some((e) => !e.email)) { console.error("Some rows are missing email:", emps.filter((e) => !e.email).map((e) => e.name)); process.exit(1); }
console.log(`Parsed ${emps.length} employees from ${XLSX}`);

// ---- connect (service role: bypasses RLS) -------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const keyEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !keyEnv) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const admin = createClient(url, keyEnv, { auth: { autoRefreshToken: false, persistSession: false } });

// 1) Delete every auth user (cascades profiles) --------------------------
const users = [];
for (let page = 1; page <= 50; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 200) break;
}
for (const u of users) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) console.error("  ✗ delete user", u.email, error.message);
}
console.log(`Deleted ${users.length} auth users`);

// 2) Wipe employee + payroll data ----------------------------------------
for (const tbl of ["payroll_runs", "employees"]) {
  const { error } = await admin.from(tbl).delete().neq("id", ZERO_UUID);
  if (error) throw new Error(`wipe ${tbl}: ${error.message}`);
}
console.log("Wiped employees (cascade) + payroll_runs");

// 3) Insert employees (auto NIK TRL-04xx, office) ------------------------
const empRows = emps.map((e, i) => ({
  nik: `TRL-04${String(i + 1).padStart(2, "0")}`,
  name: e.name,
  email: e.email,
  phone: e.phone,
  team: "office",
  position: e.position,
  status: "active",
  join_date: e.joinDate,
  end_date: null,
  ktp_nik: e.ktpNik,
  birth_place: e.birthPlace,
  date_of_birth: e.dob,
  ktp_address: e.ktpAddress,
  location: "Office · Bali",
  bpjs_kes: true,
  bpjs_tk: true,
}));
const { data: inserted, error: insErr } = await admin.from("employees").insert(empRows).select("id,email,name,nik");
if (insErr) throw insErr;
const byEmail = new Map(inserted.map((r) => [r.email.toLowerCase(), r]));
console.log(`Inserted ${inserted.length} employees`);

// 4) Contracts + leave balances ------------------------------------------
const contracts = emps.map((e) => ({
  employee_id: byEmail.get(e.email).id,
  type: e.type,
  start_date: e.ccStart || e.joinDate,
  end_date: e.type === "pkwtt" ? null : e.ccEnd,
  status: "active",
  note: "Imported from OFFICE_EMPLOYEE MASTER FILE",
}));
{
  const { error } = await admin.from("employee_contracts").insert(contracts);
  if (error) throw new Error(`contracts: ${error.message}`);
}
{
  const { error } = await admin.from("leave_balances").insert(
    inserted.map((r) => ({ employee_id: r.id, annual_quota: 12, annual_used: 0, sick_used: 0, tabungan_libur: 0 })),
  );
  if (error) throw new Error(`leave_balances: ${error.message}`);
}
console.log("Inserted contracts + leave balances");

// 5) Login accounts (password = email) -----------------------------------
async function mkUser(email, roleId, role, employeeId) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: email, email_confirm: true });
  if (error || !data?.user?.id) { console.error("  ✗ createUser", email, error?.message); return; }
  const { error: pErr } = await admin.from("profiles").upsert(
    { id: data.user.id, employee_id: employeeId, role_id: roleId, role }, { onConflict: "id" },
  );
  if (pErr) console.error("  ✗ profile", email, pErr.message);
  else console.log(`  ✓ ${email} (${role})`);
}

await mkUser(ADMIN_EMAIL, "role-admin", "admin", null);
for (const e of emps) await mkUser(e.email, "role-employee", "employee", byEmail.get(e.email).id);

console.log("\nDone. Admin login:", ADMIN_EMAIL, "(initial password = the email)");

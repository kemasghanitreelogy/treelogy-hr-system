// Seeds attendance, shift_assignments, leave_balances into Supabase.
// Run: node --experimental-strip-types --env-file=.env.local scripts/seed-dynamic.ts
import { employees, shifts, attendance, shiftAssignments, leaveBalances } from "../src/lib/seed.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Missing env");
  process.exit(1);
}
const H = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

const nikBySeedId = new Map(employees.map((e) => [e.id, e.nik]));
const shiftNameBySeedId = new Map(shifts.map((s) => [s.id, s.name]));

async function get(path: string) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(table: string, rows: unknown[], onConflict?: string) {
  if (rows.length === 0) return;
  const q = onConflict ? `?on_conflict=${onConflict}` : "";
  const prefer = onConflict ? "resolution=merge-duplicates,return=minimal" : "return=minimal";
  const r = await fetch(`${url}/rest/v1/${table}${q}`, {
    method: "POST",
    headers: { ...H, Prefer: prefer },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`insert ${table}: ${r.status} ${await r.text()}`);
}

const empRows = (await get("employees?select=id,nik")) as { id: string; nik: string }[];
const uuidByNik = new Map(empRows.map((e) => [e.nik, e.id]));
const shiftRows = (await get("shifts?select=id,name")) as { id: string; name: string }[];
const shiftUuidByName = new Map(shiftRows.map((s) => [s.name, s.id]));

const empUuid = (seedId: string) => uuidByNik.get(nikBySeedId.get(seedId) ?? "");
const shiftUuid = (seedId?: string | null) =>
  seedId ? shiftUuidByName.get(shiftNameBySeedId.get(seedId) ?? "") ?? null : null;

// Wipe + reseed attendance/assignments to stay idempotent.
await fetch(`${url}/rest/v1/attendance?id=neq.00000000-0000-0000-0000-000000000000`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
await fetch(`${url}/rest/v1/shift_assignments?id=neq.00000000-0000-0000-0000-000000000000`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });

const attRows = attendance
  .map((a) => ({
    employee_id: empUuid(a.employeeId),
    date: a.date,
    shift_id: shiftUuid(a.shiftId),
    clock_in: a.clockIn ?? null,
    clock_out: a.clockOut ?? null,
    status: a.status,
    late_minutes: a.lateMinutes,
    overtime_minutes: a.overtimeMinutes,
    source: a.source,
  }))
  .filter((r) => r.employee_id);

const saRows = shiftAssignments
  .map((s) => ({ employee_id: empUuid(s.employeeId), shift_id: shiftUuid(s.shiftId), date: s.date }))
  .filter((r) => r.employee_id && r.shift_id);

const lbRows = leaveBalances
  .map((b) => ({
    employee_id: empUuid(b.employeeId),
    annual_quota: b.annualQuota,
    annual_used: b.annualUsed,
    sick_used: b.sickUsed,
    tabungan_libur: b.tabunganLibur,
  }))
  .filter((r) => r.employee_id);

await post("attendance", attRows);
await post("shift_assignments", saRows);
await post("leave_balances", lbRows, "employee_id");

console.log(`✅ attendance: ${attRows.length}, shift_assignments: ${saRows.length}, leave_balances upserted: ${lbRows.length}`);

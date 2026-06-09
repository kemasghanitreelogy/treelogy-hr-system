// E2E auth + RLS check. Run: node --env-file=.env.local scripts/check-auth-rls.mjs
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.argv[2] || "kemas@treelogy.com";
const password = process.argv[3] || "Treelogy2026!";

async function count(table, token) {
  const headers = { apikey: pub, Prefer: "count=exact" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  const range = r.headers.get("content-range");
  return range ? range.split("/")[1] : "?";
}

// 1) Login (password grant) — same credentials the app uses.
const lr = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: pub, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const auth = await lr.json();
if (!lr.ok) {
  console.error("❌ Login failed:", lr.status, JSON.stringify(auth));
  process.exit(1);
}
console.log(`✅ Login OK as ${email} (token ${String(auth.access_token).slice(0, 10)}…)`);
const token = auth.access_token;

console.log("\n— As AUTHENTICATED admin (RLS allows) —");
for (const t of ["employees", "attendance", "leave_requests", "payroll_runs", "kpis", "roles"]) {
  console.log(`  ${t.padEnd(16)} ${await count(t, token)} rows`);
}

console.log("\n— As ANON (no login; RLS should hide row-protected tables) —");
for (const t of ["employees", "attendance", "leave_requests"]) {
  console.log(`  ${t.padEnd(16)} ${await count(t, null)} rows`);
}
console.log("\n(employees is public-readable; attendance/leave should be 0 for anon = RLS working)");

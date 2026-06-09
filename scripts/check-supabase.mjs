// Quick connectivity + schema check. Run: node --env-file=.env.local scripts/check-supabase.mjs
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

const mask = (s) => (s ? s.slice(0, 12) + "…(" + s.length + " chars)" : "MISSING");
console.log("URL:   ", url || "MISSING");
console.log("Pub:   ", mask(pub));
console.log("Secret:", mask(secret));
console.log("");

if (!url || !pub || !secret) {
  console.error("❌ Ada env yang kosong.");
  process.exit(1);
}

async function main() {
  // 1) Project reachable + publishable key valid
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: pub } });
    console.log(r.ok ? "✅ Project reachable & publishable key OK" : `⚠️  Auth health HTTP ${r.status}`);
  } catch (e) {
    console.log("❌ Tidak bisa menghubungi project:", e.message);
    process.exit(1);
  }

  // 2) Schema check via secret key (bypasses RLS)
  const tables = ["employees", "roles", "push_subscriptions", "leave_requests", "payroll_runs"];
  let anyMissing = false;
  for (const t of tables) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, Prefer: "count=exact" },
    });
    if (r.status === 200 || r.status === 206) {
      const range = r.headers.get("content-range"); // e.g. 0-0/14
      const count = range ? range.split("/")[1] : "?";
      console.log(`✅ tabel "${t}" ada — ${count} baris`);
    } else {
      anyMissing = true;
      const body = await r.text();
      console.log(`❌ tabel "${t}" — HTTP ${r.status} ${body.slice(0, 90)}`);
    }
  }

  console.log("");
  if (anyMissing) {
    console.log("➡️  Tabel belum lengkap. Jalankan migration + seed di SQL Editor Supabase.");
  } else {
    console.log("🎉 Semua siap. Supabase terhubung & schema + seed terpasang.");
  }
}
main();

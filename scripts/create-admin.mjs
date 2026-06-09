// Creates an admin auth user. Run: node --env-file=.env.local scripts/create-admin.mjs <email> <password>
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2] || "kemas@treelogy.com";
const password = process.argv[3] || "Treelogy2026!";

if (!url || !secret) {
  console.error("Missing env.");
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password, email_confirm: true }),
});

const data = await res.json();
if (!res.ok) {
  console.error("❌ Failed:", res.status, JSON.stringify(data));
  process.exit(1);
}
console.log("✅ Admin user created");
console.log("   id:   ", data.id);
console.log("   email:", data.email);
console.log("   password:", password);

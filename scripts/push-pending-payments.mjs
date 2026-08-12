/**
 * Skrip sekali-jalan: dorong pengajuan pembayaran yang BELUM masuk Google Sheet.
 *
 * Dipakai untuk membereskan baris yang sempat tertahan oleh alur persetujuan
 * (yang kemudian dibatalkan). Aman diulang: hanya memproses baris dengan
 * sheet_status <> 'synced', dan menandainya 'synced' setelah berhasil.
 *
 *   node --env-file=.env.local scripts/push-pending-payments.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET;
const LINK_SECRET = process.env.FILE_LINK_SECRET || SERVICE_KEY || "";
const ORIGIN = process.env.APP_ORIGIN ?? "https://treelogy-hr-system.vercel.app";

if (!SUPABASE_URL || !SERVICE_KEY || !WEBHOOK_URL) {
  console.error("Env belum lengkap (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SHEETS_WEBHOOK_URL).");
  process.exit(1);
}

const SHEET_DEPT = {
  finance: "Finance", hr_ga: "HR & GA", sales: "Sales", farm: "Farm", factory: "Factory",
  it_creative: "IT & Creative", purchasing: "Purchasing", ceo: "CEO", marketing: "Marketing",
};
const SHEET_KIND = {
  petty_cash: "Petty Cash", office_general: "Office/General Expenses", production: "Production",
  farm_maintenance: "Farm maintenance", marketing: "Marketing",
  transportation: "Transportation/Business Trips", meals_entertainment: "Meals/Entertainment",
  popup_market: "Pop-up Market Expenses", other: "Other",
};

const signedUrl = (path) => {
  const t = LINK_SECRET ? createHmac("sha256", LINK_SECRET).update(path).digest("base64url") : "";
  return `${ORIGIN}/api/payment-requests/file?path=${encodeURIComponent(path)}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
};

/** Stempel waktu WITA "DD/MM/YYYY HH:MM:SS" — bentuk yang dikenali sheet. */
function stamp(iso) {
  const d = new Date(iso ?? Date.now());
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(Number.isNaN(d.getTime()) ? new Date() : d);
  const p = Object.fromEntries(parts.map((b) => [b.type, b.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

const invoiceLine = (r) =>
  [r.invoice_date ? r.invoice_date.split("-").reverse().join("/") : "", r.description?.trim(), r.vendor_name?.trim()]
    .filter(Boolean)
    .join(" - ");

const kindText = (r) =>
  r.kind === "other" ? (r.kind_other?.trim() ? `Other: ${r.kind_other.trim()}` : "Other") : SHEET_KIND[r.kind];

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Jalur dinas baru boleh masuk sheet SETELAH persetujuan akhir — jangan
// sampai klaim yang masih menunggu Ops/Finance ikut terkirim.
const { data: rows, error } = await db
  .from("payment_requests")
  .select("*")
  .neq("sheet_status", "synced")
  .or("flow.eq.biasa,approval_status.eq.approved")
  .order("submitted_at", { ascending: true });
if (error) {
  console.error("Gagal membaca baris:", error.message);
  process.exit(1);
}
if (!rows?.length) {
  console.log("Tidak ada baris yang tertinggal — semua sudah masuk sheet.");
  process.exit(0);
}

console.log(`${rows.length} baris belum masuk sheet. Mengirim…\n`);
let ok = 0;
for (const r of rows) {
  const values = [
    stamp(r.submitted_at),
    SHEET_DEPT[r.department] ?? r.department,
    r.requester_name,
    r.email,
    kindText(r),
    invoiceLine(r),
    Number(r.total_amount),
    (r.invoice_paths ?? []).map(signedUrl).join(", "),
    r.due_date ?? "",
    r.more_details ?? "",
    r.approval_path ? signedUrl(r.approval_path) : "",
  ];

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: WEBHOOK_SECRET, values }),
  });
  const text = (await res.text()).slice(0, 200);
  const gagal = !res.ok || /error|unauthor/i.test(text);

  if (gagal) {
    await db.from("payment_requests")
      .update({ sheet_status: "failed", sheet_error: `webhook_${res.status}:${text}`.slice(0, 300) })
      .eq("id", r.id);
    console.log(`  ✗ ${invoiceLine(r)} — ${res.status} ${text}`);
  } else {
    await db.from("payment_requests")
      .update({ sheet_status: "synced", sheet_synced_at: new Date().toISOString(), sheet_error: null })
      .eq("id", r.id);
    ok++;
    console.log(`  ✓ ${invoiceLine(r)}`);
  }
}
console.log(`\nSelesai: ${ok}/${rows.length} baris masuk sheet.`);

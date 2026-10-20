/**
 * Dorong pengajuan pembayaran yang BELUM masuk Google Sheet — atau baris
 * tertentu yang statusnya perlu dipaksa kirim ulang.
 *
 *   node --env-file=.env.local scripts/push-pending-payments.mjs
 *       → semua baris dengan sheet_status <> 'synced' (jalur dinas hanya yang
 *         sudah disetujui akhir), urut waktu pengajuan.
 *
 *   node --env-file=.env.local scripts/push-pending-payments.mjs --ids a,b,c
 *       → HANYA id-id itu, PERSIS dalam urutan yang ditulis, apa pun statusnya
 *         di database. Dipakai memulihkan baris yang tercatat "synced" padahal
 *         tidak ada di sheet (kejadian 21 Sep 2026). Aman: skrip di sheet
 *         menolak Request ID yang sudah ada, jadi tidak ada baris kembar.
 *
 * Tiap baris membawa `key` (= id pengajuan) — lapisan anti-ganda di sheet —
 * dan hanya balasan berawalan "ok" yang dicatat sebagai masuk; balasan lain
 * disimpan utuh di sheet_error supaya bisa dibaca dari layar aplikasi.
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

const argIds = process.argv.indexOf("--ids");
const IDS = argIds !== -1 ? (process.argv[argIds + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean) : null;
if (IDS && IDS.length === 0) {
  console.error("--ids butuh daftar id dipisah koma.");
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

let rows;
if (IDS) {
  const { data, error } = await db.from("payment_requests").select("*").in("id", IDS);
  if (error) { console.error("Gagal membaca baris:", error.message); process.exit(1); }
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  const hilang = IDS.filter((id) => !byId.has(id));
  if (hilang.length) { console.error("Id tidak ditemukan:", hilang.join(", ")); process.exit(1); }
  rows = IDS.map((id) => byId.get(id)); // urutan mengikuti argumen, bukan database
} else {
  // Jalur dinas baru boleh masuk sheet SETELAH persetujuan akhir — jangan
  // sampai klaim yang masih menunggu Ops/Finance ikut terkirim.
  const { data, error } = await db
    .from("payment_requests")
    .select("*")
    .neq("sheet_status", "synced")
    .or("flow.eq.biasa,approval_status.eq.approved")
    .order("submitted_at", { ascending: true });
  if (error) { console.error("Gagal membaca baris:", error.message); process.exit(1); }
  rows = data ?? [];
}
if (!rows.length) {
  console.log("Tidak ada baris yang tertinggal — semua sudah masuk sheet.");
  process.exit(0);
}

console.log(`${rows.length} baris akan dikirim ke sheet…\n`);
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

  let status = 0, text = "";
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: WEBHOOK_SECRET, values, key: r.id }),
    });
    status = res.status;
    text = (await res.text()).trim().replace(/\s+/g, " ").slice(0, 200);
  } catch (e) {
    text = e instanceof Error ? e.message : String(e);
  }
  const masuk = status === 200 && /^ok\b/i.test(text);

  if (!masuk) {
    await db.from("payment_requests")
      .update({ sheet_status: "failed", sheet_error: `webhook_${status}:${text || "(balasan kosong)"}`.slice(0, 300), sheet_claimed_at: null })
      .eq("id", r.id);
    console.log(`  ✗ ${invoiceLine(r)} — ${status} ${text}`);
  } else {
    await db.from("payment_requests")
      .update({ sheet_status: "synced", sheet_synced_at: new Date().toISOString(), sheet_error: null, sheet_claimed_at: null })
      .eq("id", r.id);
    ok++;
    console.log(`  ✓ ${invoiceLine(r)} — ${text}`);
  }
}
console.log(`\nSelesai: ${ok}/${rows.length} baris masuk sheet.`);
process.exit(ok === rows.length ? 0 : 2);

/**
 * Skrip sekali-jalan: pindahkan klaim dari modul "Reimbursement Dinas" yang
 * sudah dilebur ke daftar Pengajuan Pembayaran sebagai pengajuan jalur DINAS.
 *
 *   node --env-file=.env.local scripts/migrate-reimbursements.mjs [--push-sheet]
 *
 * Yang dilakukan:
 *  1. Menyalin berkas kuitansi dari bucket `reimbursement-files` ke
 *     `payment-files` dengan PATH YANG SAMA (<employeeId>/<uuid>.<ext>),
 *     supaya validasi path & kebijakan storage yang ada tetap berlaku.
 *  2. Menyisipkan barisnya ke `payment_requests` dengan flow='dinas' dan
 *     status persetujuan yang dipertahankan apa adanya:
 *       · sudah disetujui  → approved (lengkap dengan nama & waktu penyetuju)
 *       · masih menunggu   → waiting_ops, jadi muncul di antrean Ops/GA
 *  3. Dengan --push-sheet, baris yang sudah disetujui dikirim ke Google Sheet.
 *
 * Aman diulang: baris yang sudah pernah dipindahkan (ditandai di more_details)
 * dilewati, dan penyalinan berkas mengabaikan galat "sudah ada".
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET;
const LINK_SECRET = process.env.FILE_LINK_SECRET || SERVICE_KEY || "";
const ORIGIN = process.env.APP_ORIGIN ?? "https://treelogy-hr-system.vercel.app";
const PUSH_SHEET = process.argv.includes("--push-sheet");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Env belum lengkap (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Kategori klaim lama → jenis pengeluaran pada pengajuan pembayaran. */
const KIND_BY_CATEGORY = {
  transportation: "transportation",
  accommodation: "office_general",
  meals: "meals_entertainment",
  per_diem: "transportation",
  fuel: "transportation",
  parking_toll: "transportation",
  other: "other",
};
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
const PENANDA = "[Dipindahkan dari Reimbursement Dinas";

const signedUrl = (path) => {
  const t = LINK_SECRET ? createHmac("sha256", LINK_SECRET).update(path).digest("base64url") : "";
  return `${ORIGIN}/api/payment-requests/file?path=${encodeURIComponent(path)}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
};

function stamp(iso) {
  const d = new Date(iso ?? Date.now());
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(Number.isNaN(d.getTime()) ? new Date() : d);
  const p = Object.fromEntries(parts.map((b) => [b.type, b.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

const invoiceLine = (r) =>
  [r.invoice_date ? r.invoice_date.split("-").reverse().join("/") : "", r.description?.trim(), r.vendor_name?.trim()]
    .filter(Boolean).join(" - ");

/** Salin satu objek antar bucket; abaikan bila memang sudah ada di tujuan. */
async function salinBerkas(path) {
  const { error } = await db.storage.from("reimbursement-files").copy(path, path, {
    destinationBucket: "payment-files",
  });
  if (!error) return "disalin";
  if (/exist/i.test(error.message)) return "sudah ada";
  // Cadangan: unduh lalu unggah ulang bila copy lintas-bucket tidak didukung.
  const { data: file, error: dlErr } = await db.storage.from("reimbursement-files").download(path);
  if (dlErr || !file) return `GAGAL (${error.message})`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from("payment-files").upload(path, buf, {
    contentType: file.type || "application/octet-stream", upsert: true,
  });
  return upErr ? `GAGAL (${upErr.message})` : "disalin (unduh-unggah)";
}

const { data: klaim, error } = await db
  .from("travel_reimbursements").select("*").order("requested_at", { ascending: true });
if (error) { console.error("Gagal membaca klaim:", error.message); process.exit(1); }
if (!klaim?.length) { console.log("Tidak ada klaim untuk dipindahkan."); process.exit(0); }

const { data: sudah } = await db
  .from("payment_requests").select("more_details").like("more_details", `%${PENANDA}%`);
const sudahDipindah = new Set((sudah ?? []).map((r) => (r.more_details.match(/TR-\d+/) || [""])[0]));

console.log(`${klaim.length} klaim ditemukan.\n`);
const untukSheet = [];

for (const k of klaim) {
  if (sudahDipindah.has(k.code)) { console.log(`• ${k.code} — dilewati (sudah dipindahkan)`); continue; }

  const paths = k.receipt_paths ?? [];
  for (const p of paths) console.log(`• ${k.code} berkas ${p.split("/").pop()} → ${await salinBerkas(p)}`);
  if (paths.length === 0) { console.log(`• ${k.code} — DILEWATI: tidak punya berkas kuitansi`); continue; }

  const { data: emp } = await db.from("employees").select("name, email").eq("id", k.employee_id).maybeSingle();
  const disetujui = k.status === "approved";

  const row = {
    employee_id: k.employee_id,
    department: "sales", // Oka = Sales Field; klaim lama tidak punya kolom departemen
    requester_name: emp?.name ?? "—",
    email: emp?.email ?? "",
    kind: KIND_BY_CATEGORY[k.category] ?? "other",
    kind_other: null,
    invoice_date: k.expense_date,
    description: k.description,
    vendor_name: null,
    total_amount: Math.round(Number(k.amount) || 0),
    invoice_paths: paths,
    // Klaim lama tidak punya berkas "persetujuan atasan" terpisah — kuitansi
    // pertama dipakai agar kolom wajib ini terisi berkas yang memang nyata.
    approval_path: paths[0],
    due_date: null,
    more_details: [
      k.purpose ? `Keperluan: ${k.purpose}` : null,
      k.receipt_number ? `No. kuitansi: ${k.receipt_number}` : null,
      k.start_date && k.end_date ? `Perjalanan: ${k.start_date} s/d ${k.end_date}` : null,
      `${PENANDA} ${k.code}]`,
    ].filter(Boolean).join(" · "),
    submitted_at: k.requested_at,
    flow: "dinas",
    approval_status: disetujui ? "approved" : "waiting_ops",
    ops_approver: k.manager_approver,
    ops_approved_at: k.manager_approved_at,
    finance_approver: k.hr_approver,
    finance_approved_at: k.hr_approved_at,
    sheet_status: "pending",
  };

  const { data: baru, error: insErr } = await db.from("payment_requests").insert(row).select("*").single();
  if (insErr || !baru) { console.log(`  ✗ ${k.code} gagal dipindahkan: ${insErr?.message}`); continue; }
  console.log(`  ✓ ${k.code} → pengajuan ${disetujui ? "DISETUJUI" : "menunggu Ops"} (${row.description})`);
  if (disetujui) untukSheet.push(baru);
}

if (!PUSH_SHEET) {
  console.log(`\n${untukSheet.length} baris siap dikirim ke sheet — jalankan ulang dengan --push-sheet.`);
  process.exit(0);
}
if (untukSheet.length === 0) { console.log("\nTidak ada baris disetujui yang perlu dikirim ke sheet."); process.exit(0); }
if (!WEBHOOK_URL) { console.error("\nSHEETS_WEBHOOK_URL belum diisi — tidak bisa kirim ke sheet."); process.exit(1); }

console.log("\nMengirim baris yang sudah disetujui ke Google Sheet…");
for (const r of untukSheet) {
  const values = [
    stamp(r.submitted_at), SHEET_DEPT[r.department] ?? r.department, r.requester_name, r.email,
    SHEET_KIND[r.kind] ?? r.kind, invoiceLine(r), Number(r.total_amount),
    (r.invoice_paths ?? []).map(signedUrl).join(", "), r.due_date ?? "", r.more_details ?? "",
    r.approval_path ? signedUrl(r.approval_path) : "",
  ];
  const res = await fetch(WEBHOOK_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: WEBHOOK_SECRET, values }),
  });
  const text = (await res.text()).slice(0, 200);
  const gagal = !res.ok || /error|unauthor/i.test(text);
  await db.from("payment_requests").update(
    gagal
      ? { sheet_status: "failed", sheet_error: `webhook_${res.status}:${text}`.slice(0, 300) }
      : { sheet_status: "synced", sheet_synced_at: new Date().toISOString(), sheet_error: null },
  ).eq("id", r.id);
  console.log(`  ${gagal ? "✗" : "✓"} ${invoiceLine(r)}${gagal ? ` — ${res.status} ${text}` : ""}`);
}
console.log("\nSelesai.");

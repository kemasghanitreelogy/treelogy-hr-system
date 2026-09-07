/**
 * QA: modul Pelanggan Eligible
 *
 *   node --env-file=.env.local scripts/qa-eligible-customers.mjs          # semua
 *   node scripts/qa-eligible-customers.mjs --offline                      # tanpa jaringan
 *
 * Bagian OFFLINE menguji pengurai berkas impor (CSV/XLSX) dan validasi —
 * termasuk jebakan yang pernah/berpotensi menggigit: BOM, pemisah `;`, kutip,
 * satu kolom nama, email kembar, baris kosong di tengah XLSX (nomor baris
 * harus tetap sama dengan yang dilihat orang di Excel), berkas tanpa judul.
 *
 * Bagian LIVE (butuh COMBINED_DISCOUNT_API_URL + COMBINED_DISCOUNT_ADMIN_SECRET
 * + ADMIN_API_KEY_COMBINED_DISCOUNT + STORE_NAME) memastikan kontrak backend
 * dan sifat IDEMPOTEN-nya: grant yang sama dua kali → customer yang sama,
 * `created:false`, tag tidak menggandakan, metafield tetap sentinel. Ini
 * jawaban untuk "kalau file yang sama diimpor lagi, tidak double kan?".
 * Hanya menyentuh SATU email uji tetap (eligible-test@treelogy.com).
 */
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const offlineOnly = process.argv.includes("--offline");

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// ── Muat parse.ts + validate.ts lewat strip-types ─────────────────────────────
// Sumbernya mengimpor "./validate" tanpa ekstensi (aturan bundler), sedangkan
// Node butuh ekstensi eksplisit — disalin ke folder sementara dengan impor
// yang ditulis ulang. Logikanya tidak disentuh.
const tmp = mkdtempSync(join(tmpdir(), "qa-eligible-"));
const src = (p) => readFileSync(join(root, "src/lib/eligible-customers", p), "utf8");
writeFileSync(join(tmp, "validate.ts"), src("validate.ts"));
// `import("exceljs")` di salinan sementara tidak bisa menemukan node_modules
// repo — ditunjuk langsung ke berkasnya.
const exceljsUrl = pathToFileURL(require.resolve("exceljs")).href;
writeFileSync(
  join(tmp, "parse.ts"),
  src("parse.ts")
    .replace(`"use client";`, "")
    .replace(`from "./validate"`, `from "./validate.ts"`)
    .replace(`import("exceljs")`, `import(${JSON.stringify(exceljsUrl)})`),
);
const { parseCsv, gridToImport, parseXlsx, templateCsv } = await import(pathToFileURL(join(tmp, "parse.ts")).href);
const { isValidEmail, normalizeEmail, isValidSeedDate, MAX_BULK_ROWS } = await import(pathToFileURL(join(tmp, "validate.ts")).href);

console.log("\n[offline] validasi");
check("email valid", isValidEmail("budi.santoso+vip@example.co.id"));
check("email tanpa domain ditolak", !isValidEmail("budi@"));
check("email dengan spasi ditolak", !isValidEmail("bu di@example.com"));
check("normalizeEmail: trim + lowercase", normalizeEmail("  Budi@Example.COM ") === "budi@example.com");
check("seedDate valid", isValidSeedDate("2000-01-01"));
check("seedDate 30 Feb ditolak", !isValidSeedDate("2001-02-30"));
check("MAX_BULK_ROWS kecil (≤10)", MAX_BULK_ROWS <= 10, String(MAX_BULK_ROWS));

console.log("\n[offline] CSV");
{
  const csv = "﻿email;nama;tags\r\n\"Budi@Example.com\";\"Budi Santoso\";\"vip; reseller\"\r\nsari@example.com;Sari;\r\nbad-email;X;\r\nbudi@example.com;Dup;\r\n\r\n";
  const g = parseCsv(csv);
  check("BOM dibuang, pemisah ; dikenali", g[0][0] === "email" && g[0].length === 3);
  const p = gridToImport(g);
  check("judul dikenali", p.hadHeader && p.columns.email === 0 && p.columns.fullName === 1);
  check("4 baris data", p.rows.length === 4);
  check("email diseragamkan", p.rows[0].email === "budi@example.com");
  check("nama satu kolom dipecah", p.rows[0].firstName === "Budi" && p.rows[0].lastName === "Santoso");
  check("tag dipecah", p.rows[0].tags.join(",") === "vip,reseller");
  check("email rusak ditandai", p.rows[2].problem === "invalid_email");
  check("kembar ditandai (bukan yang pertama)", p.rows[3].problem === "duplicate" && p.rows[0].problem === null);
  check("nomor baris = baris berkas", p.rows[0].line === 2 && p.rows[3].line === 5);
}
{
  const p = gridToImport(parseCsv("a@b.co,Ani,Wati\nc@d.co\n"));
  check("tanpa judul: urutan template", !p.hadHeader && p.rows[0].firstName === "Ani" && p.rows[0].lastName === "Wati" && p.rows[1].email === "c@d.co");
}
{
  const p = gridToImport(parseCsv(templateCsv()));
  check("contoh CSV terbaca utuh", p.rows.length === 2 && p.rows.every((r) => !r.problem));
  check("contoh CSV tanpa kolom tags", !/tags/.test(templateCsv().split("\n")[0]));
}
{
  let code = null;
  try { gridToImport([["nama", "kota"], ["x", "y"]]); } catch (e) { code = e.code; }
  check("tanpa kolom email → no_email_column", code === "no_email_column");
  try { gridToImport([["", ""]]); } catch (e) { code = e.code; }
  check("berkas kosong → empty", code === "empty");
}
{
  const p = gridToImport(parseCsv('email,"first name","last name"\n"o\'brien@ex.com","Mary ""M""","O\'Brien"\n'));
  check("kutip ganda di dalam sel", p.rows[0].firstName === 'Mary "M"');
  check("judul dengan spasi dikenali", p.columns.firstName === 1 && p.columns.lastName === 2);
}

console.log("\n[offline] XLSX (ExcelJS, dengan baris kosong di tengah)");
{
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pelanggan");
  ws.addRow(["Email", "Nama Depan", "Nama Belakang"]);
  ws.addRow(["x1@example.com", "Satu", "A"]);
  ws.addRow([]);                        // baris 3 kosong
  ws.addRow(["x2@example.com", "Dua", "B"]);
  ws.getCell("A6").value = { text: "x3@example.com", hyperlink: "mailto:x3@example.com" }; // baris 6, hyperlink
  const buf = await wb.xlsx.writeBuffer();
  const grid = await parseXlsx(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const p = gridToImport(grid);
  check("3 baris data terbaca", p.rows.length === 3, JSON.stringify(p.rows.map((r) => r.email)));
  check("nomor baris tidak bergeser oleh baris kosong", p.rows.map((r) => r.line).join(",") === "2,4,6", p.rows.map((r) => r.line).join(","));
  check("sel hyperlink mailto dibaca teksnya", p.rows[2]?.email === "x3@example.com");
}

// ── LIVE ─────────────────────────────────────────────────────────────────────
if (!offlineOnly) {
  const base = (process.env.COMBINED_DISCOUNT_API_URL || "").replace(/\/+$/, "");
  const secret = process.env.COMBINED_DISCOUNT_ADMIN_SECRET || "";
  const store = process.env.STORE_NAME;
  const cdToken = process.env.ADMIN_API_KEY_COMBINED_DISCOUNT;
  if (!base || !secret || !store || !cdToken) {
    console.log("\n[live] dilewati — env COMBINED_DISCOUNT_* / STORE_NAME / ADMIN_API_KEY_COMBINED_DISCOUNT kosong");
  } else {
    console.log("\n[live] kontrak backend");
    const post = async (body, s = secret) => {
      const res = await fetch(`${base}/api/admin/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": s },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    };
    const gql = async (query, variables) => {
      const res = await fetch(`https://${store}/admin/api/2026-07/graphql.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": cdToken, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      return (await res.json()).data;
    };

    check("secret salah → 401", (await post({}, "salah")).status === 401);
    check("body kosong → 422", (await post({})).status === 422);
    const probe = `qa-409-probe-${Date.now()}@treelogy.com`;
    check("campaignKeys tak dikenal → 409", (await post({ email: probe, campaignKeys: ["cd_tidakada"] })).status === 409);
    const probed = await gql(`query($i: CustomerIdentifierInput!){ customerByIdentifier(identifier:$i){ id } }`, { i: { emailAddress: probe } });
    check("409 tidak meninggalkan customer", probed?.customerByIdentifier === null);

    console.log("\n[live] idempoten — email uji tetap");
    const email = "eligible-test@treelogy.com";
    const a = await post({ email, firstName: "Uji", lastName: "Eligible", tags: ["uji-workspace"] });
    const b = await post({ email, firstName: "Uji", lastName: "Eligible", tags: ["uji-workspace"] });
    check("grant pertama 200", a.status === 200, JSON.stringify(a.json));
    check("grant kedua 200", b.status === 200, JSON.stringify(b.json));
    check("customerId sama (tidak double)", a.json?.customerId && a.json.customerId === b.json?.customerId);
    check("created:false (customer lama dipakai)", a.json?.created === false && b.json?.created === false);
    check("seeded sentinel 2000-01-01", b.json?.seeded?.firstPurchaseAt === "2000-01-01");
    const c = await post({ email, customerId: a.json?.customerId });
    check("dengan customerId → 200, ID sama", c.status === 200 && c.json?.customerId === a.json?.customerId);
    const cust = await gql(
      `query($id: ID!){ customer(id:$id){ tags metafield(namespace:"$app", key:"combined-discount-state"){ jsonValue } } }`,
      { id: a.json?.customerId },
    );
    const tags = cust?.customer?.tags ?? [];
    check("tag tidak menggandakan", new Set(tags).size === tags.length && tags.includes("admin-created"), tags.join(","));
    check("metafield firstPurchaseAt sentinel", cust?.customer?.metafield?.jsonValue?.firstPurchaseAt === "2000-01-01");
    const camps = cust?.customer?.metafield?.jsonValue?.campaigns ?? [];
    check("entry campaign tidak menggandakan", new Set(camps.map((x) => x.key)).size === camps.length);
  }
}

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);

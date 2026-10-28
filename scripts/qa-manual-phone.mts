#!/usr/bin/env node --experimental-strip-types
/**
 * Penjaga pencocokan ulang dari nomor HP yang DIKETIK di kartu.
 *
 * Label yang 4 digit HP-nya tidak terbaca jatuh ke "Manual / WA" tanpa order,
 * dan dulu nomor yang lalu diketik tidak pernah dipakai mencari ordernya —
 * akibatnya label itu tidak pernah ikut fulfill. Uji ini memastikan:
 * nomor yang benar menemukan order yang tepat, nomor yang salah tidak
 * menemukan apa pun, nama yang berbeda tetap ditolak walau HP cocok, order
 * yang sudah diklaim halaman lain digeser ke order kedua pembeli, dan order
 * tanpa HP tidak pernah dianggap pasti.
 *
 * Tanpa jaringan: fetch Shopify di-stub. Jalankan:
 *   node --experimental-strip-types --no-warnings scripts/qa-manual-phone.mts
 */
process.env.STORE_NAME = "test.myshopify.com";
process.env.ADMIN_API_KEY = "x";

const addr = (name: string, phone: string, zip = "55281") => ({ name, address1: "Jl. Kenanga 3", city: "Sleman", province: "DIY", zip, phone });
const orders = [
  // Dua "Siti Aminah" di kodepos yang sama — tanpa HP, nama + kodepos tidak cukup.
  { name: "#2002", legacyResourceId: "2002", createdAt: "2026-10-25T10:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: addr("Siti Aminah", "081311221122") },
  { name: "#2001", legacyResourceId: "2001", createdAt: "2026-10-25T09:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: addr("Siti Aminah", "085677887788") },
  // Pembeli yang memesan dua kali (HP sama).
  { name: "#2011", legacyResourceId: "2011", createdAt: "2026-10-25T08:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: addr("Rina Wulandari", "081255554321", "40111") },
  { name: "#2010", legacyResourceId: "2010", createdAt: "2026-10-24T08:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: addr("Rina Wulandari", "081255554321", "40111") },
  // Order tanpa HP sama sekali.
  { name: "#2020", legacyResourceId: "2020", createdAt: "2026-10-25T07:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: addr("Agus Pratama", "", "60111") },
];

globalThis.fetch = (async (_url: string, init: any) => {
  const q = JSON.parse(init.body).variables.q as string;
  const [, from] = q.match(/created_at:>=(\S+)/)!;
  const [, to] = q.match(/created_at:<=(\S+)/)!;
  const edges = orders
    .filter((o) => o.createdAt.slice(0, 10) >= from && o.createdAt.slice(0, 10) <= to)
    .map((node) => ({ node }));
  return new Response(JSON.stringify({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges } } }), { status: 200 });
}) as any;

// Kode aplikasi mengimpor tanpa ekstensi (gaya Next); Node butuh ".ts".
const { registerHooks } = await import("node:module");
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) { if (spec.startsWith(".")) return next(spec + ".ts", ctx); throw e; }
  },
});
const { matchAll, matchManual } = await import("../src/lib/receipt/shopify.ts");

const DATE = "2026-10-26";
const siti = { page: 1, name: "SITI AMINAH", zip: "55281", phoneLast4: "", shipDate: DATE, destCity: "SLEMAN", labelDate: DATE };

let gagal = 0;
const cek = (kondisi: boolean, pesan: string) => { console.log((kondisi ? "✓ " : "✗ ") + pesan); if (!kondisi) gagal++; };

// Kondisi awal: HP tidak terbaca → tidak pasti (ini yang membuat kartu jadi "Manual / WA").
const awal = (await matchAll([siti])).get(1)!;
cek(awal.confidence !== "certain", `tanpa HP, dua Siti Aminah sekodepos → tidak pasti (${awal.confidence}: ${awal.flag})`);

const benar = await matchManual({ ...siti, phoneLast4: "7788" }, [], DATE);
cek(benar.confidence === "certain" && benar.orderName === "#2001", `HP diketik ...7788 → #2001 pasti (dapat ${benar.orderName}, ${benar.confidence})`);

const lain = await matchManual({ ...siti, phoneLast4: "1122" }, [], DATE);
cek(lain.confidence === "certain" && lain.orderName === "#2002", `HP diketik ...1122 → #2002 (Siti yang satunya)`);

const salah = await matchManual({ ...siti, phoneLast4: "9999" }, [], DATE);
cek(salah.confidence !== "certain" && !salah.legacyId, `HP salah ...9999 → tidak ada order (dapat ${salah.orderName ?? "-"})`);

const namaBeda = await matchManual({ ...siti, name: "BUDI SANTOSO", phoneLast4: "7788" }, [], DATE);
cek(namaBeda.confidence !== "certain", "HP cocok tapi nama beda → tetap ditolak");

const rina = { page: 2, name: "RINA WULANDARI", zip: "40111", phoneLast4: "4321", shipDate: DATE, labelDate: DATE };
const rina1 = await matchManual(rina, [], DATE);
cek(rina1.confidence === "certain" && rina1.orderName === "#2011", `pembeli dua order, belum ada klaim → terbaru #2011`);
const rina2 = await matchManual(rina, ["2011"], DATE);
cek(rina2.confidence === "certain" && rina2.orderName === "#2010", `#2011 sudah diklaim halaman lain → digeser ke #2010 (dapat ${rina2.orderName})`);
const rina3 = await matchManual(rina, ["2011", "2010"], DATE);
cek(rina3.orderName === "#2011", "kedua order diklaim → pemenang asli dikembalikan (penjaga kembar di klien yang menahan)");

const agus = await matchManual({ page: 3, name: "AGUS PRATAMA", zip: "60111", phoneLast4: "5555", shipDate: DATE, labelDate: DATE }, [], DATE);
cek(agus.confidence !== "certain", "order tanpa HP tidak pernah pasti dari nomor ketikan");

process.exit(gagal ? 1 : 0);

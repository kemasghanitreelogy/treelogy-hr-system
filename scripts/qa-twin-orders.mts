#!/usr/bin/env node --experimental-strip-types
/**
 * Penjaga pembagian order kembar (pembeli yang memesan dua kali).
 *
 * Dua label dari pembeli yang sama punya sinyal identik (nama, HP, kodepos)
 * dan dulu keduanya menang di order yang sama — salah satunya terpaksa
 * dilewati padahal ordernya memang dua. Uji ini memastikan: label kedua
 * digeser ke order kedua yang belum terkirim, label ketiga (tanpa order
 * bebas) tetap ditahan sebagai kembar, order lama yang sudah terkirim tidak
 * pernah dijadikan sasaran, dan pembeli lain tidak tersentuh.
 *
 * Tanpa jaringan: fetch Shopify di-stub. Jalankan:
 *   node --experimental-strip-types --no-warnings scripts/qa-twin-orders.mts
 */
process.env.STORE_NAME = "test.myshopify.com";
process.env.ADMIN_API_KEY = "x";

const buyer = { name: "Dewi Lestari", address1: "Jl. Mawar 1", city: "Sleman", province: "DIY", zip: "55281", phone: "081234565309" };
const orders = [
  // Pool diurutkan terbaru dulu (Shopify reverse:true).
  { name: "#1002", legacyResourceId: "1002", createdAt: "2026-09-09T10:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: buyer },
  { name: "#1001", legacyResourceId: "1001", createdAt: "2026-09-08T09:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: buyer },
  // Order lama pembeli yang sama, sudah terkirim, di luar jendela 3 hari.
  { name: "#0900", legacyResourceId: "900", createdAt: "2026-08-20T09:00:00Z", displayFulfillmentStatus: "FULFILLED", shippingAddress: buyer },
  // Orang lain.
  { name: "#1003", legacyResourceId: "1003", createdAt: "2026-09-09T11:00:00Z", displayFulfillmentStatus: "UNFULFILLED", shippingAddress: { name: "Budi Santoso", address1: "Jl. Melati", city: "Bandung", province: "Jabar", zip: "40111", phone: "081200001111" } },
];

let calls = 0;
globalThis.fetch = (async (_url: string, init: any) => {
  calls++;
  const q = JSON.parse(init.body).variables.q as string;
  const [, from] = q.match(/created_at:>=(\S+)/)!;
  const [, to] = q.match(/created_at:<=(\S+)/)!;
  const edges = orders
    .filter((o) => o.createdAt.slice(0, 10) >= from && o.createdAt.slice(0, 10) <= to)
    .map((node) => ({ node }));
  return new Response(JSON.stringify({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges } } }), { status: 200 });
}) as any;

const { matchAll } = await import("../src/lib/receipt/shopify.ts");

const label = (page: number) => ({ page, name: "DEWI LESTARI", zip: "55281", phoneLast4: "5309", shipDate: "2026-09-10", destCity: "SLEMAN", labelDate: "2026-09-10" });
const res = await matchAll([label(1), label(2), label(3), { page: 4, name: "BUDI SANTOSO", zip: "40111", phoneLast4: "1111", shipDate: "2026-09-10", labelDate: "2026-09-10" }]);

let gagal = 0;
const cek = (kondisi: boolean, pesan: string) => { console.log((kondisi ? "✓ " : "✗ ") + pesan); if (!kondisi) gagal++; };
const p1 = res.get(1)!, p2 = res.get(2)!, p3 = res.get(3)!, p4 = res.get(4)!;
console.log([1, 2, 3, 4].map((p) => `hal.${p}: ${res.get(p)!.orderName} (${res.get(p)!.confidence}) twins=${JSON.stringify(res.get(p)!.twinPages)} alt=${res.get(p)!.alternates.map((a) => a.orderName).join("/")}`).join("\n"));
cek(p1.confidence === "certain" && p1.orderName === "#1002", "halaman 1 tetap di pemenang terbaru #1002");
cek(p2.confidence === "certain" && p2.orderName === "#1001", "halaman 2 digeser ke order kedua pembeli #1001");
cek(p1.legacyId !== p2.legacyId, "dua label → dua order berbeda");
cek(p3.confidence === "certain" && p3.orderName === "#1002", "halaman 3 (label ketiga) tetap kembar di #1002 — tak ada order bebas (#0900 sudah terkirim)");
cek(JSON.stringify(p1.twinPages) === "[1,2]" && JSON.stringify(p2.twinPages) === "[1,2]", "twinPages hal.1 & 2 = [1,2]");
cek(p3.twinPages.length === 0, "halaman 3 bukan bagian kelompok terbagi");
cek(p1.alternates.some((a) => a.legacyId === "1001") && p2.alternates.some((a) => a.legacyId === "1002"), "alternates saling menyebut order pasangannya");
cek(!p1.alternates.some((a) => a.legacyId === "900"), "order lama di luar jendela tidak jadi alternatif");
cek(p4.orderName === "#1003" && p4.alternates.length === 0 && p4.twinPages.length === 0, "pembeli lain tidak terpengaruh");
cek(p4.legacyId !== p1.legacyId && p4.legacyId !== p2.legacyId, "orang lain tidak diklaim");
console.log(`(fetch dipanggil ${calls}×)`);
process.exit(gagal ? 1 : 0);

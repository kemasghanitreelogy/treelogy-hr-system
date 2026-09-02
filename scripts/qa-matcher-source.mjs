#!/usr/bin/env node
/**
 * Penjaga sumber bukti pencocokan.
 *
 * Nama/HP/alamat yang dipakai mencocokkan label WAJIB berasal dari
 * `shippingAddress` milik ORDER, bukan dari catatan pelanggan. Bedanya nyata:
 * pada order #10692 pelanggannya tercatat "Christine Henry Effendi" tanpa
 * nomor telepon, sedangkan alamat kirimnya "christine effendi" dengan
 * 081315977009 — dan label mencetak yang kedua. Satu pesanan juga bisa
 * dikirim ke orang lain (hadiah), sehingga data pelanggan sama sekali bukan
 * bukti tentang paket yang sedang berjalan.
 *
 * Pemeriksaan ini statis dan tanpa jaringan, jadi murah dijalankan kapan pun.
 */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/receipt/shopify.ts", import.meta.url), "utf8");
const gagal = [];

// 1. Query pool tidak boleh meminta blok customer atau telepon order.
const query = src.slice(src.indexOf("const POOL_QUERY"), src.indexOf("`;", src.indexOf("const POOL_QUERY")));
if (/\bcustomer\s*[{(]/.test(query)) gagal.push("POOL_QUERY meminta blok customer");
if (!/shippingAddress\s*{/.test(query)) gagal.push("POOL_QUERY tidak meminta shippingAddress");
// Buang dulu isi blok shippingAddress — `phone` di DALAMNYA justru yang benar;
// yang dilarang adalah phone yang menggantung di tingkat order.
const tanpaAlamat = query.replace(/shippingAddress\s*{[^}]*}/g, " ");
if (/\bphone\b/.test(tanpaAlamat)) gagal.push("POOL_QUERY meminta phone di tingkat order");
if (/\bemail\b/.test(tanpaAlamat)) gagal.push("POOL_QUERY meminta email di tingkat order");

// 2. Setiap bukti dirakit dari shippingAddress (variabel `a`).
const parse = src.slice(src.indexOf("const a = e.node.shippingAddress"), src.indexOf("cursor = conn?.pageInfo"));
for (const [medan, pola] of [
  ["shipName", /shipName:\s*a\./], ["phone", /phone:\s*a\./],
  ["zip", /zip:\s*digits\(a\./], ["place", /place:\s*\[a\?\.city, a\?\.province\]/],
]) if (!pola.test(parse)) gagal.push(`${medan} tidak diambil dari shippingAddress`);

// 3. Tidak ada jalur cadangan diam-diam ke data pelanggan.
if (/\bcustomer\b/i.test(src)) gagal.push("berkas matcher menyebut 'customer' — periksa manual");

if (gagal.length) {
  console.error("✗ penjaga sumber bukti GAGAL:");
  for (const g of gagal) console.error("   - " + g);
  process.exit(1);
}
console.log("✓ semua bukti pencocokan bersumber dari shippingAddress order (bukan data pelanggan)");

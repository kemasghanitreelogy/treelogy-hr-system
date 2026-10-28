#!/usr/bin/env node --experimental-strip-types
/**
 * Penjaga fondasi Qontak: tanda tangan HMAC, pemetaan variabel template,
 * normalisasi nomor WhatsApp, dan pemilihan template resi per kurir.
 *
 * Yang paling mahal kalau salah: urutan variabel blast_resi_lion ({{1}}=resi,
 * {{2}}=nama) KEBALIKAN blast_resi_jnt ({{1}}=nama, {{2}}=resi). Teks template
 * di bawah disalin persis dari Qontak (27 Okt 2026).
 *
 * Jalankan: node --experimental-strip-types --no-warnings scripts/qa-qontak-core.mts
 */
import { signRequest } from "../src/lib/qontak/sign.ts";
import { buildDirectParameters, courierKey, guessMeaning, renderPreview, slotId, toWaTemplate } from "../src/lib/qontak/template.ts";
import { displayWaPhone, normalizeWaPhone } from "../src/lib/qontak/phone.ts";

let gagal = 0;
const cek = (ok: boolean, msg: string) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) gagal++; };

// ── HMAC: vektor dihitung terpisah dengan `openssl dgst -sha256 -hmac` ──
const auth = signRequest("POST", "/v2/klikpajak/v1/efaktur/out?auto_approval=false", "cid", "contoh-secret", "Wed, 10 Nov 2021 07:24:29 GMT");
cek(auth.includes('signature="xcKdbf4G/M6FCUjNnTFyjiW5MAiZ4nI88nt+fwp+3NQ="'), "HMAC cocok dengan vektor OpenSSL (query ikut ditandatangani)");
cek(auth.startsWith('hmac username="cid", algorithm="hmac-sha256", headers="date request-line"'), "format header Authorization sesuai dokumentasi Mekari");

// ── Template resi ──
const ekor = "\nLink Tracking: https://x\n\nTerima kasih sudah mempercayakan kesehatan kakak dengan Treelogy.";
const lion = toWaTemplate({ id: "L", name: "blast_resi_lion", language: "id", category: "UTILITY", status: "APPROVED", header: null, buttons: [],
  body: "Halo Kak {{2}}! 🌿\nPesanan kakak sudah kami kirimkan ya. Berikut nomor resi & link trackingnya: \n\nNo. resi: {{1}}" + ekor });
const jnt = toWaTemplate({ id: "J", name: "blast_resi_jnt", language: "id", category: "UTILITY", status: "APPROVED", header: null, buttons: [],
  body: "Halo Kak {{1}}! 🌿\nPesanan kakak sudah kami kirimkan ya. Berikut nomor resi & link trackingnya: \n\nNo. resi: {{2}}" + ekor });

const arti = (t: ReturnType<typeof toWaTemplate>) => Object.fromEntries(t.slots.map((s) => [s.key, s.meaning]));
cek(JSON.stringify(arti(lion)) === JSON.stringify({ 1: "awb", 2: "name" }), `Lion: {{1}}=resi, {{2}}=nama → ${JSON.stringify(arti(lion))}`);
cek(JSON.stringify(arti(jnt)) === JSON.stringify({ 1: "name", 2: "awb" }), `JNT: {{1}}=nama, {{2}}=resi → ${JSON.stringify(arti(jnt))}`);

// Nilai diisi BERDASARKAN MAKNA, seperti yang dilakukan alur Receipt Sales.
const isi = (t: ReturnType<typeof toWaTemplate>, name: string, awb: string) =>
  Object.fromEntries(t.slots.map((s) => [slotId(s), s.meaning === "name" ? name : s.meaning === "awb" ? awb : ""]));
const vLion = isi(lion, "Siti", "99LP123456789");
const vJnt = isi(jnt, "Siti", "JD0123456789");
cek(renderPreview(lion, vLion).startsWith("Halo Kak Siti! 🌿") && renderPreview(lion, vLion).includes("No. resi: 99LP123456789"), "pratinjau Lion: nama di sapaan, resi di baris resi");
cek(renderPreview(jnt, vJnt).startsWith("Halo Kak Siti! 🌿") && renderPreview(jnt, vJnt).includes("No. resi: JD0123456789"), "pratinjau JNT: nama di sapaan, resi di baris resi");

const pLion = buildDirectParameters(lion, vLion);
cek(JSON.stringify(pLion.body) === JSON.stringify([
  { key: "1", value_text: "99LP123456789", value: "resi" },
  { key: "2", value_text: "Siti", value: "customer_name" },
]), "payload Lion: key 1 = resi, key 2 = nama (sesuai skema direct Qontak)");
cek(renderPreview(lion, { "body:1": "X" }).includes("⟨2⟩"), "variabel kosong terlihat ⟨2⟩ di pratinjau, bukan hilang diam-diam");

const tombol = toWaTemplate({ id: "B", name: "x", language: "id", category: "MARKETING", status: "APPROVED", header: { format: "IMAGE" },
  body: "Hai {{1}}", buttons: [{ type: "URL", text: "Bayar", url: "https://pay.example/{{1}}" }] });
cek(tombol.slots.some((s) => s.part === "button" && s.buttonIndex === 0) && tombol.mediaHeader === "IMAGE", "slot tombol URL dinamis + header gambar dikenali");
const pTombol = buildDirectParameters(tombol, { "body:1": "Ani", "button:0": "INV9" }, { url: "https://cdn/x.png", filename: "x.png" });
cek(pTombol.buttons?.[0].value === "INV9" && pTombol.header?.format === "IMAGE", "payload tombol & header media terbentuk");
const teksVar = toWaTemplate({ id: "T", name: "t", language: "id", category: "MARKETING", status: "APPROVED", header: { format: "TEXT", text: "Promo {{1}}" }, body: "Hai", buttons: [] });
cek(teksVar.unsupported === "header_text_variable", "header teks bervariabel ditolak terang-terangan (tak ada tempatnya di payload direct)");
cek(guessMeaning("Hi kak ") === "name" && guessMeaning("Nomor resi: ") === "awb" && guessMeaning("Total Rp ") === "custom" && guessMeaning("*Hey **") === "name", "tebakan makna: sapaan → nama, resi → awb, lain → custom");

// ── Nomor WhatsApp ──
const hp: [string, string | null][] = [
  ["0812-3456-7890", "6281234567890"], ["+62 812 3456 7890", "6281234567890"], ["6281234567890", "6281234567890"],
  ["812345678", "62812345678"], ["(0812) 3456 789", "628123456789"], ["021-5551234", null], ["0812", null],
  ["0812345678901234", null], ["", null], ["+1 415 555 0100", "14155550100"], ["62 21 555 1234", null], ["08123456789", "628123456789"],
  // Kerusakan khas CSV/XLSX:
  ["6281234567890.0", "6281234567890"],      // sel angka Excel → buntut .0 (dulu jadi 62812345678900!)
  ["81234567890", "6281234567890"],          // nol depan hilang
  ["6.28123E+12", null],                     // notasi ilmiah — digit hilang, TOLAK
  ["+62 0812-3456-7890", "6281234567890"],   // nol ganda setelah 62
  ["620812345678", "62812345678"],
  ["0062812345678", "62812345678"],          // awalan internasional 00
  ["'081234567890", "6281234567890"],        // apostrof Excel
  ["0812\u00A03456\u200B7890", "6281234567890"], // spasi tak terlihat
  ["0812-3456-7890 / 0813-1111-2222", "6281234567890"], // dua nomor
  ["0812.3456.7890", "6281234567890"],       // titik sebagai pemisah
  ["WA: 0812 3456 7890", "6281234567890"],
  [6281234567890 as unknown as string, "6281234567890"], // sel numerik mentah
];
for (const [masuk, harap] of hp) {
  const m = typeof masuk === "string" ? masuk.replace(/\\u([0-9A-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : masuk;
  const r = normalizeWaPhone(m);
  cek(harap === null ? !r.ok : r.ok && r.phone === harap, `HP ${JSON.stringify(masuk)} → ${r.ok ? r.phone + (r.fixes.length ? " [" + r.fixes.join(",") + "]" : "") : "ditolak (" + r.problem + ")"}`);
}
cek(displayWaPhone("6281139603993") === "+62 811-3960-3993", "tampilan +62 811-3960-3993");
// Klien mengirim "+" + hasil normalisasi, server menormalisasi ULANG — harus
// menghasilkan nomor yang sama (dulu +65 lolos di layar lalu ditolak server).
for (const masuk of ["+6586271943", "0812 3456 7890", "+60 12-345 6789", "6281234567890.0"]) {
  const a = normalizeWaPhone(masuk);
  const b = a.ok ? normalizeWaPhone("+" + a.phone) : a;
  cek(a.ok && b.ok && b.phone === a.phone, `normalisasi ulang di server stabil: ${masuk} → ${a.ok ? a.phone : "?"}`);
}

// ── Kurir → template ──
cek(courierKey("J&T Express") === "JNT" && courierKey("Lion Parcel") === "LION" && courierKey("JNE") === "JNE" && courierKey("SiCepat") === null,
  "kurir label → template resi (J&T/Lion/JNE; lainnya tidak ditebak)");

process.exit(gagal ? 1 : 0);

/**
 * Uji pemetaan review marketplace → baris ledger.
 *
 * Perlu bundel dulu (normalize.ts memakai "server-only" yang tidak ada di Node):
 *   npx esbuild scripts/_qa-entry.ts --bundle --format=esm --platform=node \
 *     --alias:@=./src --alias:server-only=<berkas-kosong> --outfile=/tmp/mp.mjs
 *   node scripts/qa-marketplace.mjs /tmp/mp.mjs
 */
const m = await import(process.argv[2] ?? "/tmp/mp.mjs");
// Bentuk balasan /api/v2/item/get_ratings, disalin dari kontrak publiknya.
const mentah = {
  cmtid: 987654321, itemid: 890123456, shopid: 1234567,
  rating_star: 5, comment: "Barangnya bagus, pengiriman cepat!",
  ctime: 1756800000, author_username: "risa***ja", anonymous: false,
  product_items: [{ model_name: "270 Kapsul" }],
  images: ["id-11134207-abc123", "https://cdn.example/sudah-utuh.jpg"],
  ItemRatingReply: { comment: "Terima kasih kak!" },
  _productId: "1234567_890123456", _shopifyHandle: "organic-moringa-capsules",
};
const n = m.normalize("shopee", mentah);
const row = m.toRow("shopee", n, "2026-09-03T00:00:00.000Z");
const cek = [
  ["ID review dari cmtid", n.feedbackId === "987654321"],
  ["rating dari rating_star", n.rating === 5],
  ["varian dari product_items", n.variantName === "270 Kapsul"],
  ["balasan penjual terbaca", n.reply === "Terima kasih kak!"],
  ["hash foto → URL CDN", n.pictureUrls[0].startsWith("https://down-id.img.susercontent.com/file/")],
  ["URL yang sudah utuh tidak digandakan", n.pictureUrls[1] === "https://cdn.example/sudah-utuh.jpg"],
  ["foto Shopee TIDAK kedaluwarsa", row.pictures_expire_at === null],
  ["waktu dari ctime, bukan epoch", row.review_at === "2025-09-02T08:00:00.000Z"],
  ["source tersimpan di baris", row.source === "shopee"],
  ["rating sah", m.validRating(n) === true],
  ["tanpa ctime → pakai waktu tarik", m.toRow("shopee", m.normalize("shopee", {...mentah, ctime:0}), "2026-09-03T00:00:00.000Z").review_at === "2026-09-03T00:00:00.000Z"],
  ["rating 0 ditolak", m.validRating(m.normalize("shopee", {...mentah, rating_star:0})) === false],
  ["ID shopee sah", m.validProductId("shopee","1234567_890123456") === true],
  ["ID shopee tanpa garis bawah ditolak", m.validProductId("shopee","890123456") === false],
  ["ID tokopedia tetap sah", m.validProductId("tokopedia","1731010208236603355") === true],
  ["tautan produk terbentuk", m.productUrl("shopee","1234567_890123456") === "https://shopee.co.id/product/1234567/890123456"],
];
let gagal = 0;
for (const [nama, ok] of cek) { if (!ok) gagal++; console.log(`  ${ok?"✓":"✗"} ${nama}`); }
console.log(`\n  ${cek.length - gagal}/${cek.length} lulus`);
process.exit(gagal ? 1 : 0);

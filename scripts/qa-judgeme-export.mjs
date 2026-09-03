// Uji keamanan CSV Judge.me. Perlu bundel esbuild dulu (lihat qa-marketplace.mjs).
const m = await import(process.argv[2] ?? "/tmp/jm.mjs");
const buat = (o) => ({ source:"tokopedia", feedbackId:"1", productId:"p", shopifyHandle:"h",
  productName:"P", rating:5, body:"bagus", reviewAt:"2026-06-18T00:00:00Z", reviewerName:"S***h",
  isAnonymous:false, variantName:null, reply:null, pictureUrls:[], picturesExpireAt:null,
  firstSeenAt:"2026-06-18T00:00:00Z", exportedAt:null, ...o });

const PERMANEN = "https://xdeatdtzigbzfzksyxcm.supabase.co/storage/v1/object/public/review-photos/tokopedia/1-0.jpg";
const SEMENTARA = "https://images.tokopedia.net/img/abc.jpg?x-expires=123&x-signature=zzz";

const cek = [
  ["foto penyimpanan sendiri = permanen", m.fotoPermanen(PERMANEN) === true],
  ["foto marketplace = TIDAK permanen",   m.fotoPermanen(SEMENTARA) === false],
  ["hitung foto tak terbawa",             m.fotoTidakTerbawa([buat({pictureUrls:[PERMANEN, SEMENTARA, SEMENTARA]})]) === 2],
];

// CSV hanya membawa yang permanen
const row = m.toJudgeMeRow(buat({ pictureUrls:[SEMENTARA, PERMANEN] }), "masked");
cek.push(["CSV membuang tautan sementara", row.picture_urls === PERMANEN]);
cek.push(["CSV kosong bila semua sementara",
  m.toJudgeMeRow(buat({ pictureUrls:[SEMENTARA] }), "masked").picture_urls === ""]);

// cf_source tetap membawa asal
cek.push(["cf_source menyebut sumber", row.cf_source === "tokopedia:1"]);

// CSV utuh
const csv = m.buildJudgeMeCsv([buat({ pictureUrls:[PERMANEN] })], "masked");
cek.push(["CSV punya header + 1 baris", csv.trim().split("\n").length === 2]);
cek.push(["CSV tidak memuat tautan mati", !csv.includes("x-expires")]);

let gagal = 0;
for (const [n, ok] of cek) { if (!ok) gagal++; console.log(`  ${ok?"✓":"✗"} ${n}`); }
console.log(`\n  ${cek.length-gagal}/${cek.length} lulus`);
process.exit(gagal ? 1 : 0);

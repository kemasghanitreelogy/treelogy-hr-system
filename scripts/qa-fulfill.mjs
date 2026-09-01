/**
 * QA aturan "Tandai terkirim di Shopify".
 *   npx esbuild --bundle --format=esm --platform=node --alias:@=./src \
 *     --outfile=/tmp/ct.mjs src/lib/receipt/courier-tracking.ts && node scripts/qa-fulfill.mjs /tmp/ct.mjs
 *
 * Menguji hal-hal yang KELIRUNYA menulis ke pesanan sungguhan: kurir salah
 * kenal, nomor resi cacat, dan ID order palsu. Aturan bentuknya disalin persis
 * dari lib/receipt/fulfill.ts — kalau di sana berubah, ubah juga di sini.
 */
const { courierTracking } = await import(process.argv[2] ?? "/tmp/ct.mjs");
let pass = 0, fail = 0;
const cek = (nama, aktual, harap) => {
  const ok = JSON.stringify(aktual) === JSON.stringify(harap);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${nama}${ok ? "" : `  (dapat ${JSON.stringify(aktual)}, harap ${JSON.stringify(harap)})`}`);
};

console.log("— pengenalan kurir —");
cek("J&T Express",            courierTracking("J&T Express")?.company, "J&T Express");
cek("JNT tanpa ampersand",    courierTracking("JNT")?.company, "J&T Express");
cek("Global Jet Express",     courierTracking("GLOBAL JET EXPRESS")?.company, "J&T Express");
cek("Lion Parcel",            courierTracking("Lion Parcel")?.company, "Lion Parcel");
cek("lionparcel huruf kecil", courierTracking("lionparcel")?.company, "Lion Parcel");
cek("JNE",                    courierTracking("JNE")?.company, "JNE");
cek("JNE Express",            courierTracking("JNE Express")?.company, "JNE");
cek("kosong -> null",         courierTracking(""), null);
cek("null -> null",           courierTracking(null), null);
cek("SiCepat (tak didukung)", courierTracking("SiCepat"), null);
cek("Ninja (tak didukung)",   courierTracking("Ninja Xpress"), null);

console.log("\n— tautan lacak —");
cek("J&T url",   courierTracking("J&T")?.trackUrl("JD123"), "https://jet.co.id/track");
cek("Lion url",  courierTracking("Lion Parcel")?.trackUrl("11LP1"), "https://lionparcel.com/track/stt");
cek("JNE url",   courierTracking("JNE")?.trackUrl("X"), "https://jne.co.id/tracking-package");

console.log("\n— bentuk AWB (aturan server) —");
const awbOk = (v) => /^[A-Za-z0-9-]{6,40}$/.test(v);
cek("AWB Lion sah",      awbOk("11LP1788182996987"), true);
cek("AWB J&T sah",       awbOk("JD0123456789"), true);
cek("tolak spasi",       awbOk("11LP 1788"), false);
cek("tolak terlalu pendek", awbOk("123"), false);
cek("tolak kosong",      awbOk(""), false);
cek("tolak simbol",      awbOk("11LP<script>"), false);

console.log("\n— ID order (aturan server) —");
const idOk = (v) => /^\d{1,25}$/.test(v);
cek("angka sah",         idOk("6543210987654"), true);
cek("tolak gid penuh",   idOk("gid://shopify/Order/1"), false);
cek("tolak huruf",       idOk("abc"), false);

console.log(`\nlulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);

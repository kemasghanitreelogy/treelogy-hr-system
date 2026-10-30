/**
 * QA jalur bulk (bagian murni): CSV contact list, putaran nomor unik,
 * pemetaan variabel → kolom. Jalankan: node --experimental-strip-types scripts/qa-wa-bulk.mts
 */
import { registerHooks } from "node:module";
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) { if (spec.startsWith(".")) return next(spec + ".ts", ctx); throw e; }
  },
});
const { buildCsv, bulkEligible, bulkParameters, pickRound } = await import("../src/lib/qontak/bulk-core.ts");
const { buildDirectParameters } = await import("../src/lib/qontak/template.ts");

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

// Template Lion: {{1}} = resi, {{2}} = nama (urutan kebalikan J&T).
const tpl = {
  id: "t", name: "blast_resi_lion", language: "id", body: "", mediaHeader: null, unsupported: false,
  slots: [
    { part: "body", key: "1", meaning: "awb", context: "" },
    { part: "body", key: "2", meaning: "name", context: "" },
  ],
} as never;
const row = (id: string, phone: string, name: string, awb: string) => ({
  id, phone, name, params: buildDirectParameters(tpl, { "body:1": awb, "body:2": name }),
});
const rows = [
  row("a", "6281200000001", 'Budi, "Pak" RT', "11LP1"),
  row("b", "6281200000002", "Sari\nDewi", "11LP2"),
  row("c", "6281200000001", "Budi, \"Pak\" RT", "11LP3"),
];

const round = pickRound(rows);
ok(round.length === 2 && round.map((r) => r.id).join() === "a,b", "satu nomor sekali per contact list (resi kedua menyusul)");

const csv = buildCsv(round).trim().split("\n");
ok(csv[0] === "phone_number,full_name,resi,customer_name", "header CSV = kolom variabel dari params");
ok(csv[1] === '6281200000001,"Budi, ""Pak"" RT",11LP1,"Budi, ""Pak"" RT"', "koma & tanda kutip di-escape");
ok(csv[2] === "6281200000002,Sari Dewi,11LP2,Sari Dewi", "baris baru dalam nama tidak memecah CSV");

const p = bulkParameters(round);
ok(JSON.stringify(p.body.map((b) => [b.key, b.value])) === '[["1","resi"],["2","customer_name"]]', "{{1}}→resi, {{2}}→customer_name (Lion tidak tertukar)");
ok(!("header" in p), "tanpa header media bila template tidak punya");

ok(bulkEligible(rows.map((r) => r.params)), "template tanpa tombol → bulk");
ok(!bulkEligible([{ body: [], buttons: [{ index: "0", type: "url", value: "x" }] }]), "template bertombol dinamis → direct");

if (fail) { console.error(`${fail} gagal`); process.exit(1); }
console.log("semua lulus");

/**
 * QA skrip Apps Script penulis sheet pembayaran (scripts/apps-script/payment-sheet.gs)
 * — dijalankan di Node dengan tiruan SpreadsheetApp/LockService/ContentService,
 * jadi logikanya teruji TANPA menyentuh sheet keuangan sungguhan.
 *
 *   node scripts/qa-payment-sheet-script.mjs
 *
 * Skenario yang dijaga (semuanya lahir dari kejadian nyata):
 *   1. Baris baru masuk dengan Request ID di baris yang sama.
 *   2. Kunci yang sudah ada + isi sama → dilewati, tidak ada baris kembar.
 *   3. appendRow yang diam-diam tidak menyimpan → ditulis lewat setValues
 *      (20 Okt 2026); bila itu pun gagal → balasan error, bukan "ok".
 *   4. Kunci nyasar di baris milik pengajuan lain → dibersihkan, baris benar ditulis.
 *   5. Baris ada tapi kuncinya tertimpa → kunci dipulihkan, tidak ada baris kembar.
 *   6. Rahasia salah → ditolak.
 *   7. Kejadian 21 Sep 2026 diputar ulang lalu dipulihkan dengan urutan kirim ulang.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const SECRET = "rahasia-uji";
const HEADER = [
  "Timestamp", "Department", "Name", "Email address", "Type of Reimbursement",
  "Invoice date - Description - Vendor Name", "Total Amount (numbers only)",
  "Attach your invoice here ", "Due date", "More details (if any)",
  "Attach proof of approval", "Status", "Source", "Date Payment", "Finance Remaks", "Request ID",
];
const KEY_COL = 16;

/**
 * Tiruan sheet: matriks nilai + saklar "appendRow diam-diam gagal" dan
 * "semua tulisan diam-diam gagal" (appendRow maupun setValues).
 */
function buatSheet(barisAwal = []) {
  const grid = [HEADER.slice(), ...barisAwal.map((r) => r.slice())];
  const lebar = () => Math.max(...grid.map((r) => r.length), 1);
  const rapikan = (r) => { while (r.length < lebar()) r.push(""); return r; };
  const sheet = {
    gagalDiamDiam: false,
    semuaGagal: false,
    maxRows: 1000,
    getLastRow: () => grid.length,
    getMaxRows: () => sheet.maxRows,
    insertRowsAfter: (_after, n) => { sheet.maxRows += n; },
    getFilter: () => null,
    getLastColumn: lebar,
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues: () => Array.from({ length: numRows }, (_, i) => {
          const r = grid[row - 1 + i] ?? [];
          return Array.from({ length: numCols }, (_, j) => r[col - 1 + j] ?? "");
        }),
        setValue: (v) => { while (grid.length < row) grid.push([]); rapikan(grid[row - 1])[col - 1] = v; },
        setValues: (vals) => {
          if (sheet.semuaGagal) return;
          if (row > sheet.maxRows) throw new Error("di luar grid");
          vals.forEach((r, i) => {
            while (grid.length < row + i) grid.push([]);
            const g = rapikan(grid[row - 1 + i]);
            r.forEach((v, j) => { g[col - 1 + j] = v; });
          });
        },
        clearContent: () => { if (grid[row - 1]) grid[row - 1][col - 1] = ""; },
      };
    },
    appendRow(values) { if (!sheet.gagalDiamDiam && !sheet.semuaGagal) grid.push(rapikan(values.slice())); },
    grid,
  };
  return sheet;
}

function muatSkrip(sheet) {
  const src = readFileSync(new URL("./apps-script/payment-sheet.gs", import.meta.url), "utf8")
    .replace("var SECRET   = 'SALIN_DARI_SKRIP_LAMA';", `var SECRET = '${SECRET}';`);
  const env = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush: () => {} },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { createTextOutput: (t) => ({ teks: t }) },
  };
  const fn = new Function(...Object.keys(env), `${src}\nreturn { doPost };`);
  return fn(...Object.values(env));
}

const kirim = (skrip, body) => skrip.doPost({ postData: { contents: JSON.stringify({ secret: SECRET, ...body }) } }).teks;
const nilai = (id, invoice, amount, email = "setiadi@treelogy.com") =>
  ["21/09/2026 07:45:10", "Farm", "Setiadi", email, "Petty Cash", invoice, amount, "", "", "", ""];
const kunciDi = (sheet, row) => sheet.grid[row - 1][KEY_COL - 1];
const barisDenganKunci = (sheet, k) => sheet.grid.findIndex((r) => r[KEY_COL - 1] === k) + 1;

let lulus = 0;
function uji(nama, f) { f(); lulus++; console.log(`  ✓ ${nama}`); }

uji("1. baris baru masuk dengan Request ID di baris yang sama", () => {
  const sheet = buatSheet();
  const s = muatSkrip(sheet);
  const b = kirim(s, { values: nilai("A", "21/09/2026 - Top up petty cash - Farm", 15000000), key: "A" });
  assert.equal(b, "ok:2");
  assert.equal(kunciDi(sheet, 2), "A");
  assert.equal(sheet.grid[1][5], "21/09/2026 - Top up petty cash - Farm");
});

uji("2. kunci sudah ada + isi sama → dilewati, tidak ada baris kembar", () => {
  const sheet = buatSheet();
  const s = muatSkrip(sheet);
  const v = nilai("A", "21/09/2026 - Top up petty cash - Farm", 15000000);
  kirim(s, { values: v, key: "A" });
  const b = kirim(s, { values: v, key: "A" });
  assert.equal(b, "ok:duplikat-dilewati:2");
  assert.equal(sheet.getLastRow(), 2);
});

uji("3a. appendRow diam-diam tidak menyimpan → ditulis lewat setValues", () => {
  const sheet = buatSheet([nilai("X", "18/09/2026 - BIJI KELOR - PT", 1500000).concat(["", "", "", "", "X"])]);
  sheet.maxRows = 2; // grid penuh: baris baru harus disisipkan dulu
  const s = muatSkrip(sheet);
  sheet.gagalDiamDiam = true;
  const b = kirim(s, { values: nilai("A", "21/09/2026 - Top up petty cash - Farm", 15000000), key: "A" });
  assert.equal(b, "ok:3:cadangan");
  assert.equal(kunciDi(sheet, 2), "X", "kunci baris lain tidak boleh tertimpa");
  assert.equal(kunciDi(sheet, 3), "A");
  assert.equal(sheet.grid[2][5], "21/09/2026 - Top up petty cash - Farm");
  // Kirim ulang tidak menambah baris.
  assert.equal(kirim(s, { values: nilai("A", "21/09/2026 - Top up petty cash - Farm", 15000000), key: "A" }), "ok:duplikat-dilewati:3");
  assert.equal(sheet.getLastRow(), 3);
});

uji("3b. semua tulisan diam-diam gagal → error berisi keadaan sheet, bukan ok", () => {
  const sheet = buatSheet([nilai("X", "18/09/2026 - BIJI KELOR - PT", 1500000).concat(["", "", "", "", "X"])]);
  const s = muatSkrip(sheet);
  sheet.semuaGagal = true;
  const b = kirim(s, { values: nilai("A", "21/09/2026 - Top up petty cash - Farm", 15000000), key: "A" });
  assert.match(b, /^error: baris tidak tersimpan \(lastRow 2→2→2, maxRows 1000, filter tidak\)$/);
  assert.equal(kunciDi(sheet, 2), "X", "kunci baris lain tidak boleh tertimpa");
  assert.equal(sheet.getLastRow(), 2);
});

uji("4. kunci nyasar di baris pengajuan lain → dibersihkan, baris benar ditulis", () => {
  // Baris 2 berisi BIJI KELOR tapi kuncinya "B" (milik minggu ke-3) — persis kejadian 21 Sep.
  const sheet = buatSheet([nilai("X", "18/09/2026 - BIJI KELOR - PT", 1500000, "ivanya@treelogy.com").concat(["", "", "", "", "B"])]);
  const s = muatSkrip(sheet);
  const b = kirim(s, { values: nilai("B", "21/09/2026 - Top up upah lorot minggu ke-3 - Farm", 12750000), key: "B" });
  assert.equal(b, "ok:3");
  assert.equal(kunciDi(sheet, 2), "", "kunci nyasar dilepas dari baris BIJI KELOR");
  assert.equal(kunciDi(sheet, 3), "B");
  assert.equal(sheet.grid[2][5], "21/09/2026 - Top up upah lorot minggu ke-3 - Farm");
});

uji("5. baris ada tapi kuncinya tertimpa → kunci dipulihkan, tanpa baris kembar", () => {
  const sheet = buatSheet([nilai("X", "18/09/2026 - BIJI KELOR - PT", 1500000, "ivanya@treelogy.com").concat(["", "", "", "", ""])]);
  const s = muatSkrip(sheet);
  const b = kirim(s, { values: nilai("X", "18/09/2026 - BIJI KELOR - PT", 1500000, "ivanya@treelogy.com"), key: "X" });
  assert.equal(b, "ok:kunci-dipulihkan:2");
  assert.equal(kunciDi(sheet, 2), "X");
  assert.equal(sheet.getLastRow(), 2);
});

uji("6. rahasia salah → ditolak", () => {
  const sheet = buatSheet();
  const s = muatSkrip(sheet);
  const b = s.doPost({ postData: { contents: JSON.stringify({ secret: "salah", values: nilai("A", "x", 1), key: "A" }) } }).teks;
  assert.equal(b, "error: unauthorized");
  assert.equal(sheet.getLastRow(), 1);
});

uji("7. kejadian 21 Sep diputar ulang, lalu dipulihkan urut: minggu ke-3 → BIJI KELOR → petty cash", () => {
  const kelor = nilai("K", "18/09/2026 - BIJI KELOR - PT", 1500000, "ivanya@treelogy.com");
  const petty = nilai("P", "21/09/2026 - Top up petty cash - Farm", 15000000);
  const minggu3 = nilai("M", "21/09/2026 - Top up upah lorot minggu ke-3 - Farm", 12750000);
  const sheet = buatSheet([kelor.concat(["", "", "", "", "M"])]); // keadaan sheet pagi ini: kunci K tertimpa M
  const s = muatSkrip(sheet);

  assert.equal(kirim(s, { values: minggu3, key: "M" }), "ok:3");
  assert.equal(kirim(s, { values: kelor, key: "K" }), "ok:kunci-dipulihkan:2");
  assert.equal(kirim(s, { values: petty, key: "P" }), "ok:4");

  assert.equal(sheet.getLastRow(), 4, "tepat dua baris baru, tidak ada kembar");
  assert.equal(barisDenganKunci(sheet, "K"), 2);
  assert.equal(barisDenganKunci(sheet, "M"), 3);
  assert.equal(barisDenganKunci(sheet, "P"), 4);
  // Kirim ulang apa pun setelah ini tidak menambah baris.
  assert.equal(kirim(s, { values: petty, key: "P" }), "ok:duplikat-dilewati:4");
  assert.equal(sheet.getLastRow(), 4);
});

uji("8. tanpa key (jalur lama) tetap menulis baris", () => {
  const sheet = buatSheet();
  const s = muatSkrip(sheet);
  assert.equal(kirim(s, { values: nilai("", "x - y - z", 10) }), "ok:2");
});

uji("9. action headers melaporkan versi skrip", () => {
  const sheet = buatSheet();
  const s = muatSkrip(sheet);
  const j = JSON.parse(kirim(s, { action: "headers" }));
  assert.equal(j.version, 4);
  assert.equal(j.lastRow, 1);
});

console.log(`\n${lulus} skenario lulus.`);

/**
 * Penulis baris "Payment Request Response Form" — versi anti-ganda, anti-lubang,
 * dan (sejak 21 Sep 2026) anti-"sukses palsu".
 *
 * Ini kelanjutan skrip yang sudah berjalan, bukan tulisan baru. Yang lama tetap
 * utuh: openById (proyek ini berdiri sendiri, bukan menempel di spreadsheet),
 * pemetaan lewat nama kolom (susunBaris), cabang diagnostik action:'headers',
 * appendRow, LockService, dan bentuk balasan 'ok:<baris>'.
 *
 * KEJADIAN 21 SEP 2026 yang melatari versi ini: dua pengajuan (07:45 & 07:46
 * WITA) dibalas "ok", padahal barisnya tidak pernah ada di sheet. appendRow tidak
 * melempar error, lalu getLastRow() masih menunjuk baris lama, sehingga Request
 * ID-nya ditulis MENIMPA kunci baris lain. Aplikasi percaya, Finance tidak
 * pernah melihat pengajuannya. Tiga hal ditutup di sini:
 *
 *   1. Kunci ditulis DI DALAM appendRow yang sama (satu baris, satu operasi),
 *      bukan "append lalu cari baris terakhir lalu setValue". Tidak ada lagi
 *      celah kunci nyasar ke baris orang lain.
 *
 *   2. Setelah menulis, baris DIBACA BALIK lewat kuncinya. Kalau tidak ketemu,
 *      balasannya 'error: baris tidak tersimpan' — aplikasi menandai "Belum
 *      masuk sheet" dan orangnya bisa kirim ulang. Sukses hanya diklaim kalau
 *      terbukti.
 *
 *   3. Kunci nyasar disembuhkan sendiri: bila kunci K ditemukan di baris yang
 *      ISINYA bukan pengajuan K, kunci itu dihapus dari sana dan baris K yang
 *      benar ditambahkan. Sebaliknya, bila kunci K belum ada tetapi ada baris
 *      berisi persis pengajuan K tanpa kunci (kuncinya sempat tertimpa), kunci
 *      dipasang ke baris itu — bukan menambah baris kembar.
 *
 * PASANG: ganti seluruh isi Code.gs dengan berkas ini (tiga baris konfigurasi
 * di bawah sudah sama dengan yang sekarang) → Deploy → Manage deployments →
 * edit deployment yang ada → New version → Deploy. URL tidak berubah, jadi
 * SHEETS_WEBHOOK_URL di Vercel tidak perlu disentuh. Cek terpasang-tidaknya:
 * action:'headers' membalas "version":4.
 *
 * VERSI 4 (20 Okt 2026): appendRow kembali diam-diam tidak menyimpan apa pun
 * (lastRow tetap 342, tiap kirim ulang pun sama) — kali ini terus-menerus,
 * bukan sekali lewat. appendRow tetap dicoba lebih dulu; bila barisnya tidak
 * terbukti ada, baris ditulis LANGSUNG ke baris kosong berikutnya lewat
 * setValues (grid diperluas dulu bila penuh), lalu dibaca balik lagi. Kalau
 * dua-duanya gagal, balasan error memuat keadaan sheet (lastRow sebelum/
 * sesudah, maxRows, filter) supaya penyebabnya terbaca dari aplikasi.
 */

var SECRET   = 'SALIN_DARI_SKRIP_LAMA';
var SHEET_ID = '1cBVWKsVpFRRmQzfC6rEhhKOKo90tPDzWBc1oN0pkcqg';
var TAB_NAME = 'Form responses 1';

/** Judul kolom kunci; dibuat otomatis di ujung kanan bila belum ada. */
var KEY_HEADER = 'Request ID';
/** Dibaca aplikasi/QA lewat action:'headers' untuk memastikan versi ini yang aktif. */
var SCRIPT_VERSION = 4;

/**
 * Posisi (0-based) kolom yang dipakai mencocokkan ISI baris dengan pengajuan:
 * email pengaju, baris invoice, dan total. Ketiganya mengikuti urutan `values`
 * yang dikirim aplikasi (A–K) — urutan itu sudah stabil ratusan baris.
 */
var COL_EMAIL = 3, COL_INVOICE = 5, COL_AMOUNT = 6;

function normalisasi(teks) {
  return String(teks == null ? '' : teks).toLowerCase().replace(/\s+/g, ' ').trim();
}
function ambilSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME);
}
function bacaHeader(sheet) {
  var lebar = sheet.getLastColumn();
  if (lebar < 1) return [];
  return sheet.getRange(1, 1, 1, lebar).getValues()[0];
}
function susunBaris(sheet, record) {
  var header = bacaHeader(sheet);
  var baris = new Array(header.length).fill('');
  var terpakai = {};
  for (var w = 0; w < header.length; w++) {
    if (normalisasi(header[w]).indexOf('timestamp') !== -1) {
      baris[w] = new Date();
      terpakai[w] = true;
      break;
    }
  }
  Object.keys(record).forEach(function (kunci) {
    var k = normalisasi(kunci);
    for (var i = 0; i < header.length; i++) {
      if (terpakai[i]) continue;
      var h = normalisasi(header[i]);
      if (h.indexOf(k) !== -1) { baris[i] = record[kunci]; terpakai[i] = true; return; }
    }
  });
  return baris;
}

/** Nomor kolom kunci (1-based); dibuat di ujung kanan bila belum ada. */
function kolomKunci(sheet) {
  var header = bacaHeader(sheet);
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === KEY_HEADER) return i + 1;
  }
  var kolom = Math.max(sheet.getLastColumn(), 1) + 1;
  sheet.getRange(1, kolom).setValue(KEY_HEADER);
  return kolom;
}

/** Semua kunci dari baris 2 ke bawah, sejajar dengan nomor baris (indeks 0 = baris 2). */
function bacaKolomKunci(sheet, kolom) {
  var akhir = sheet.getLastRow();
  if (akhir < 2) return [];
  return sheet.getRange(2, kolom, akhir - 1, 1).getValues().map(function (r) { return String(r[0]); });
}

/** Baris yang memuat kunci ini, atau 0 kalau belum ada. */
function cariBarisKunci(sheet, kolom, kunci) {
  var isi = bacaKolomKunci(sheet, kolom);
  for (var i = 0; i < isi.length; i++) {
    if (isi[i] === String(kunci)) return i + 2;
  }
  return 0;
}

/** Sidik jari isi satu baris: email + baris invoice + total, tahan beda spasi/huruf. */
function sidikJari(baris) {
  return [
    normalisasi(baris[COL_EMAIL]),
    normalisasi(baris[COL_INVOICE]),
    String(Number(baris[COL_AMOUNT]) || normalisasi(baris[COL_AMOUNT])),
  ].join('|');
}

/** Apakah isi baris ke-`nomor` di sheet adalah pengajuan yang sama dengan `baris`? */
function isiCocok(sheet, nomor, baris) {
  var lebar = Math.max(COL_AMOUNT + 1, baris.length);
  var ada = sheet.getRange(nomor, 1, 1, lebar).getValues()[0];
  return sidikJari(ada) === sidikJari(baris);
}

/**
 * Baris TANPA kunci yang isinya persis `baris`, dicari dari bawah (yang terbaru
 * dulu), atau 0. Dipakai memulihkan baris yang kuncinya sempat tertimpa.
 */
function cariBarisYatim(sheet, kolom, baris) {
  var kunciSemua = bacaKolomKunci(sheet, kolom);
  var target = sidikJari(baris);
  var akhir = sheet.getLastRow();
  if (akhir < 2) return 0;
  var lebar = Math.max(COL_AMOUNT + 1, baris.length);
  var semua = sheet.getRange(2, 1, akhir - 1, lebar).getValues();
  for (var i = semua.length - 1; i >= 0; i--) {
    if (kunciSemua[i] !== '') continue;
    if (sidikJari(semua[i]) === target) return i + 2;
  }
  return 0;
}

function doPost(e) {
  var kunciSkrip = LockService.getScriptLock();
  // Menunggu giliran, bukan menyerah: dua kiriman bersamaan harus menghasilkan
  // dua baris berurutan, bukan saling menimpa atau melompati baris.
  try {
    kunciSkrip.waitLock(30000);
  } catch (err) {
    return ContentService.createTextOutput('error: sedang sibuk, coba lagi');
  }

  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return ContentService.createTextOutput('error: unauthorized');
    var sheet = ambilSheet();
    if (!sheet) return ContentService.createTextOutput('error: tab not found');

    if (body.action === 'headers') {
      return ContentService.createTextOutput(JSON.stringify({
        headers: bacaHeader(sheet), lastRow: sheet.getLastRow(), version: SCRIPT_VERSION,
        maxRows: sheet.getMaxRows(), filter: !!sheet.getFilter()
      }));
    }

    var baris;
    if (body.record && typeof body.record === 'object') baris = susunBaris(sheet, body.record);
    else if (Array.isArray(body.values) && body.values.length > 0) baris = body.values.slice();
    else return ContentService.createTextOutput('error: empty values');

    var kunci = String(body.key || '');
    var kolom = kolomKunci(sheet);

    if (kunci) {
      var sudahAda = cariBarisKunci(sheet, kolom, kunci);
      if (sudahAda > 0) {
        if (isiCocok(sheet, sudahAda, baris)) {
          // Sudah pernah ditulis — jangan tulis lagi, dan tetap jawab "ok" supaya
          // aplikasi menandainya sudah masuk dan berhenti mencoba.
          return ContentService.createTextOutput('ok:duplikat-dilewati:' + sudahAda);
        }
        // Kunci nyasar: baris itu milik pengajuan lain. Lepaskan kuncinya dari
        // sana; baris pengajuan ini ditulis di bawah seperti biasa.
        sheet.getRange(sudahAda, kolom).clearContent();
      }

      // Baris ini pernah masuk tapi kuncinya tertimpa? Pasang kembali kuncinya,
      // jangan menambah baris kembar.
      var yatim = cariBarisYatim(sheet, kolom, baris);
      if (yatim > 0) {
        sheet.getRange(yatim, kolom).setValue(kunci);
        SpreadsheetApp.flush();
        return ContentService.createTextOutput('ok:kunci-dipulihkan:' + yatim);
      }

      // Kunci ikut di baris yang sama — bukan ditulis belakangan ke "baris terakhir".
      while (baris.length < kolom) baris.push('');
      baris[kolom - 1] = kunci;
    }

    var sebelum = sheet.getLastRow();
    sheet.appendRow(baris);
    // Dipaksa tersimpan sebelum diperiksa dan sebelum kunci dilepas, supaya
    // permintaan berikutnya melihat baris ini saat appendRow menghitung ujungnya.
    SpreadsheetApp.flush();

    if (kunci) {
      // Sukses hanya diklaim kalau barisnya TERBUKTI ada. Ini yang dulu tidak
      // ada: appendRow yang tidak menyimpan apa pun sempat dibalas "ok".
      var terbukti = cariBarisKunci(sheet, kolom, kunci);
      if (terbukti > 0) return ContentService.createTextOutput('ok:' + terbukti);

      // appendRow tidak menyimpan (20 Okt 2026) — tulis sendiri ke baris kosong
      // berikutnya. Kuncinya ada di baris yang sama, jadi pembacaan balik di
      // bawah tetap satu-satunya bukti sukses.
      var setelahAppend = sheet.getLastRow();
      var tujuan = setelahAppend + 1;
      if (sheet.getMaxRows() < tujuan) sheet.insertRowsAfter(sheet.getMaxRows(), tujuan - sheet.getMaxRows());
      sheet.getRange(tujuan, 1, 1, baris.length).setValues([baris]);
      SpreadsheetApp.flush();

      terbukti = cariBarisKunci(sheet, kolom, kunci);
      if (terbukti > 0) return ContentService.createTextOutput('ok:' + terbukti + ':cadangan');
      return ContentService.createTextOutput(
        'error: baris tidak tersimpan (lastRow ' + sebelum + '→' + setelahAppend + '→' + sheet.getLastRow() +
        ', maxRows ' + sheet.getMaxRows() + ', filter ' + (sheet.getFilter() ? 'ya' : 'tidak') + ')'
      );
    }
    return ContentService.createTextOutput('ok:' + sheet.getLastRow());
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  } finally {
    kunciSkrip.releaseLock();
  }
}

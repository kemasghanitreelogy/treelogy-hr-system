/**
 * Penulis baris "Payment Request Response Form" — versi anti-ganda & anti-lubang.
 *
 * Pasang: buka sheet → Extensions → Apps Script → ganti seluruh isi Code.gs
 * dengan berkas ini → Deploy → Manage deployments → edit deployment yang sudah
 * ada → New version → Deploy. URL-nya TIDAK berubah, jadi SHEETS_WEBHOOK_URL di
 * Vercel tidak perlu disentuh.
 *
 * Dua masalah yang diselesaikan skrip ini:
 *
 * 1. BARIS GANDA. Aplikasi bisa mengirim ulang sebuah pengajuan — misalnya saat
 *    balasan sebelumnya tidak terbaca padahal barisnya sudah tertulis. Skrip ini
 *    menyimpan id pengajuan di kolom kunci; kalau id itu sudah ada, baris tidak
 *    ditulis lagi dan balasannya tetap "ok".
 *
 * 2. LUBANG & URUTAN KACAU. Dua permintaan yang datang bersamaan sama-sama
 *    menghitung "baris terakhir", lalu menulis ke tempat yang sama atau
 *    melompat. LockService membuat keduanya antre, jadi tiap baris jatuh tepat
 *    setelah baris terakhir yang benar.
 */

/** Rahasia yang sama dengan SHEETS_WEBHOOK_SECRET di Vercel. */
var SECRET = 'GANTI_DENGAN_ISI_SHEETS_WEBHOOK_SECRET';

/** Nama tab tujuan. */
var TAB = 'Form responses 1';

/** Judul kolom kunci — dibuat otomatis di kolom paling kanan bila belum ada. */
var KEY_HEADER = 'Request ID';

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Menunggu giliran, bukan menyerah: dua kiriman bersamaan harus tetap
  // menghasilkan dua baris berurutan, bukan satu baris yang saling menimpa.
  try {
    lock.waitLock(30000);
  } catch (err) {
    return out('error: sibuk, coba lagi');
  }

  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return out('unauthorized');

    var values = body.values || [];
    var key = body.key || '';
    if (!values.length) return out('error: tidak ada nilai');

    var sheet = SpreadsheetApp.getActive().getSheetByName(TAB);
    if (!sheet) return out('error: tab tidak ditemukan');

    var keyCol = keyColumn_(sheet);

    // Sudah pernah ditulis? Jangan tulis lagi — dan tetap jawab "ok", supaya
    // aplikasi menandainya sudah masuk dan berhenti mencoba.
    if (key && findKeyRow_(sheet, keyCol, key) > 0) {
      return out('ok duplicate-skipped');
    }

    var row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    if (key) sheet.getRange(row, keyCol).setValue(key);

    // Dipaksa tersimpan sebelum kunci dilepas, supaya permintaan berikutnya
    // melihat baris ini saat menghitung baris terakhir.
    SpreadsheetApp.flush();
    return out('ok ' + row);
  } catch (err) {
    return out('error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

/** Nomor kolom kunci; dibuat di ujung kanan bila belum ada. */
function keyColumn_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === KEY_HEADER) return i + 1;
  }
  var col = lastCol + 1;
  sheet.getRange(1, col).setValue(KEY_HEADER);
  return col;
}

/** Baris yang memuat kunci ini, atau 0 kalau belum ada. */
function findKeyRow_(sheet, col, key) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var keys = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(key)) return i + 2;
  }
  return 0;
}

function out(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

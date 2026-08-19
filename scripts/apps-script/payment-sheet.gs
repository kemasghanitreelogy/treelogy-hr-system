/**
 * Penulis baris "Payment Request Response Form" — versi anti-ganda & anti-lubang.
 *
 * Ini kelanjutan skrip yang sudah berjalan, bukan tulisan baru. Yang lama tetap
 * utuh: openById (proyek ini berdiri sendiri, bukan menempel di spreadsheet),
 * pemetaan lewat nama kolom (susunBaris), cabang diagnostik action:'headers',
 * appendRow, dan bentuk balasan 'ok:<baris>'.
 *
 * TIGA TAMBAHAN, masing-masing menjawab satu gejala nyata di sheet:
 *
 *   1. LockService — dua permintaan yang datang bersamaan kini mengantre.
 *      Tanpa ini, keduanya menghitung "baris terakhir" yang sama; itulah sebab
 *      baris melompat dan lubang seperti baris 190–194.
 *
 *   2. Kolom kunci "Request ID" — id pengajuan ikut ditulis. Bila id yang sama
 *      datang lagi (aplikasi mengirim ulang karena balasan sebelumnya tidak
 *      terbaca), barisnya TIDAK ditulis dua kali. Ini yang mencegah kembar
 *      seperti dua "Pest Control Jul" berstempel detik yang sama.
 *
 *   3. flush() — baris dipastikan tersimpan sebelum kunci dilepas, supaya
 *      permintaan berikutnya menghitung dari keadaan yang sudah benar.
 *
 * PASANG: ganti seluruh isi Code.gs dengan berkas ini (tiga baris konfigurasi
 * di bawah sudah sama dengan yang sekarang) → Deploy → Manage deployments →
 * edit deployment yang ada → New version → Deploy. URL tidak berubah, jadi
 * SHEETS_WEBHOOK_URL di Vercel tidak perlu disentuh.
 */

var SECRET   = 'SALIN_DARI_SKRIP_LAMA';
var SHEET_ID = '1cBVWKsVpFRRmQzfC6rEhhKOKo90tPDzWBc1oN0pkcqg';
var TAB_NAME = 'Form responses 1';

/** Judul kolom kunci; dibuat otomatis di ujung kanan bila belum ada. */
var KEY_HEADER = 'Request ID';

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

/** Nomor kolom kunci; dibuat di ujung kanan bila belum ada. */
function kolomKunci(sheet) {
  var header = bacaHeader(sheet);
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === KEY_HEADER) return i + 1;
  }
  var kolom = Math.max(sheet.getLastColumn(), 1) + 1;
  sheet.getRange(1, kolom).setValue(KEY_HEADER);
  return kolom;
}

/** Baris yang memuat kunci ini, atau 0 kalau belum ada. */
function cariBarisKunci(sheet, kolom, kunci) {
  var akhir = sheet.getLastRow();
  if (akhir < 2) return 0;
  var isi = sheet.getRange(2, kolom, akhir - 1, 1).getValues();
  for (var i = 0; i < isi.length; i++) {
    if (String(isi[i][0]) === String(kunci)) return i + 2;
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
        headers: bacaHeader(sheet), lastRow: sheet.getLastRow()
      }));
    }

    var kunci = body.key || '';
    var kolom = kolomKunci(sheet);

    // Sudah pernah ditulis? Jangan tulis lagi — dan tetap jawab "ok", supaya
    // aplikasi menandainya sudah masuk dan berhenti mencoba.
    if (kunci && cariBarisKunci(sheet, kolom, kunci) > 0) {
      return ContentService.createTextOutput('ok:duplikat-dilewati');
    }

    var baris;
    if (body.record && typeof body.record === 'object') baris = susunBaris(sheet, body.record);
    else if (Array.isArray(body.values) && body.values.length > 0) baris = body.values;
    else return ContentService.createTextOutput('error: empty values');

    sheet.appendRow(baris);
    var nomorBaris = sheet.getLastRow();
    if (kunci) sheet.getRange(nomorBaris, kolom).setValue(kunci);

    // Dipaksa tersimpan sebelum kunci dilepas, supaya permintaan berikutnya
    // melihat baris ini saat appendRow menghitung ujung datanya.
    SpreadsheetApp.flush();
    return ContentService.createTextOutput('ok:' + nomorBaris);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  } finally {
    kunciSkrip.releaseLock();
  }
}

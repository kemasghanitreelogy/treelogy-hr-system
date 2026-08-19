/**
 * Penulis baris "Payment Request Response Form" — versi anti-ganda & anti-lubang.
 *
 * CARA PASANG
 *   1. Buka proyek Apps Script yang sekarang → berkas Code.gs.
 *   2. SALIN TIGA BARIS KONFIGURASI dari skrip lama (SECRET, SHEET_ID,
 *      TAB_NAME) — nilainya jangan diketik ulang, cukup disalin apa adanya.
 *   3. Ganti SELURUH isi Code.gs dengan berkas ini, lalu tempel kembali ketiga
 *      nilai itu di bawah.
 *   4. Deploy → Manage deployments → edit deployment yang ada → New version →
 *      Deploy. URL-nya tidak berubah, jadi SHEETS_WEBHOOK_URL di Vercel aman.
 *
 * YANG DIPERTAHANKAN dari skrip lama: pembukaan sheet lewat openById (proyek
 * ini berdiri sendiri, bukan menempel di sheet — getActive() akan kosong), dan
 * pemetaan berdasarkan nama kolom bila aplikasi mengirim `record`.
 *
 * YANG DITAMBAHKAN — dua masalah nyata yang terlihat di sheet:
 *
 *   1. BARIS GANDA (mis. dua "Pest Control Jul" berstempel detik yang sama).
 *      Aplikasi bisa mengirim ulang sebuah pengajuan, misalnya saat balasan
 *      sebelumnya tidak terbaca padahal barisnya sudah tertulis. Kini id
 *      pengajuan ikut dikirim dan disimpan di kolom kunci; bila id itu sudah
 *      ada, baris tidak ditulis lagi dan jawabannya tetap "ok".
 *
 *   2. LUBANG & URUTAN KACAU (baris 190–194 kosong, stempel waktu melompat).
 *      Dua permintaan yang datang bersamaan sama-sama menghitung "baris
 *      terakhir" lalu menulis ke tempat yang keliru. LockService membuat
 *      keduanya mengantre, dan flush() memastikan baris pertama sudah tersimpan
 *      sebelum yang kedua menghitung.
 */

/* ── SALIN TIGA NILAI INI DARI SKRIP LAMA ───────────────────────────── */
var SECRET   = 'SALIN_DARI_SKRIP_LAMA';
var SHEET_ID = '1cBVWKsVpFRRmQzfC6rEhhKOKo90tPDzWBc1oN0pkcqg';
var TAB_NAME = 'Form responses 1';
/* ───────────────────────────────────────────────────────────────────── */

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

/** Susun baris menurut NAMA kolom (dipakai bila aplikasi mengirim `record`). */
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
  var lebar = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lebar).getValues()[0];
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === KEY_HEADER) return i + 1;
  }
  var kolom = lebar + 1;
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

function balas(teks) {
  return ContentService.createTextOutput(teks).setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var kunciSkrip = LockService.getScriptLock();
  // Menunggu giliran, bukan menyerah: dua kiriman bersamaan harus tetap
  // menghasilkan dua baris berurutan, bukan saling menimpa atau melompat.
  try {
    kunciSkrip.waitLock(30000);
  } catch (err) {
    return balas('error: sedang sibuk, coba lagi');
  }

  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return balas('unauthorized');

    var sheet = ambilSheet();
    if (!sheet) return balas('error: tab tidak ditemukan');

    var kunci = body.key || '';
    var kolomKunciNo = kolomKunci(sheet);

    // Sudah pernah ditulis? Jangan tulis lagi — dan tetap jawab "ok", supaya
    // aplikasi menandainya sudah masuk dan berhenti mencoba.
    if (kunci && cariBarisKunci(sheet, kolomKunciNo, kunci) > 0) {
      return balas('ok duplikat-dilewati');
    }

    // Aplikasi versi sekarang mengirim `values` (urutan kolom). `record`
    // dipertahankan untuk versi lama yang memetakan lewat nama kolom.
    var baris = body.record ? susunBaris(sheet, body.record) : (body.values || []);
    if (!baris.length) return balas('error: tidak ada nilai');

    var nomorBaris = sheet.getLastRow() + 1;
    sheet.getRange(nomorBaris, 1, 1, baris.length).setValues([baris]);
    if (kunci) sheet.getRange(nomorBaris, kolomKunciNo).setValue(kunci);

    // Dipaksa tersimpan sebelum kunci dilepas, supaya permintaan berikutnya
    // melihat baris ini saat menghitung baris terakhir.
    SpreadsheetApp.flush();
    return balas('ok ' + nomorBaris);
  } catch (err) {
    return balas('error: ' + err);
  } finally {
    kunciSkrip.releaseLock();
  }
}

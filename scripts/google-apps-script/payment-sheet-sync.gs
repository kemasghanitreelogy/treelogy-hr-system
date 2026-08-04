/**
 * Treelogy HR — penerima baris "Pengajuan Pembayaran" untuk Google Sheet keuangan.
 *
 * Pasang di spreadsheet "Payment Request Response Form":
 *   1. Extensions → Apps Script
 *   2. Hapus isi Code.gs, tempel SELURUH berkas ini
 *   3. Deploy → New deployment → Web app
 *        Execute as     : Me (akun yang punya akses editor)
 *        Who has access : Anyone
 *   4. Salin URL yang berakhiran /exec
 *
 * Rahasianya dicocokkan dengan env SHEETS_WEBHOOK_SECRET di aplikasi, sehingga
 * URL yang bocor pun tidak bisa dipakai menulis baris palsu.
 */

var SECRET   = 'tHFaXUWoC1L7bQ_VAWhNhfouty4GyxN1';
var SHEET_ID = '1cBVWKsVpFRRmQzfC6rEhhKOKo90tPDzWBc1oN0pkcqg';
var TAB_NAME = 'Form responses 1';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.secret !== SECRET) {
      return ContentService.createTextOutput('error: unauthorized');
    }
    if (!Array.isArray(body.values) || body.values.length === 0) {
      return ContentService.createTextOutput('error: empty values');
    }

    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME);
    if (!sheet) return ContentService.createTextOutput('error: tab not found');

    sheet.appendRow(body.values);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

/**
 * Jalankan sekali dari editor (pilih fungsi ini → Run) untuk menguji tanpa
 * aplikasi. Kalau berhasil, satu baris uji muncul di sheet — hapus manual.
 */
function ujiTambahBaris() {
  SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME)
    .appendRow(['UJI ' + new Date(), 'Finance', 'Uji Skrip', 'uji@treelogy.com',
                'Petty Cash', 'UJI - hapus baris ini', 1, '', '', '', '']);
}

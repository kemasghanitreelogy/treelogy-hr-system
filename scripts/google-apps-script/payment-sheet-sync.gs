/**
 * Treelogy Workspace — penerima baris "Pengajuan Pembayaran" untuk Google Sheet keuangan.
 *
 * Pasang di Apps Script milik spreadsheet "Payment Request Response Form",
 * lalu Deploy → Web app (Execute as: Me, Who has access: Anyone).
 *
 * PENTING — nilai ditempatkan berdasarkan NAMA KOLOM, bukan urutan. Skrip membaca
 * baris header lalu mencocokkan setiap field ke kolomnya. Akibatnya:
 *   · urutan kolom tidak mungkin salah tempat,
 *   · Finance boleh menggeser/menyisipkan kolom tanpa merusak integrasi,
 *   · kolom yang tidak dikenali dibiarkan kosong, bukan menimpa data lain.
 *
 * Rahasianya dicocokkan dengan env SHEETS_WEBHOOK_SECRET di aplikasi, sehingga
 * URL yang bocor pun tidak bisa dipakai menulis baris palsu.
 */

var SECRET   = 'GANTI_DENGAN_RAHASIA_ANDA'; // biarkan nilai lama Anda saat menempel ulang
var SHEET_ID = '1cBVWKsVpFRRmQzfC6rEhhKOKo90tPDzWBc1oN0pkcqg';
var TAB_NAME = 'Form responses 1';

/** Samakan bentuk teks header agar pencocokan tahan beda spasi/baris/huruf besar. */
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

/**
 * Bangun satu baris dari pasangan {kunci: nilai}. `kunci` cukup penggalan awal
 * nama kolom (mis. "total amount"), karena header di sheet ini memuat contoh
 * penggunaan pada baris kedua sel yang sama.
 */
function susunBaris(sheet, record) {
  var header = bacaHeader(sheet);
  var baris = new Array(header.length).fill('');
  var terpakai = {};

  // Kolom waktu diisi SKRIP dengan objek Date sungguhan, bukan teks dari aplikasi.
  // Sheet ini adalah "Form responses" dan kolom Timestamp-nya berformat tanggal-waktu;
  // Google Form pun menulisnya sebagai Date. Mengirim teks membuat selnya berakhir
  // kosong. Dengan cara ini kolom waktu TIDAK PERNAH kosong, apa pun yang dikirim.
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
      if (h.indexOf(k) === 0 || h.indexOf(k) !== -1) {
        baris[i] = record[kunci];
        terpakai[i] = true;
        return;
      }
    }
    // Tidak ketemu kolomnya → sengaja diabaikan, jangan menimpa kolom lain.
  });

  return baris;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) {
      return ContentService.createTextOutput('error: unauthorized');
    }

    var sheet = ambilSheet();
    if (!sheet) return ContentService.createTextOutput('error: tab not found');

    // Mode baca-header (dipakai QA untuk memverifikasi pemetaan kolom).
    if (body.action === 'headers') {
      return ContentService.createTextOutput(JSON.stringify({
        headers: bacaHeader(sheet),
        lastRow: sheet.getLastRow(),
      }));
    }

    var baris;
    if (body.record && typeof body.record === 'object') {
      baris = susunBaris(sheet, body.record);
    } else if (Array.isArray(body.values) && body.values.length > 0) {
      baris = body.values; // jalur lama (posisi), tetap didukung
    } else {
      return ContentService.createTextOutput('error: empty values');
    }

    sheet.appendRow(baris);
    return ContentService.createTextOutput('ok:' + sheet.getLastRow());
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

/** Jalankan sekali dari editor untuk memastikan skrip bisa menyentuh sheet. */
function ujiTambahBaris() {
  var sheet = ambilSheet();
  sheet.appendRow(susunBaris(sheet, {
    'timestamp': 'UJI ' + new Date(),
    'department': 'Finance',
    'name': 'Uji Skrip',
    'email address': 'uji@treelogy.com',
    'type of reimbursement': 'Petty Cash',
    'invoice date': 'UJI - hapus baris ini',
    'total amount': 1,
  }));
}

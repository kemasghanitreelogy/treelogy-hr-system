/**
 * Sekali jalan: ganti tautan lampiran LAMA (tanpa tanda tangan) di sheet dengan
 * tautan baru yang bisa dibuka siapa pun tanpa login.
 *
 * Tempel di Apps Script, pilih fungsi ini, tekan Run. TIDAK perlu deploy ulang —
 * hanya doPost yang butuh deployment, fungsi biasa bisa langsung dijalankan.
 *
 * Skrip ini tidak memuat rahasia apa pun; URL-nya sudah jadi.
 */
function perbaikiTautanLama() {
  var peta = {
    "b3f90edf-c3dc-4c18-ae27-9df06b7996cb/1327e2e7-ef75-4f6f-9d5d-1961315482ab.png": "https://treelogy-hr-system.vercel.app/api/payment-requests/file?path=b3f90edf-c3dc-4c18-ae27-9df06b7996cb%2F1327e2e7-ef75-4f6f-9d5d-1961315482ab.png&t=_YskGJIQiKj1V1g0NUyXwsfHt3XSk1sdyStiPlIlQIc",
    "b3f90edf-c3dc-4c18-ae27-9df06b7996cb/c47b07d6-a75f-4a30-accf-d34a171f5d9f.jpg": "https://treelogy-hr-system.vercel.app/api/payment-requests/file?path=b3f90edf-c3dc-4c18-ae27-9df06b7996cb%2Fc47b07d6-a75f-4a30-accf-d34a171f5d9f.jpg&t=PI6LKvSxDbEn7GrcgxOhQLa0jgcobEmsuA0yMXFh6EU",
    "ef86aad3-2e50-4083-b7c2-aac76ff91ba9/94284868-6b0c-466b-80f7-d94e67fd5052.jpg": "https://treelogy-hr-system.vercel.app/api/payment-requests/file?path=ef86aad3-2e50-4083-b7c2-aac76ff91ba9%2F94284868-6b0c-466b-80f7-d94e67fd5052.jpg&t=wxPxzJJYwxHIDS9yGiYV8r5yODMPP0BOFCQclvL10u4",
    "ef86aad3-2e50-4083-b7c2-aac76ff91ba9/c7c7b7b1-fd9a-4c5c-9b29-9e7dcf82c6ae.jpg": "https://treelogy-hr-system.vercel.app/api/payment-requests/file?path=ef86aad3-2e50-4083-b7c2-aac76ff91ba9%2Fc7c7b7b1-fd9a-4c5c-9b29-9e7dcf82c6ae.jpg&t=6Vqil9JgIkkoD6qXyR1IVvvzO-HTsIKBen0U0yStnVA"
  };

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME);
  var data = sheet.getDataRange().getValues();
  var diganti = 0;

  for (var r = 1; r < data.length; r++) {
    for (var c = 0; c < data[r].length; c++) {
      var nilai = String(data[r][c] || '');
      if (nilai.indexOf('/api/payment-requests/file?path=') === -1) continue;
      if (nilai.indexOf('&t=') !== -1) continue; // sudah bertanda tangan

      for (var path in peta) {
        if (nilai.indexOf(encodeURIComponent(path)) !== -1) {
          sheet.getRange(r + 1, c + 1).setValue(peta[path]);
          diganti++;
          break;
        }
      }
    }
  }
  Logger.log('Tautan diganti: ' + diganti);
  SpreadsheetApp.getActiveSpreadsheet().toast('Tautan diganti: ' + diganti);
}

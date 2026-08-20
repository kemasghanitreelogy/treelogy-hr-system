-- Status 'sending' dipakai penjaga anti-duplikat (lihat 0068): baris ditandai
-- sedang dikirim supaya permintaan kedua yang datang bersamaan berhenti.
--
-- Kolomnya bertipe enum, bukan teks bebas — dan itu terlewat saat 0068 ditulis.
-- Akibatnya setiap penulisan ke sheet ditolak database dengan
-- "invalid input value for enum sheet_sync_t: sending", lalu muncul di layar
-- sebagai "Pengajuan tersimpan, tapi belum masuk Google Sheet. claim_failed".
alter type sheet_sync_t add value if not exists 'sending';

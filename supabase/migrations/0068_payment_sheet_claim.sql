-- Penjaga anti-duplikat yang tidak bisa dikalahkan dua klik bersamaan.
--
-- Sebelumnya urutannya: BACA status → kalau belum 'synced', tulis ke sheet →
-- CATAT 'synced'. Dua permintaan yang datang bersamaan (dua perangkat, atau
-- "kirim ulang" beruntun) sama-sama membaca "belum synced", jadi sama-sama
-- menulis — dan sheet keuangan mendapat baris ganda dengan isi persis sama.
--
-- Kolom ini membuat pengambilan giliran menjadi satu operasi tunggal di
-- database: yang pertama berhasil menandai barisnya 'sending', yang kedua tidak
-- mendapat baris apa pun dan berhenti. Stempel waktunya dipakai agar giliran
-- yang menggantung (server mati di tengah kirim) bisa diambil ulang setelah
-- beberapa menit, bukan terkunci selamanya.
alter table payment_requests
  add column if not exists sheet_claimed_at timestamptz;

comment on column payment_requests.sheet_claimed_at is
  'Kapan giliran penulisan ke Google Sheet diambil. Dipakai untuk melepas giliran yang menggantung.';

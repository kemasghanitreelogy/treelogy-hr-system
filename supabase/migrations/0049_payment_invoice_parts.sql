-- ============================================================
-- Treelogy HR — pecah "Invoice date - Description - Vendor Name"
--
-- Pada Google Form lama ketiganya diketik dalam SATU kotak teks, sehingga
-- tanggal invoice tidak bisa dipakai memfilter, mengurutkan, atau merekap.
-- Sekarang disimpan sebagai tiga kolom terpisah, dan digabung kembali menjadi
-- satu teks HANYA saat ditulis ke Google Sheet — supaya kolom di sheet keuangan
-- tetap sama persis seperti yang biasa dibaca tim Finance.
-- ============================================================

alter table payment_requests
  add column if not exists invoice_date date not null default current_date,
  add column if not exists vendor_name  text;

comment on column payment_requests.description is
  'Deskripsi saja. Baris gabungan untuk sheet dibentuk di aplikasi (composeInvoiceLine).';

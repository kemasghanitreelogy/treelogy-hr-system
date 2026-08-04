-- ============================================================
-- Treelogy HR — lampiran pengajuan pembayaran wajib ada
--
-- approval_path sudah NOT NULL sejak awal, tetapi invoice_paths masih boleh
-- berupa array kosong: API menolaknya, namun database sendiri tidak. Pagar
-- terakhir harus ada di database, supaya jalur mana pun (skrip, perbaikan
-- manual, integrasi lain) tidak bisa menyimpan pengajuan tanpa faktur.
-- ============================================================

-- cardinality(), BUKAN array_length(): array_length('{}', 1) mengembalikan NULL,
-- dan CHECK yang bernilai NULL dianggap LOLOS — constraint seperti itu tidak
-- menahan apa pun. cardinality() mengembalikan 0 untuk array kosong.
alter table payment_requests
  drop constraint if exists payment_invoice_required;
alter table payment_requests
  add constraint payment_invoice_required
  check (cardinality(invoice_paths) >= 1);

-- approval_path NOT NULL saja belum cukup: string kosong tetap lolos.
alter table payment_requests
  drop constraint if exists payment_approval_required;
alter table payment_requests
  add constraint payment_approval_required
  check (length(btrim(approval_path)) > 0);

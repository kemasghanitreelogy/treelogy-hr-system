-- ============================================================
-- Pelanggan Eligible — kolom verifikasi metafield.
--
-- Token offline app Combined Discount kini tersedia di server, jadi isi
-- metafield `$app:combined-discount-state` bisa DIBACA langsung — itulah yang
-- benar-benar dilihat Function saat checkout. Hasil bacaan disimpan di sini
-- supaya layar menampilkan bukti, bukan hanya jawaban backend yang dipercaya.
-- (Menulis metafield dari luar app tetap tidak dilakukan: tanpa row
-- CustomerPurchaseFact, webhook order pertama akan menimpanya.)
-- ============================================================

alter table eligible_customers
  add column if not exists metafield_state jsonb,
  add column if not exists verified_at     timestamptz;

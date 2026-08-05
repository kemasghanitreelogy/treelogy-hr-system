-- ============================================================
-- Lampiran pengajuan pembayaran: boleh dibaca setiap akun yang login.
--
-- Sebelumnya hanya Finance/HR atau pemilik berkas. Akibatnya tautan di Google
-- Sheet keuangan gagal dibuka rekan lain — dan penolakan RLS muncul sebagai
-- "not_found", yang menyesatkan: seolah berkasnya hilang, padahal soal izin.
--
-- Pelonggaran ini KONSISTEN dengan keputusan yang sudah diambil: tautan
-- bertanda tangan memang dirancang bisa dibuka siapa pun yang memegangnya,
-- bahkan tanpa akun sama sekali. Membatasi jalur login lebih ketat daripada
-- jalur tanpa login tidak menambah kerahasiaan apa pun — hanya menyulitkan
-- staf sendiri.
--
-- Menulis tetap dibatasi, dan path berkas tetap acak (UUID) sehingga tidak
-- bisa ditebak tanpa memegang tautannya.
-- ============================================================

drop policy if exists "read payment files" on storage.objects;
create policy "read payment files" on storage.objects for select to authenticated
  using (bucket_id = 'payment-files');

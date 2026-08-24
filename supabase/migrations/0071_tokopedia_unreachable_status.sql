-- ============================================================
-- Pisahkan "tidak pernah sampai" dari "gagal setelah sampai".
--
-- `failed` sebelumnya menampung dua hal yang jejaknya sangat berbeda:
--   • query ditolak isinya (schema drift) — permintaannya SAMPAI ke Tokopedia
--   • koneksinya menggantung lalu mati    — tidak ada satu byte pun terkirim
--
-- Keduanya diberi jeda yang sama, dan itu keliru: menunggu satu jam sesudah
-- kabel internet putus tidak melindungi apa pun, karena tidak ada apa pun
-- yang perlu didinginkan. `requests = 0` tidak bisa dipakai membedakan —
-- pencacahnya baru naik SETELAH satu halaman berhasil dibaca, jadi galat
-- schema pun meninggalkan angka nol padahal permintaannya terkirim.
-- ============================================================

alter type tokopedia_run_status_t add value if not exists 'unreachable';

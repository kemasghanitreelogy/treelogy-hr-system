-- Tempat singgah sementara untuk PDF resi yang harus dibaca di server.
--
-- Latar: pembacaan label berjalan di perangkat pengguna. Sebagian perangkat
-- tidak sanggup menjalankan pustaka PDF, dan untuk mereka berkasnya dibacakan
-- di server. Mengirimnya lewat body API tidak bisa — platform menolak body di
-- atas ~4,5MB (diuji: 4MB lolos, 6MB ditolak), sementara satu berkas label
-- berisi ratusan halaman bisa 18MB.
--
-- Jadi berkasnya diunggah langsung ke bucket ini dari browser (jalur yang tidak
-- dibatasi ukuran body), server membacanya, lalu MENGHAPUSNYA pada permintaan
-- yang sama. Bucket ini bukan arsip: isinya hanya ada beberapa detik. Cron
-- pembersih menyapu sisa yang tertinggal kalau sebuah permintaan mati di tengah.

insert into storage.buckets (id, name, public)
values ('receipt-temp', 'receipt-temp', false)
on conflict (id) do nothing;

-- Berkas disimpan di bawah folder bernama id pengguna, dan tiap kebijakan
-- mengikat ke folder itu: satu orang tidak bisa menyentuh berkas singgah milik
-- orang lain, sekalipun sama-sama pemegang izin Receipt Sales.
drop policy if exists "receipt temp upload" on storage.objects;
create policy "receipt temp upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipt-temp'
    and has_perm('receipt.view')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipt temp read own" on storage.objects;
create policy "receipt temp read own" on storage.objects for select to authenticated
  using (
    bucket_id = 'receipt-temp'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipt temp delete own" on storage.objects;
create policy "receipt temp delete own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipt-temp'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

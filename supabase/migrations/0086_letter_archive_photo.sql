-- ============================================================
-- Surat Keluar: arsip foto surat + judul.
--
-- Setelah nomor terbit, penerbit memotret surat fisiknya dan memberi judul,
-- supaya setiap nomor bisa ditelusuri ke surat yang benar-benar dikirim.
-- Fotonya di bucket privat `letter-files` (sudah ada, RLS baca/tulis sejak
-- migration 0064/0084) dengan path `<letter_id>/<uuid>.<ext>`.
--
-- Tabel ini belum punya policy UPDATE sama sekali — ditambahkan di sini dan
-- dibatasi ke pengelola surat, selaras dengan pengecekan di API.
-- ============================================================

alter table public.outgoing_letters
  add column if not exists title text,
  add column if not exists photo_path text,
  add column if not exists updated_at timestamptz;

alter table public.outgoing_letters
  drop constraint if exists outgoing_letters_title_len;
alter table public.outgoing_letters
  add constraint outgoing_letters_title_len check (title is null or char_length(title) between 1 and 200);

drop policy if exists letters_update on public.outgoing_letters;
create policy letters_update on public.outgoing_letters for update to authenticated
  using (public.has_perm('letters.manage') or public.has_perm('employees.manage') or public.is_hr())
  with check (public.has_perm('letters.manage') or public.has_perm('employees.manage') or public.is_hr());

-- Nomor surat, departemen, dan urutan TIDAK boleh berubah lewat update —
-- hanya kolom arsip yang terbuka.
revoke update on public.outgoing_letters from authenticated;
grant update (title, photo_path, updated_at) on public.outgoing_letters to authenticated;

-- ============================================================
-- Surat Keluar SELALU terbuka untuk tim farm & factory — diikat ke TIM,
-- bukan ke peran.
--
-- Migration 0083 memberi letters.view ke peran Karyawan. Itu benar hari ini,
-- tapi rapuh: peran bisa diganti per orang, izin peran bisa diedit di halaman
-- Peran & Akses, dan peran baru bisa lahir tanpa letters.view. Permintaan
-- produknya adalah "setiap farm dan factory selalu dapat menu Surat Keluar" —
-- sebuah aturan tentang TIM, jadi ditegakkan lewat tim: fungsi is_field_team()
-- di database (untuk RLS berkas surat) dan izin sintetis di getSessionUser()
-- (untuk menu & guard halaman). Keduanya membaca employees.team yang sama.
--
-- Tabel outgoing_letters sendiri sudah permisif untuk authenticated sejak
-- migration 0064; yang masih di-gate izin hanyalah berkas di bucket
-- letter-files — itulah yang diperluas di sini.
-- ============================================================

create or replace function public.is_field_team()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
      from public.profiles p
      join public.employees e on e.id = p.employee_id
     where p.id = auth.uid()
       and e.team in ('farm', 'factory')
  );
$$;

revoke execute on function public.is_field_team() from public, anon;
grant execute on function public.is_field_team() to authenticated;

drop policy if exists "read letter files" on storage.objects;
create policy "read letter files" on storage.objects for select to authenticated
  using (
    bucket_id = 'letter-files'
    and (has_perm('letters.view') or has_perm('letters.manage') or is_hr() or is_field_team())
  );

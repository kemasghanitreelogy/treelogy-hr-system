-- ============================================================
-- has_perm() mengakui super admin.
--
-- Pasangan dari perubahan can() di aplikasi. Kalau hanya sisi aplikasi yang
-- menembus, super admin lolos pemeriksaan API lalu ditolak RLS saat menyentuh
-- datanya — gagal yang jauh lebih membingungkan daripada ditolak sejak awal,
-- karena layarnya terlihat mengizinkan.
--
-- `left join` dipakai dengan sengaja: profil tanpa role_id (mis. akun yang
-- perannya belum ditetapkan) tetap harus lolos bila ia super admin. Dengan
-- inner join baris itu hilang sama sekali dan flag-nya tidak pernah terbaca.
-- ============================================================

create or replace function public.has_perm(perm text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
      from public.profiles p
      left join public.roles r on r.id = p.role_id
     where p.id = auth.uid()
       and (p.is_super_admin = true or perm = any(r.permissions))
  );
$function$;

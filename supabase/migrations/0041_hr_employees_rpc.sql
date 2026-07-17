-- Treelogy HR — Clock in/out approvals: minta konfirmasi HANYA ke HR
--
-- Persetujuan clock in/out (di luar area & hari libur) memang sudah HR-only di
-- RLS (0021) dan UI (attendance.manage), tapi push "perlu konfirmasi Anda"
-- masih dikirim ke HR + atasan langsung lewat approver_employees(). Fungsi ini
-- adalah varian HR-saja untuk notifikasi clock approval; semantik HR mengikuti
-- is_hr() (profiles.role admin/hr ATAU permission employees.manage).
-- Alur leave/lembur/tabungan tetap memakai approver_employees (dual approval).

create or replace function public.hr_employees(req_employee uuid)
returns table(employee_id uuid) language sql security definer stable set search_path = '' as $$
  select distinct e.id
  from public.employees e
  join public.profiles  p on p.employee_id = e.id
  left join public.roles r on r.id = p.role_id
  where e.id <> req_employee
    and e.status = 'active'
    and (p.role in ('admin', 'hr') or 'employees.manage' = any(coalesce(r.permissions, '{}')));
$$;

revoke execute on function public.hr_employees(uuid) from public, anon, authenticated;
grant  execute on function public.hr_employees(uuid) to service_role;

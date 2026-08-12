-- ============================================================
-- Treelogy HR — Perjalanan dinas: persetujuan dua tahap
--
-- Kebijakan baru: status "Disetujui" hanya setelah DUA tanda tangan —
-- tahap 1 penyetuju operasional/GA (`travel.approve`), tahap 2 persetujuan
-- akhir (`travel.finalize`, HR/Admin). Menolak di tahap mana pun langsung
-- final. Praktik four-eyes: dua tahap tidak boleh ditandatangani orang yang
-- sama, dan tidak ada yang boleh menyetujui pengajuannya sendiri (API).
--
-- Kolom tidak berubah: manager_approver = tahap 1, hr_approver = tahap 2
-- (nama kolom warisan modul cuti/lembur). Baris lama yang sudah approved
-- dari era penyetuju tunggal tetap sah.
-- ============================================================

insert into permissions (id, module, label) values
  ('travel.finalize','travel','Persetujuan akhir perjalanan dinas (tahap 2)')
on conflict (id) do nothing;

-- Tahap akhir dipegang HR & Admin (ubah kapan pun via halaman Peran & Akses).
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['travel.finalize']) p)
 where id in ('role-admin','role-hr');

-- Penyetuju akhir harus bisa membaca & memutus.
drop policy if exists "read travel" on travel_requests;
create policy "read travel" on travel_requests for select to authenticated
  using (
    has_perm('travel.approve')
    or has_perm('travel.finalize')
    or is_hr()
    or employee_id = my_employee_id()
    or is_team_manager_of(employee_id)
  );

drop policy if exists "decide travel" on travel_requests;
create policy "decide travel" on travel_requests for update to authenticated
  using      (has_perm('travel.approve') or has_perm('travel.finalize'))
  with check (has_perm('travel.approve') or has_perm('travel.finalize'));

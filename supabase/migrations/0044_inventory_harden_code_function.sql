-- ============================================================
-- Treelogy HR — Hardening generator kode inventaris
--
-- inventory_next_code() otomatis terekspos PostgREST sebagai
-- /rest/v1/rpc/inventory_next_code. Bukan kebocoran data, tapi siapa pun
-- (termasuk anon) bisa memanggilnya berulang dan membuat lompatan nomor aset.
-- Tutup aksesnya; hanya peran yang benar-benar melakukan INSERT yang perlu
-- EXECUTE, karena default kolom dieksekusi sebagai peran pemanggil.
-- ============================================================

revoke execute on function public.inventory_next_code() from public, anon;
grant  execute on function public.inventory_next_code() to authenticated, service_role;

-- Fungsi trigger tidak pernah dipanggil langsung — cabut juga.
revoke execute on function public.inventory_touch_updated_at() from public, anon;

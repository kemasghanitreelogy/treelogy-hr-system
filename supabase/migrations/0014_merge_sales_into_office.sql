-- ============================================================
-- Treelogy HR — Sales is now part of the Office (Kantor) division.
-- Only three divisions remain: factory (Pabrik), farm (Kebun), office (Kantor).
--
-- We move all 'sales' rows to 'office'. The unused enum value 'sales' is left in
-- place (dropping a Postgres enum value requires recreating the type across every
-- column) — it is no longer produced by the app or shown in the UI.
-- ============================================================

update employees set team = 'office', location = 'Office · Bali' where team = 'sales';
update shifts    set team = 'office'                              where team = 'sales';

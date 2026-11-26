-- Retour arrière de la migration 20261126120000 (profils d'impression, archivage).
-- ⚠️ Supprime les profils (et leurs validations). Les fichiers archivés restent dans les commandes.
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/rollbacks/20261126120000_banner_studio_profils_down.sql
-- Puis réappliquer 20261125130000 pour retrouver `reserver_visuel_banderole` à cinq paramètres.

begin;
drop function if exists public.archiver_visuel_commande(uuid, jsonb);
drop function if exists public.reserver_visuel_banderole(uuid, text, jsonb, integer, text, uuid, integer, text);
alter table public.visuels_banderole drop column if exists origine, drop column if exists profil_version, drop column if exists profil_id;
drop table if exists public.profils_impression;
drop function if exists public.reinitialiser_validation_profil_impression();
commit;

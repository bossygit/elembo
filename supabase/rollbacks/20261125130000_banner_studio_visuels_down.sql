-- Retour arrière de la migration 20261125130000 (Banner Studio, visuels).
--
-- ⚠️ Supprime les versions de visuels (documents, préflights). Les fichiers déjà déposés (PDF, projet,
-- fiche) restent dans `fichiers_devis` et dans le stockage.
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/rollbacks/20261125130000_banner_studio_visuels_down.sql

begin;

alter table public.demandes_grand_format drop constraint if exists demandes_grand_format_visuel_courant_fk;
alter table public.demandes_grand_format drop column if exists visuel_courant_id;

drop function if exists public.echouer_visuel_banderole(uuid, text);
drop function if exists public.terminer_visuel_banderole(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text);
drop function if exists public.reserver_visuel_banderole(uuid, text, jsonb, integer, text);
drop table if exists public.visuels_banderole;

update storage.buckets
set allowed_mime_types = array_remove(allowed_mime_types, 'text/plain'), file_size_limit = 26214400
where id = 'devis';

commit;

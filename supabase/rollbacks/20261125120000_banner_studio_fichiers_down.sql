-- Retour arrière de la migration 20261125120000 (Banner Studio, projet JSON).
-- Les projets déjà déposés restent dans le bucket : ils sont lisibles, mais plus aucun ne peut être ajouté.
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/rollbacks/20261125120000_banner_studio_fichiers_down.sql

update storage.buckets
set allowed_mime_types = array_remove(allowed_mime_types, 'application/json')
where id = 'devis';

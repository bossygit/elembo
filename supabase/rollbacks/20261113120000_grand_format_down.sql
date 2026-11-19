-- Retour arrière de la migration 20261113120000_grand_format.sql.
--
-- ⚠️ Supprime les demandes grand format, la grille d'estimation et les champs partenaires ajoutés.
-- Les DEVIS correspondants sont conservés (ce sont des devis Elembo ordinaires) ; leurs
-- paramètres restent lisibles dans `devis.specifications`. Exporter les tables avant exécution
-- si elles contiennent des données utiles :
--   pg_dump --data-only -t public.demandes_grand_format -t public.tarifs_grand_format …
--
-- Exécution (base locale ou de test d'abord) :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/rollbacks/20261113120000_grand_format_down.sql

begin;

drop function if exists public.creer_demande_grand_format(text, text, text, timestamptz, text, text, text, text, text, public.type_client, text, text, text, integer, jsonb, jsonb, text, text, jsonb);

drop table if exists public.demandes_grand_format;
drop function if exists public.synchroniser_cout_estime_grand_format();

drop table if exists public.tarifs_grand_format;
drop function if exists public.reinitialiser_validation_tarif_grand_format();

drop index if exists public.partenaires_types_impression_idx;
alter table public.partenaires
  drop column if exists contact_nom,
  drop column if exists adresse,
  drop column if exists types_impression,
  drop column if exists largeur_max_m,
  drop column if exists longueur_max_m;
comment on column public.partenaires.tarifs is null;

-- Historique de la CLI Supabase (sans effet si la migration a été appliquée à la main).
delete from supabase_migrations.schema_migrations where version = '20261113120000';

commit;

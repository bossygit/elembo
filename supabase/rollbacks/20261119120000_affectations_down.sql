-- Retour arrière de la migration 20261119120000 (affectations, Lot 2).
--
-- ⚠️ Supprime l'historique des propositions, les liens fichiers et l'instantané des tarifs.
-- Les tâches de production et les banderoles ne sont pas modifiées : leurs colonnes
-- `partenaire_id` restent telles quelles (si une affectation avait été acceptée, elles gardent
-- l'atelier ; le back-office les remodifie avec l'ancien écran).
--
-- Exporter avant exécution si l'historique des affectations est utile :
--   pg_dump --data-only -t public.affectations_production -t public.affectations_evenements …
--
-- Exécution (base locale ou de test d'abord) :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/rollbacks/20261119120000_affectations_down.sql

begin;

-- Les tables d'abord : leurs triggers dépendent des fonctions.
drop table if exists public.affectation_fichiers;
drop table if exists public.affectations_evenements;
drop table if exists public.affectations_production;

drop function if exists public.mes_affectations();
drop function if exists public.mon_affectation(uuid);
drop function if exists public.brouillons_abandonnes(integer);
drop function if exists public.archiver_brouillon(uuid, text);
drop function if exists public.expirer_affectations();
drop function if exists public.terminer_affectation(uuid, uuid);
drop function if exists public.annuler_affectation(uuid, uuid, text, text);
drop function if exists public.decider_affectation(uuid, uuid, text, text);
drop function if exists public.ajouter_fichiers_affectation(uuid, uuid[], uuid);
drop function if exists public.proposer_affectation(text, uuid, uuid, uuid, uuid, uuid, numeric, integer, text, jsonb, uuid, text);

drop function if exists public.synchroniser_affectation();
drop function if exists public.verifier_affectation_fichier();
drop function if exists public.verifier_affectation_objet();
drop function if exists public.verifier_affectation_immuable();
drop function if exists public.verifier_transition_affectation();
drop function if exists public.transition_affectation_autorisee(text, text);

drop sequence if exists public.affectations_reference_seq;

-- Historique de la CLI Supabase (sans effet si la migration a été appliquée à la main).
delete from supabase_migrations.schema_migrations where version = '20261119120000';

commit;

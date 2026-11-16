-- Retour arrière de la migration 20261116120000_elembo_partners.sql.
--
-- ⚠️ Supprime les comptes partenaires (rattachements, invitations), machines, capacités, services,
-- tarifs négociés et leurs paliers, disponibilités, fichiers référencés, historique des statuts,
-- ainsi que les colonnes ajoutées à `partenaires` et les notes internes « partenaire ».
-- Les comptes Supabase Auth eux-mêmes sont CONSERVÉS (aucun rôle staff ne leur est donné).
-- Les fiches créées par inscription (origine INSCRIPTION) sont conservées comme prestataires
-- inactifs, pour ne pas casser une tâche de production qui les référencerait.
--
-- Exporter avant exécution si les tables contiennent des données utiles :
--   pg_dump --data-only -t 'public.partenaire_*' -t public.historique_statuts_partenaire …
-- Les objets du bucket `partenaires` doivent être vidés au préalable (Supabase refuse la
-- suppression d'un bucket non vide) : Storage → partenaires → tout sélectionner → supprimer.
--
-- Exécution (base locale ou de test d'abord) :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/rollbacks/20261116120000_elembo_partners_down.sql

begin;

drop function if exists public.valider_tarif_partenaire(uuid, uuid, text, date, date);
drop function if exists public.proposer_tarif_partenaire(uuid, uuid, text, uuid, jsonb, jsonb);
drop function if exists public.decider_partenaire(uuid, text, text, uuid, text);
drop function if exists public.soumettre_partenaire(uuid, uuid);
drop function if exists public.accepter_invitation_partenaire(text, uuid);
drop function if exists public.creer_partenaire_inscription(uuid, text, text);

-- Les tables d'abord : leurs politiques RLS dépendent des fonctions de session.
drop table if exists public.partenaire_fichiers;
drop table if exists public.partenaire_disponibilites;
drop table if exists public.partenaire_tarif_paliers;
drop table if exists public.partenaire_tarifs;
drop table if exists public.partenaire_services;
drop table if exists public.partenaire_capacite_machines;
drop table if exists public.partenaire_capacites;
drop table if exists public.partenaire_machines;
drop table if exists public.partenaire_invitations;
drop table if exists public.partenaire_utilisateurs;
drop table if exists public.historique_statuts_partenaire;

drop function if exists public.mon_partenaire();
drop function if exists public.role_partenaire_session();
drop function if exists public.partenaire_session();
drop function if exists public.verifier_meme_partenaire();
drop function if exists public.erreur_paliers_tarif(uuid);
drop function if exists public.verifier_palier_partenaire();
drop function if exists public.verifier_tarif_partenaire();
drop function if exists public.transition_tarif_autorisee(text, text);
drop function if exists public.reinitialiser_validation_service();
drop function if exists public.reinitialiser_validation_capacite();
drop function if exists public.reinitialiser_validation_machine();
drop function if exists public.verifier_utilisateur_partenaire();

drop trigger if exists partenaires_transition on public.partenaires;
drop function if exists public.verifier_transition_partenaire();
drop function if exists public.transition_partenaire_autorisee(text, text);

delete from storage.buckets where id = 'partenaires';

delete from public.notes_internes where entite = 'partenaire';
alter table public.notes_internes drop constraint if exists notes_internes_entite_check;
alter table public.notes_internes
  add constraint notes_internes_entite_check check (entite in ('commande', 'client', 'devis'));

-- Un prestataire non validé ne doit pas redevenir affectable en perdant son statut.
update public.partenaires set actif = false where statut <> 'VALIDE';

drop index if exists public.partenaires_statut_idx;
alter table public.partenaires
  drop column if exists statut,
  drop column if exists origine,
  drop column if exists raison_sociale,
  drop column if exists description,
  drop column if exists annee_creation,
  drop column if exists rccm,
  drop column if exists niu,
  drop column if exists site_web,
  drop column if exists whatsapp,
  drop column if exists contact_fonction,
  drop column if exists ville,
  drop column if exists quartier,
  drop column if exists localisation,
  drop column if exists zone_desservie,
  drop column if exists quantites_minimales,
  drop column if exists conditions_particulieres,
  drop column if exists soumis_le,
  drop column if exists valide_par,
  drop column if exists valide_par_email,
  drop column if exists valide_le,
  drop column if exists motif_decision;

comment on column public.partenaires.notes is null;
comment on column public.partenaires.tarifs is
  'Tarifs négociés (confidentiels) : {"prix_m2_fcfa": entier, "conditions": texte}. Jamais exposés au public.';

-- Historique de la CLI Supabase (sans effet si la migration a été appliquée à la main).
delete from supabase_migrations.schema_migrations where version = '20261116120000';

commit;

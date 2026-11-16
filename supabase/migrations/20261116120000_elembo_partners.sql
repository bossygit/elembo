-- Elembo — migration 0012 : Elembo Partners, lot 1 (référencement et validation des partenaires).
--
-- Référence : docs/elembo-partners.md. Cette migration ajoute :
--
--   1. `partenaires` : statut de validation, identité, coordonnées détaillées, historique des statuts ;
--   2. les comptes du portail : `partenaire_utilisateurs`, `partenaire_invitations` ;
--   3. ce que l'atelier possède et sait faire : `partenaire_machines`, `partenaire_capacites`
--      (+ `partenaire_capacite_machines`), `partenaire_services` ;
--   4. les tarifs négociés versionnés : `partenaire_tarifs`, `partenaire_tarif_paliers` ;
--   5. les disponibilités déclarées et les fichiers (bucket privé `partenaires`) ;
--   6. les fonctions de session (RLS) et les transitions métier (`service_role`).
--
-- Principes (identiques au reste du schéma) :
--   • le navigateur n'écrit jamais : `service_role` seul écrit, après contrôle serveur ;
--   • la RLS laisse un partenaire lire SES lignes, et seulement elles (seconde barrière effective :
--     le portail lit avec la session de l'utilisateur) ;
--   • une valeur technique ou un prix ne devient jamais « validé » sans acte explicite de Smart Vision.
--
-- Migration additive : aucune colonne existante n'est supprimée. Les données existantes sont
-- reprises (§ reprise). Retour arrière : supabase/rollbacks/20261116120000_elembo_partners_down.sql.

/* ============================================================== partenaires ==== */

alter table public.partenaires
  add column if not exists statut text not null default 'VALIDE'
    check (statut in ('BROUILLON', 'EN_ATTENTE_VALIDATION', 'VALIDE', 'SUSPENDU', 'REFUSE', 'ARCHIVE')),
  add column if not exists origine text not null default 'BACK_OFFICE'
    check (origine in ('BACK_OFFICE', 'INSCRIPTION')),
  add column if not exists raison_sociale text
    check (raison_sociale is null or char_length(raison_sociale) <= 160),
  add column if not exists description text
    check (description is null or char_length(description) <= 2000),
  add column if not exists annee_creation smallint
    check (annee_creation is null or annee_creation between 1900 and 2100),
  add column if not exists rccm text check (rccm is null or char_length(rccm) <= 60),
  add column if not exists niu text check (niu is null or char_length(niu) <= 60),
  add column if not exists site_web text check (site_web is null or char_length(site_web) <= 300),
  add column if not exists whatsapp text check (whatsapp is null or char_length(whatsapp) <= 32),
  add column if not exists contact_fonction text
    check (contact_fonction is null or char_length(contact_fonction) <= 120),
  add column if not exists ville text check (ville is null or char_length(ville) <= 120),
  add column if not exists quartier text check (quartier is null or char_length(quartier) <= 120),
  add column if not exists localisation text
    check (localisation is null or char_length(localisation) <= 300),
  add column if not exists zone_desservie text
    check (zone_desservie is null or char_length(zone_desservie) <= 300),
  add column if not exists quantites_minimales text
    check (quantites_minimales is null or char_length(quantites_minimales) <= 1000),
  add column if not exists conditions_particulieres text
    check (conditions_particulieres is null or char_length(conditions_particulieres) <= 2000),
  add column if not exists soumis_le timestamptz,
  add column if not exists valide_par uuid references auth.users (id) on delete set null,
  add column if not exists valide_par_email text,
  add column if not exists valide_le timestamptz,
  add column if not exists motif_decision text
    check (motif_decision is null or char_length(motif_decision) <= 2000);

comment on column public.partenaires.statut is
  'Cycle de validation. Seul un partenaire VALIDE et actif peut recevoir une affectation.';
comment on column public.partenaires.origine is
  'BACK_OFFICE : créé par Smart Vision ; INSCRIPTION : créé depuis le portail /partenaire.';
comment on column public.partenaires.motif_decision is
  'Motif du dernier refus, suspension ou demande de compléments — visible du partenaire.';
comment on column public.partenaires.notes is
  'Note interne Smart Vision — jamais visible du partenaire (non renvoyée par mon_partenaire()).';
comment on column public.partenaires.tarifs is
  'HÉRITÉ (lecture seule) : remplacé par partenaire_tarifs. Repris en tarif PROPOSE par la migration 0012.';

/* ---------------------------------------------------------------- reprise ---- */

-- Les prestataires existants ont été créés et utilisés par Smart Vision : ils restent VALIDE
-- (valeur par défaut ci-dessus). Les prestataires désactivés deviennent ARCHIVE.
update public.partenaires set statut = 'ARCHIVE' where not actif and statut = 'VALIDE';

-- Toute nouvelle fiche doit déclarer son statut ; par défaut, elle n'est pas affectable.
alter table public.partenaires alter column statut set default 'BROUILLON';

create index if not exists partenaires_statut_idx on public.partenaires (statut);

/* ------------------------------------------------------ historique de statut ---- */

create table if not exists public.historique_statuts_partenaire (
  id bigserial primary key,
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  ancien_statut text not null,
  nouveau_statut text not null,
  acteur uuid references auth.users (id) on delete set null,
  motif text check (motif is null or char_length(motif) <= 2000),
  cree_le timestamptz not null default now()
);

create index if not exists historique_statuts_partenaire_idx
  on public.historique_statuts_partenaire (partenaire_id, cree_le desc);

/*
 * Transitions autorisées. `src/lib/partenaires/statuts.ts` reflète exactement cette liste
 * (vérifié par `partenairesStatuts.test.ts`). Toute autre transition est refusée par la base.
 */
create or replace function public.transition_partenaire_autorisee(ancien text, nouveau text)
returns boolean
language sql
immutable
as $$
  select (ancien, nouveau) in (
    ('BROUILLON', 'EN_ATTENTE_VALIDATION'),
    ('BROUILLON', 'VALIDE'),
    ('BROUILLON', 'ARCHIVE'),
    ('EN_ATTENTE_VALIDATION', 'VALIDE'),
    ('EN_ATTENTE_VALIDATION', 'REFUSE'),
    ('EN_ATTENTE_VALIDATION', 'BROUILLON'),
    ('EN_ATTENTE_VALIDATION', 'ARCHIVE'),
    ('REFUSE', 'EN_ATTENTE_VALIDATION'),
    ('REFUSE', 'ARCHIVE'),
    ('VALIDE', 'SUSPENDU'),
    ('VALIDE', 'ARCHIVE'),
    ('SUSPENDU', 'VALIDE'),
    ('SUSPENDU', 'ARCHIVE'),
    ('ARCHIVE', 'VALIDE')
  );
$$;

create or replace function public.verifier_transition_partenaire()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.statut is distinct from old.statut then
    if not public.transition_partenaire_autorisee(old.statut, new.statut) then
      raise exception 'Transition de partenaire interdite : % → %', old.statut, new.statut
        using errcode = '23514';
    end if;
    if new.statut in ('REFUSE', 'SUSPENDU') and coalesce(trim(new.motif_decision), '') = '' then
      raise exception 'Un motif est obligatoire pour le statut %', new.statut using errcode = '23514';
    end if;
    insert into public.historique_statuts_partenaire (partenaire_id, ancien_statut, nouveau_statut, acteur, motif)
    values (
      new.id, old.statut, new.statut,
      coalesce(auth.uid(), nullif(current_setting('app.acteur_id', true), '')::uuid),
      case when new.statut in ('REFUSE', 'SUSPENDU', 'BROUILLON') then new.motif_decision end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists partenaires_transition on public.partenaires;
create trigger partenaires_transition
  before update of statut on public.partenaires
  for each row execute function public.verifier_transition_partenaire();

/* ===================================================== comptes du portail ==== */

create table if not exists public.partenaire_utilisateurs (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_partenaire text not null check (role_partenaire in ('RESPONSABLE', 'PRODUCTION', 'LECTURE')),
  actif boolean not null default true,
  invite_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint partenaire_utilisateurs_unique unique (partenaire_id, user_id)
);

comment on table public.partenaire_utilisateurs is
  'Comptes Supabase Auth rattachés à une entreprise partenaire. Un compte = une entreprise active au plus. Jamais un compte staff.';

-- Un compte n'appartient qu'à une seule entreprise active (résolution de session sans ambiguïté).
create unique index if not exists partenaire_utilisateurs_un_actif
  on public.partenaire_utilisateurs (user_id) where actif;

drop trigger if exists partenaire_utilisateurs_maj_le on public.partenaire_utilisateurs;
create trigger partenaire_utilisateurs_maj_le before update on public.partenaire_utilisateurs
  for each row execute function public.set_maj_le();

/*
 * Garde-fous des comptes :
 *  - un compte staff (rôle dans app_metadata) ne peut pas être rattaché à un partenaire ;
 *  - une entreprise garde toujours au moins un RESPONSABLE actif. La règle ne s'applique pas
 *    quand l'entreprise ou le compte est lui-même supprimé (suppression en cascade).
 */
create or replace function public.verifier_utilisateur_partenaire()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.actif then
    if exists (
      select 1 from auth.users u
       where u.id = new.user_id
         and coalesce(u.raw_app_meta_data ->> 'role', '') <> ''
    ) then
      raise exception 'Un compte du personnel ne peut pas être rattaché à un partenaire'
        using errcode = '23514';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and old.actif and old.role_partenaire = 'RESPONSABLE'
     and (tg_op = 'DELETE' or not new.actif or new.role_partenaire <> 'RESPONSABLE')
     and exists (select 1 from public.partenaires p where p.id = old.partenaire_id)
     and exists (select 1 from auth.users u where u.id = old.user_id) then
    -- Verrou sur l'entreprise : deux retraits simultanés ne peuvent pas laisser zéro responsable.
    perform 1 from public.partenaires where id = old.partenaire_id for update;
    if not exists (
      select 1 from public.partenaire_utilisateurs pu
       where pu.partenaire_id = old.partenaire_id
         and pu.id <> old.id
         and pu.actif
         and pu.role_partenaire = 'RESPONSABLE'
    ) then
      raise exception 'L''entreprise doit garder au moins un responsable actif' using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists partenaire_utilisateurs_garde on public.partenaire_utilisateurs;
create trigger partenaire_utilisateurs_garde
  before insert or update or delete on public.partenaire_utilisateurs
  for each row execute function public.verifier_utilisateur_partenaire();

create table if not exists public.partenaire_invitations (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(trim(email))),
  role_partenaire text not null check (role_partenaire in ('RESPONSABLE', 'PRODUCTION', 'LECTURE')),
  jeton_hash text not null unique check (jeton_hash ~ '^[0-9a-f]{64}$'),
  invite_par uuid references auth.users (id) on delete set null,
  expire_le timestamptz not null,
  acceptee_le timestamptz,
  acceptee_par uuid references auth.users (id) on delete set null,
  revoquee_le timestamptz,
  cree_le timestamptz not null default now(),
  constraint partenaire_invitations_etat check (acceptee_le is null or revoquee_le is null)
);

comment on table public.partenaire_invitations is
  'Invitations à rejoindre un partenaire (opérateurs, rattachement d''une fiche existante). Seule l''empreinte SHA-256 du jeton est stockée.';

create index if not exists partenaire_invitations_partenaire_idx
  on public.partenaire_invitations (partenaire_id, cree_le desc);

/* ============================================================= machines ==== */

create table if not exists public.partenaire_machines (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  famille text not null
    check (famille in ('GRAND_FORMAT', 'IMPRESSION_NUMERIQUE', 'TEXTILE', 'SIGNALETIQUE_FINITION')),
  type_machine text not null check (type_machine ~ '^[A-Z0-9_]{2,40}$'),
  nom text not null check (char_length(trim(nom)) between 2 and 120),
  marque text check (marque is null or char_length(marque) <= 80),
  modele text check (modele is null or char_length(modele) <= 80),
  technologie text check (technologie is null or char_length(technologie) <= 80),
  annee_acquisition smallint check (annee_acquisition is null or annee_acquisition between 1950 and 2100),
  quantite integer not null default 1 check (quantite between 1 and 99),
  -- Laize = largeur utile du rouleau (petit côté du support) ; longueur = sens du déroulé.
  largeur_max_mm integer check (largeur_max_mm is null or largeur_max_mm between 1 and 100000),
  longueur_max_mm integer check (longueur_max_mm is null or longueur_max_mm between 1 and 1000000),
  resolution_dpi integer check (resolution_dpi is null or resolution_dpi between 1 and 10000),
  vitesse numeric(10, 2) check (vitesse is null or vitesse > 0),
  unite_vitesse text check (unite_vitesse is null or unite_vitesse in ('M2_HEURE', 'PIECES_HEURE', 'PAGES_MINUTE', 'ML_HEURE')),
  supports_compatibles text[] not null default '{}'::text[] check (cardinality(supports_compatibles) <= 40),
  formats_compatibles text[] not null default '{}'::text[] check (cardinality(formats_compatibles) <= 40),
  etat text not null default 'OPERATIONNELLE'
    check (etat in ('OPERATIONNELLE', 'MAINTENANCE', 'EN_PANNE', 'HORS_SERVICE')),
  derniere_maintenance_le date,
  prochaine_maintenance_le date,
  caracteristiques jsonb not null default '{}'::jsonb check (jsonb_typeof(caracteristiques) = 'object'),
  statut_validation text not null default 'A_VALIDER'
    check (statut_validation in ('A_VALIDER', 'VALIDEE', 'REFUSEE')),
  valide_par uuid references auth.users (id) on delete set null,
  valide_le timestamptz,
  motif_refus text check (motif_refus is null or char_length(motif_refus) <= 1000),
  archive boolean not null default false,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint partenaire_machines_validation
    check ((statut_validation <> 'VALIDEE' or valide_le is not null)
       and (statut_validation <> 'REFUSEE' or motif_refus is not null))
);

comment on table public.partenaire_machines is
  'Équipements physiques d''un partenaire. Une machine n''est pas une capacité de production.';

create index if not exists partenaire_machines_partenaire_idx on public.partenaire_machines (partenaire_id);

drop trigger if exists partenaire_machines_maj_le on public.partenaire_machines;
create trigger partenaire_machines_maj_le before update on public.partenaire_machines
  for each row execute function public.set_maj_le();

/*
 * Une valeur technique modifiée fait tomber la validation (CDC §4.3). L'état de
 * fonctionnement et les dates de maintenance n'en font pas partie : un opérateur doit pouvoir
 * déclarer une panne sans faire revalider la machine.
 */
create or replace function public.reinitialiser_validation_machine()
returns trigger
language plpgsql
as $$
begin
  if (new.famille, new.type_machine, new.technologie, new.quantite, new.largeur_max_mm,
      new.longueur_max_mm, new.resolution_dpi, new.supports_compatibles, new.formats_compatibles)
     is distinct from
     (old.famille, old.type_machine, old.technologie, old.quantite, old.largeur_max_mm,
      old.longueur_max_mm, old.resolution_dpi, old.supports_compatibles, old.formats_compatibles) then
    new.statut_validation := 'A_VALIDER';
    new.valide_par := null;
    new.valide_le := null;
    new.motif_refus := null;
  end if;
  return new;
end;
$$;

drop trigger if exists partenaire_machines_validation on public.partenaire_machines;
create trigger partenaire_machines_validation before update on public.partenaire_machines
  for each row execute function public.reinitialiser_validation_machine();

/* ============================================================ capacités ==== */

create table if not exists public.partenaire_capacites (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  categorie text not null
    check (categorie in ('GRAND_FORMAT', 'IMPRESSION_NUMERIQUE', 'TEXTILE', 'SIGNALETIQUE_FINITION')),
  -- Code du catalogue (src/lib/partenaires/catalogue.ts). Grand format = identifiants SUPPORTS.
  prestation text not null check (prestation ~ '^[A-Z0-9_]{2,40}$'),
  nom text not null check (char_length(trim(nom)) between 2 and 120),
  technologie text check (technologie is null or char_length(technologie) <= 80),
  largeur_min_mm integer check (largeur_min_mm is null or largeur_min_mm > 0),
  largeur_max_mm integer check (largeur_max_mm is null or largeur_max_mm between 1 and 100000),
  longueur_min_mm integer check (longueur_min_mm is null or longueur_min_mm > 0),
  longueur_max_mm integer check (longueur_max_mm is null or longueur_max_mm between 1 and 1000000),
  supports_compatibles text[] not null default '{}'::text[] check (cardinality(supports_compatibles) <= 40),
  matieres text[] not null default '{}'::text[] check (cardinality(matieres) <= 40),
  finitions text[] not null default '{}'::text[]
    check (cardinality(finitions) <= 30 and array_to_string(finitions, ',') ~ '^[A-Z0-9_,]*$'),
  quantite_min integer check (quantite_min is null or quantite_min > 0),
  capacite_journaliere numeric(12, 2) check (capacite_journaliere is null or capacite_journaliere > 0),
  capacite_hebdomadaire numeric(12, 2) check (capacite_hebdomadaire is null or capacite_hebdomadaire > 0),
  unite_capacite text not null
    check (unite_capacite in ('M2', 'METRE_LINEAIRE', 'PIECE', 'IMPRESSION', 'HEURE')),
  delai_jours integer check (delai_jours is null or delai_jours between 0 and 365),
  delai_express_jours integer check (delai_express_jours is null or delai_express_jours between 0 and 365),
  contraintes text check (contraintes is null or char_length(contraintes) <= 2000),
  statut_validation text not null default 'A_VALIDER'
    check (statut_validation in ('A_VALIDER', 'VALIDEE', 'REFUSEE')),
  valide_par uuid references auth.users (id) on delete set null,
  valide_le timestamptz,
  motif_refus text check (motif_refus is null or char_length(motif_refus) <= 1000),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint partenaire_capacites_largeur check (largeur_min_mm is null or largeur_max_mm is null or largeur_min_mm <= largeur_max_mm),
  constraint partenaire_capacites_longueur check (longueur_min_mm is null or longueur_max_mm is null or longueur_min_mm <= longueur_max_mm),
  constraint partenaire_capacites_express check (delai_express_jours is null or delai_jours is null or delai_express_jours <= delai_jours),
  constraint partenaire_capacites_validation
    check ((statut_validation <> 'VALIDEE' or valide_le is not null)
       and (statut_validation <> 'REFUSEE' or motif_refus is not null))
);

comment on table public.partenaire_capacites is
  'Ce qu''un partenaire sait réellement produire (prestation, dimensions, volumes, délais). Source de l''affectation et du matching.';
comment on column public.partenaire_capacites.largeur_max_mm is
  'Laize : petit côté du support, en travers du sens d''impression.';

create index if not exists partenaire_capacites_partenaire_idx on public.partenaire_capacites (partenaire_id);
create index if not exists partenaire_capacites_prestation_idx
  on public.partenaire_capacites (prestation) where actif and statut_validation = 'VALIDEE';
create index if not exists partenaire_capacites_finitions_idx on public.partenaire_capacites using gin (finitions);
create index if not exists partenaire_capacites_supports_idx on public.partenaire_capacites using gin (supports_compatibles);

drop trigger if exists partenaire_capacites_maj_le on public.partenaire_capacites;
create trigger partenaire_capacites_maj_le before update on public.partenaire_capacites
  for each row execute function public.set_maj_le();

create or replace function public.reinitialiser_validation_capacite()
returns trigger
language plpgsql
as $$
begin
  if (new.categorie, new.prestation, new.technologie, new.largeur_min_mm, new.largeur_max_mm,
      new.longueur_min_mm, new.longueur_max_mm, new.supports_compatibles, new.matieres, new.finitions,
      new.quantite_min, new.capacite_journaliere, new.capacite_hebdomadaire, new.unite_capacite,
      new.delai_jours, new.delai_express_jours)
     is distinct from
     (old.categorie, old.prestation, old.technologie, old.largeur_min_mm, old.largeur_max_mm,
      old.longueur_min_mm, old.longueur_max_mm, old.supports_compatibles, old.matieres, old.finitions,
      old.quantite_min, old.capacite_journaliere, old.capacite_hebdomadaire, old.unite_capacite,
      old.delai_jours, old.delai_express_jours) then
    new.statut_validation := 'A_VALIDER';
    new.valide_par := null;
    new.valide_le := null;
    new.motif_refus := null;
  end if;
  return new;
end;
$$;

drop trigger if exists partenaire_capacites_validation on public.partenaire_capacites;
create trigger partenaire_capacites_validation before update on public.partenaire_capacites
  for each row execute function public.reinitialiser_validation_capacite();

create table if not exists public.partenaire_capacite_machines (
  capacite_id uuid not null references public.partenaire_capacites (id) on delete cascade,
  machine_id uuid not null references public.partenaire_machines (id) on delete cascade,
  primary key (capacite_id, machine_id)
);

create index if not exists partenaire_capacite_machines_machine_idx
  on public.partenaire_capacite_machines (machine_id);

/* ============================================================= services ==== */

create table if not exists public.partenaire_services (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  capacite_id uuid references public.partenaire_capacites (id) on delete set null,
  nom text not null check (char_length(trim(nom)) between 2 and 120),
  categorie text not null
    check (categorie in ('IMPRESSION', 'IMPRESSION_FINITION', 'CREATION_GRAPHIQUE', 'DECOUPE_POSE',
                         'LIVRAISON', 'INSTALLATION', 'MONTAGE', 'FACONNAGE', 'AUTRE')),
  description text check (description is null or char_length(description) <= 2000),
  delai_jours integer check (delai_jours is null or delai_jours between 0 and 365),
  quantite_min integer check (quantite_min is null or quantite_min > 0),
  conditions text check (conditions is null or char_length(conditions) <= 2000),
  -- Le partenaire fait réaliser tout ou partie du service par un autre atelier (CDC §7).
  realise_par_tiers boolean not null default false,
  tiers_precision text check (tiers_precision is null or char_length(tiers_precision) <= 1000),
  statut_validation text not null default 'A_VALIDER'
    check (statut_validation in ('A_VALIDER', 'VALIDEE', 'REFUSEE')),
  valide_par uuid references auth.users (id) on delete set null,
  valide_le timestamptz,
  motif_refus text check (motif_refus is null or char_length(motif_refus) <= 1000),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint partenaire_services_tiers check (not realise_par_tiers or coalesce(trim(tiers_precision), '') <> ''),
  constraint partenaire_services_validation
    check ((statut_validation <> 'VALIDEE' or valide_le is not null)
       and (statut_validation <> 'REFUSEE' or motif_refus is not null))
);

create index if not exists partenaire_services_partenaire_idx on public.partenaire_services (partenaire_id);
create index if not exists partenaire_services_capacite_idx on public.partenaire_services (capacite_id);

drop trigger if exists partenaire_services_maj_le on public.partenaire_services;
create trigger partenaire_services_maj_le before update on public.partenaire_services
  for each row execute function public.set_maj_le();

create or replace function public.reinitialiser_validation_service()
returns trigger
language plpgsql
as $$
begin
  if (new.capacite_id, new.categorie, new.realise_par_tiers, new.tiers_precision, new.quantite_min, new.delai_jours)
     is distinct from
     (old.capacite_id, old.categorie, old.realise_par_tiers, old.tiers_precision, old.quantite_min, old.delai_jours) then
    new.statut_validation := 'A_VALIDER';
    new.valide_par := null;
    new.valide_le := null;
    new.motif_refus := null;
  end if;
  return new;
end;
$$;

drop trigger if exists partenaire_services_validation on public.partenaire_services;
create trigger partenaire_services_validation before update on public.partenaire_services
  for each row execute function public.reinitialiser_validation_service();

/* =============================================================== tarifs ==== */

create table if not exists public.partenaire_tarifs (
  id uuid primary key default gen_random_uuid(),
  -- Toutes les versions d'un même tarif partagent la lignée (= id de la version 1).
  lignee_id uuid not null,
  version integer not null default 1 check (version > 0),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  service_id uuid references public.partenaire_services (id) on delete restrict,
  capacite_id uuid references public.partenaire_capacites (id) on delete restrict,
  nom text not null check (char_length(trim(nom)) between 2 and 120),
  mode_calcul text not null
    check (mode_calcul in ('AU_M2', 'AU_METRE_LINEAIRE', 'A_LA_PIECE', 'PAR_LOT', 'FORFAIT', 'A_L_HEURE')),
  nature text not null default 'PRESTATION'
    check (nature in ('PRESTATION', 'SUPPLEMENT_FINITION', 'LIVRAISON', 'INSTALLATION')),
  -- Prix de base. Null si le tarif est entièrement défini par paliers.
  prix_fcfa integer check (prix_fcfa is null or prix_fcfa between 0 and 100000000),
  conditions text check (conditions is null or char_length(conditions) <= 2000),
  statut text not null default 'PROPOSE'
    check (statut in ('PROPOSE', 'MODIFICATION_DEMANDEE', 'VALIDE', 'REFUSE', 'REMPLACE', 'RETIRE')),
  origine text not null check (origine in ('PARTENAIRE', 'SMART_VISION')),
  propose_par uuid references auth.users (id) on delete set null,
  valide_par uuid references auth.users (id) on delete set null,
  valide_par_email text,
  valide_le timestamptz,
  valide_du date,
  valide_jusquau date,
  motif_decision text check (motif_decision is null or char_length(motif_decision) <= 2000),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint partenaire_tarifs_version_unique unique (lignee_id, version),
  constraint partenaire_tarifs_validation
    check (statut not in ('VALIDE', 'REMPLACE')
           or (valide_par_email is not null and valide_le is not null and valide_du is not null)),
  constraint partenaire_tarifs_periode
    check (valide_jusquau is null or valide_du is null or valide_jusquau >= valide_du),
  constraint partenaire_tarifs_motif
    check (statut not in ('REFUSE', 'MODIFICATION_DEMANDEE') or coalesce(trim(motif_decision), '') <> '')
);

comment on table public.partenaire_tarifs is
  'Tarifs négociés (coût fournisseur) — CONFIDENTIELS : admin et finance côté Smart Vision, responsable côté partenaire. Une version validée est immuable.';

-- Une seule version validée en vigueur par lignée.
create unique index if not exists partenaire_tarifs_un_valide
  on public.partenaire_tarifs (lignee_id) where statut = 'VALIDE';
-- Une seule version en cours de discussion par lignée.
create unique index if not exists partenaire_tarifs_un_en_cours
  on public.partenaire_tarifs (lignee_id) where statut in ('PROPOSE', 'MODIFICATION_DEMANDEE');
create index if not exists partenaire_tarifs_partenaire_idx on public.partenaire_tarifs (partenaire_id, statut);
create index if not exists partenaire_tarifs_service_idx on public.partenaire_tarifs (service_id);
create index if not exists partenaire_tarifs_capacite_idx on public.partenaire_tarifs (capacite_id);
create index if not exists partenaire_tarifs_validite_idx
  on public.partenaire_tarifs (partenaire_id, valide_du, valide_jusquau) where statut = 'VALIDE';

drop trigger if exists partenaire_tarifs_maj_le on public.partenaire_tarifs;
create trigger partenaire_tarifs_maj_le before update on public.partenaire_tarifs
  for each row execute function public.set_maj_le();

create table if not exists public.partenaire_tarif_paliers (
  id uuid primary key default gen_random_uuid(),
  tarif_id uuid not null references public.partenaire_tarifs (id) on delete cascade,
  quantite_min integer not null check (quantite_min between 1 and 100000000),
  quantite_max integer check (quantite_max is null or quantite_max >= quantite_min),
  -- Null = « sur négociation » au-delà de ce seuil.
  prix_unitaire_fcfa integer check (prix_unitaire_fcfa is null or prix_unitaire_fcfa between 0 and 100000000),
  constraint partenaire_tarif_paliers_unique unique (tarif_id, quantite_min)
);

/*
 * Transitions d'un tarif. Reflétée par `TRANSITIONS_TARIF` (src/lib/partenaires/statuts.ts).
 */
create or replace function public.transition_tarif_autorisee(ancien text, nouveau text)
returns boolean
language sql
immutable
as $$
  select (ancien, nouveau) in (
    ('PROPOSE', 'VALIDE'),
    ('PROPOSE', 'REFUSE'),
    ('PROPOSE', 'MODIFICATION_DEMANDEE'),
    ('PROPOSE', 'RETIRE'),
    ('MODIFICATION_DEMANDEE', 'PROPOSE'),
    ('MODIFICATION_DEMANDEE', 'RETIRE'),
    ('VALIDE', 'REMPLACE'),
    ('VALIDE', 'RETIRE')
  );
$$;

/*
 * Un tarif sorti de la discussion (VALIDE, REFUSE, REMPLACE, RETIRE) est figé : seuls son
 * statut (selon les transitions) et sa fin de validité peuvent encore changer. Un nouveau prix
 * passe par une nouvelle version.
 */
create or replace function public.verifier_tarif_partenaire()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.lignee_id := coalesce(new.lignee_id, new.id);
    if new.statut not in ('PROPOSE') then
      raise exception 'Un tarif est toujours créé au statut PROPOSE' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.statut is distinct from old.statut
     and not public.transition_tarif_autorisee(old.statut, new.statut) then
    raise exception 'Transition de tarif interdite : % → %', old.statut, new.statut using errcode = '23514';
  end if;

  if (new.id, new.lignee_id, new.version, new.partenaire_id, new.origine)
     is distinct from (old.id, old.lignee_id, old.version, old.partenaire_id, old.origine)
     and old.statut not in ('PROPOSE', 'MODIFICATION_DEMANDEE') then
    raise exception 'L''identité d''un tarif décidé ne change pas' using errcode = '23514';
  end if;

  if old.statut in ('VALIDE', 'REFUSE', 'REMPLACE', 'RETIRE')
     and (new.service_id, new.capacite_id, new.nom, new.mode_calcul, new.nature, new.prix_fcfa,
          new.conditions, new.valide_du, new.valide_par, new.valide_le)
         is distinct from
         (old.service_id, old.capacite_id, old.nom, old.mode_calcul, old.nature, old.prix_fcfa,
          old.conditions, old.valide_du, old.valide_par, old.valide_le) then
    raise exception 'Un tarif % est figé : proposez une nouvelle version', old.statut using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists partenaire_tarifs_garde on public.partenaire_tarifs;
create trigger partenaire_tarifs_garde before insert or update on public.partenaire_tarifs
  for each row execute function public.verifier_tarif_partenaire();

-- Les paliers d'un tarif décidé sont figés comme son prix.
create or replace function public.verifier_palier_partenaire()
returns trigger
language plpgsql
as $$
declare
  v_statut text;
begin
  select statut into v_statut
    from public.partenaire_tarifs
   where id = case when tg_op = 'DELETE' then old.tarif_id else new.tarif_id end;
  -- Tarif absent : suppression en cascade du tarif ou du partenaire.
  if v_statut is not null and v_statut not in ('PROPOSE', 'MODIFICATION_DEMANDEE') then
    raise exception 'Les paliers d''un tarif % sont figés', v_statut using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.tarif_id <> old.tarif_id then
    raise exception 'Un palier ne change pas de tarif' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists partenaire_tarif_paliers_garde on public.partenaire_tarif_paliers;
create trigger partenaire_tarif_paliers_garde
  before insert or update or delete on public.partenaire_tarif_paliers
  for each row execute function public.verifier_palier_partenaire();

/*
 * Cohérence d'un tarif complet : un prix de base ou au moins un palier ; paliers contigus, sans
 * chevauchement, un seul palier ouvert (sans maximum) et en dernier. Renvoie null si tout est
 * correct, sinon le motif. Même règle que `verifierPaliers` (src/lib/partenaires/paliers.ts).
 */
create or replace function public.erreur_paliers_tarif(p_tarif_id uuid)
returns text
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_prix integer;
  v_nb integer := 0;
  v_precedent_max integer;
  v_ouvert boolean := false;
  r record;
begin
  select prix_fcfa into v_prix from public.partenaire_tarifs where id = p_tarif_id;
  for r in
    select quantite_min, quantite_max from public.partenaire_tarif_paliers
     where tarif_id = p_tarif_id order by quantite_min
  loop
    v_nb := v_nb + 1;
    if v_ouvert then
      return 'Seul le dernier palier peut être sans quantité maximale';
    end if;
    if v_nb > 1 and r.quantite_min <> v_precedent_max + 1 then
      return format('Les paliers doivent se suivre sans trou ni chevauchement (palier à partir de %s)', r.quantite_min);
    end if;
    v_precedent_max := r.quantite_max;
    v_ouvert := r.quantite_max is null;
  end loop;
  if v_nb > 20 then
    return 'Vingt paliers au maximum';
  end if;
  if v_prix is null and v_nb = 0 then
    return 'Indiquez un prix ou au moins un palier';
  end if;
  return null;
end;
$$;

/* ======================================================= disponibilités ==== */

create table if not exists public.partenaire_disponibilites (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  statut text not null
    check (statut in ('DISPONIBLE', 'ACTIVITE_NORMALE', 'CAPACITE_REDUITE', 'SATURE', 'MAINTENANCE', 'INDISPONIBLE')),
  debut_periode date not null,
  fin_periode date,
  delai_moyen_jours integer check (delai_moyen_jours is null or delai_moyen_jours between 0 and 365),
  commentaire text check (commentaire is null or char_length(commentaire) <= 1000),
  declare_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  constraint partenaire_disponibilites_periode check (fin_periode is null or fin_periode >= debut_periode)
);

comment on table public.partenaire_disponibilites is
  'Déclarations de disponibilité, jamais modifiées (historique). La disponibilité courante est la dernière déclaration couvrant la date du jour.';

create index if not exists partenaire_disponibilites_idx
  on public.partenaire_disponibilites (partenaire_id, debut_periode desc, cree_le desc);

/* ============================================================== fichiers ==== */

create table if not exists public.partenaire_fichiers (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  machine_id uuid references public.partenaire_machines (id) on delete cascade,
  type_fichier text not null check (type_fichier in ('LOGO', 'ATELIER', 'MACHINE', 'DOCUMENT', 'PORTFOLIO')),
  chemin text not null unique check (char_length(chemin) <= 300),
  nom_original text check (nom_original is null or char_length(nom_original) <= 200),
  type_mime text not null check (type_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  taille_octets integer not null check (taille_octets between 1 and 10485760),
  envoye_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  constraint partenaire_fichiers_machine check ((type_fichier = 'MACHINE') = (machine_id is not null)),
  -- Le chemin commence toujours par l'entreprise propriétaire (cloisonnement du bucket).
  constraint partenaire_fichiers_chemin check (chemin like partenaire_id::text || '/%')
);

create index if not exists partenaire_fichiers_partenaire_idx on public.partenaire_fichiers (partenaire_id, type_fichier);
create index if not exists partenaire_fichiers_machine_idx on public.partenaire_fichiers (machine_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partenaires', 'partenaires', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ============================================ cohérence inter-entreprises ==== */

/*
 * Un objet ne peut référencer qu'un objet DE LA MÊME entreprise. Sans ce contrôle, un
 * identifiant forgé relierait la capacité de A à la machine de B (ou un tarif de A au service
 * de B).
 */
create or replace function public.verifier_meme_partenaire()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attendu uuid;
begin
  if tg_table_name = 'partenaire_capacite_machines' then
    select partenaire_id into v_attendu from public.partenaire_capacites where id = new.capacite_id;
    if not exists (select 1 from public.partenaire_machines where id = new.machine_id and partenaire_id = v_attendu) then
      raise exception 'Machine et capacité de partenaires différents' using errcode = '23514';
    end if;
  elsif tg_table_name = 'partenaire_services' then
    if new.capacite_id is not null and not exists (
      select 1 from public.partenaire_capacites where id = new.capacite_id and partenaire_id = new.partenaire_id
    ) then
      raise exception 'Capacité d''un autre partenaire' using errcode = '23514';
    end if;
  elsif tg_table_name = 'partenaire_tarifs' then
    if new.capacite_id is not null and not exists (
      select 1 from public.partenaire_capacites where id = new.capacite_id and partenaire_id = new.partenaire_id
    ) then
      raise exception 'Capacité d''un autre partenaire' using errcode = '23514';
    end if;
    if new.service_id is not null and not exists (
      select 1 from public.partenaire_services where id = new.service_id and partenaire_id = new.partenaire_id
    ) then
      raise exception 'Service d''un autre partenaire' using errcode = '23514';
    end if;
    if new.lignee_id <> new.id and not exists (
      select 1 from public.partenaire_tarifs where lignee_id = new.lignee_id and partenaire_id = new.partenaire_id and id <> new.id
    ) then
      raise exception 'Lignée de tarif d''un autre partenaire' using errcode = '23514';
    end if;
  elsif tg_table_name = 'partenaire_fichiers' then
    if new.machine_id is not null and not exists (
      select 1 from public.partenaire_machines where id = new.machine_id and partenaire_id = new.partenaire_id
    ) then
      raise exception 'Machine d''un autre partenaire' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists partenaire_capacite_machines_coherence on public.partenaire_capacite_machines;
create trigger partenaire_capacite_machines_coherence
  before insert or update on public.partenaire_capacite_machines
  for each row execute function public.verifier_meme_partenaire();
drop trigger if exists partenaire_services_coherence on public.partenaire_services;
create trigger partenaire_services_coherence
  before insert or update of capacite_id, partenaire_id on public.partenaire_services
  for each row execute function public.verifier_meme_partenaire();
-- S'exécute AVANT `partenaire_tarifs_garde` (ordre alphabétique) : à l'insertion d'une nouvelle
-- lignée, `lignee_id` est encore null et le contrôle de lignée ne s'applique pas (rien à vérifier).
drop trigger if exists partenaire_tarifs_coherence on public.partenaire_tarifs;
create trigger partenaire_tarifs_coherence
  before insert or update of capacite_id, service_id, partenaire_id, lignee_id on public.partenaire_tarifs
  for each row execute function public.verifier_meme_partenaire();
drop trigger if exists partenaire_fichiers_coherence on public.partenaire_fichiers;
create trigger partenaire_fichiers_coherence
  before insert or update of machine_id, partenaire_id on public.partenaire_fichiers
  for each row execute function public.verifier_meme_partenaire();

/* ============================================================ notes internes ==== */

alter table public.notes_internes drop constraint if exists notes_internes_entite_check;
alter table public.notes_internes
  add constraint notes_internes_entite_check check (entite in ('commande', 'client', 'devis', 'partenaire'));

/* ================================================== session du portail (RLS) ==== */

/*
 * Entreprise de l'utilisateur connecté, ou null. Exige : association active, e-mail confirmé,
 * entreprise ni suspendue ni archivée, et AUCUN rôle staff dans le jeton.
 * `security definer` : lit auth.users et évite la récursion RLS dans les politiques.
 */
create or replace function public.partenaire_session()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select pu.partenaire_id
    from public.partenaire_utilisateurs pu
    join public.partenaires p on p.id = pu.partenaire_id
    join auth.users u on u.id = pu.user_id
   where pu.user_id = auth.uid()
     and pu.actif
     and p.statut not in ('SUSPENDU', 'ARCHIVE')
     and u.email_confirmed_at is not null
     and public.jwt_role() = ''
   limit 1;
$$;

create or replace function public.role_partenaire_session()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select pu.role_partenaire
    from public.partenaire_utilisateurs pu
   where pu.user_id = auth.uid()
     and pu.actif
     and pu.partenaire_id = public.partenaire_session()
   limit 1;
$$;

/*
 * Fiche de l'entreprise de la session, colonnes autorisées uniquement : ni note interne, ni
 * tarifs hérités, ni auteur de validation.
 */
create or replace function public.mon_partenaire()
returns table (
  id uuid, nom text, raison_sociale text, specialite text, description text,
  annee_creation smallint, rccm text, niu text, site_web text,
  telephone text, whatsapp text, email text, contact_nom text, contact_fonction text,
  adresse text, ville text, quartier text, localisation text, zone_desservie text,
  delai_jours integer, quantites_minimales text, conditions_particulieres text,
  statut text, motif_decision text, soumis_le timestamptz, valide_le timestamptz,
  cree_le timestamptz, maj_le timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p.id, p.nom, p.raison_sociale, p.specialite, p.description,
         p.annee_creation, p.rccm, p.niu, p.site_web,
         p.telephone, p.whatsapp, p.email, p.contact_nom, p.contact_fonction,
         p.adresse, p.ville, p.quartier, p.localisation, p.zone_desservie,
         p.delai_jours, p.quantites_minimales, p.conditions_particulieres,
         p.statut, p.motif_decision, p.soumis_le, p.valide_le,
         p.cree_le, p.maj_le
    from public.partenaires p
   where p.id = public.partenaire_session();
$$;

/* ================================================== transitions métier ==== */

/*
 * Première connexion d'un compte inscrit depuis le portail : crée l'entreprise (BROUILLON) et
 * rattache le compte comme RESPONSABLE, dans une transaction. Idempotente par compte.
 */
create or replace function public.creer_partenaire_inscription(
  p_user_id uuid,
  p_nom text,
  p_telephone text
) returns table (partenaire_id uuid, deja_existant boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user auth.users;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('partenaire_inscription:' || p_user_id::text));

  select * into v_user from auth.users where id = p_user_id;
  if v_user.id is null then
    raise exception 'Compte introuvable' using errcode = 'P0002';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'Adresse e-mail non confirmée' using errcode = '42501';
  end if;
  if coalesce(v_user.raw_app_meta_data ->> 'role', '') <> '' then
    raise exception 'Un compte du personnel ne peut pas créer de partenaire' using errcode = '42501';
  end if;

  select pu.partenaire_id into v_id
    from public.partenaire_utilisateurs pu
   where pu.user_id = p_user_id and pu.actif;
  if v_id is not null then
    partenaire_id := v_id;
    deja_existant := true;
    return next;
    return;
  end if;

  if char_length(trim(coalesce(p_nom, ''))) not between 2 and 120 then
    raise exception 'Nom d''entreprise invalide' using errcode = '22023';
  end if;

  insert into public.partenaires (nom, specialite, telephone, email, statut, origine, actif)
  values (trim(p_nom), 'À préciser', nullif(trim(coalesce(p_telephone, '')), ''),
          lower(v_user.email), 'BROUILLON', 'INSCRIPTION', true)
  returning id into v_id;

  insert into public.partenaire_utilisateurs (partenaire_id, user_id, role_partenaire)
  values (v_id, p_user_id, 'RESPONSABLE');

  partenaire_id := v_id;
  deja_existant := false;
  return next;
end;
$$;

/*
 * Acceptation d'une invitation : usage unique, non expirée, adressée à l'e-mail du compte.
 */
create or replace function public.accepter_invitation_partenaire(
  p_jeton_hash text,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_inv public.partenaire_invitations;
  v_user auth.users;
  v_statut text;
  v_autre uuid;
begin
  select * into v_inv from public.partenaire_invitations where jeton_hash = p_jeton_hash for update;
  if v_inv.id is null or v_inv.revoquee_le is not null or v_inv.acceptee_le is not null
     or v_inv.expire_le <= now() then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if v_user.id is null or v_user.email_confirmed_at is null then
    raise exception 'Compte non confirmé' using errcode = '42501';
  end if;
  if lower(v_user.email) <> v_inv.email then
    raise exception 'Cette invitation est destinée à une autre adresse e-mail' using errcode = '42501';
  end if;

  select statut into v_statut from public.partenaires where id = v_inv.partenaire_id for update;
  if v_statut in ('SUSPENDU', 'ARCHIVE') then
    raise exception 'Ce partenaire n''accepte pas de nouveaux comptes' using errcode = '42501';
  end if;

  select partenaire_id into v_autre
    from public.partenaire_utilisateurs
   where user_id = p_user_id and actif and partenaire_id <> v_inv.partenaire_id;
  if v_autre is not null then
    raise exception 'Ce compte est déjà rattaché à une autre entreprise' using errcode = '23505';
  end if;

  insert into public.partenaire_utilisateurs (partenaire_id, user_id, role_partenaire, invite_par, actif)
  values (v_inv.partenaire_id, p_user_id, v_inv.role_partenaire, v_inv.invite_par, true)
  on conflict on constraint partenaire_utilisateurs_unique
  do update set actif = true, role_partenaire = excluded.role_partenaire;

  update public.partenaire_invitations
     set acceptee_le = now(), acceptee_par = p_user_id
   where id = v_inv.id;

  return v_inv.partenaire_id;
end;
$$;

/*
 * Le partenaire soumet son dossier. Minimum exigé (saisie progressive, CDC §24.4) : nom,
 * téléphone, une machine et une capacité.
 */
create or replace function public.soumettre_partenaire(p_partenaire_id uuid, p_acteur uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.partenaires;
  v_manque text[] := '{}';
begin
  select * into v from public.partenaires where id = p_partenaire_id for update;
  if v.id is null then
    raise exception 'Partenaire introuvable' using errcode = 'P0002';
  end if;
  if v.statut not in ('BROUILLON', 'REFUSE') then
    raise exception 'Dossier déjà soumis ou décidé (%)', v.statut using errcode = '23514';
  end if;

  if coalesce(trim(v.telephone), '') = '' then v_manque := v_manque || 'téléphone'::text; end if;
  if not exists (select 1 from public.partenaire_machines where partenaire_id = v.id and not archive) then
    v_manque := v_manque || 'au moins une machine'::text;
  end if;
  if not exists (select 1 from public.partenaire_capacites where partenaire_id = v.id and actif) then
    v_manque := v_manque || 'au moins une capacité de production'::text;
  end if;
  if cardinality(v_manque) > 0 then
    raise exception 'Dossier incomplet : %', array_to_string(v_manque, ', ') using errcode = '23514';
  end if;

  perform set_config('app.acteur_id', coalesce(p_acteur::text, ''), true);
  update public.partenaires
     set statut = 'EN_ATTENTE_VALIDATION', soumis_le = now()
   where id = v.id;
  return 'EN_ATTENTE_VALIDATION';
end;
$$;

/*
 * Décision de Smart Vision sur une entreprise : VALIDE, REFUSE, BROUILLON (compléments
 * demandés), SUSPENDU, ARCHIVE. Les transitions sont contrôlées par le trigger.
 */
create or replace function public.decider_partenaire(
  p_partenaire_id uuid,
  p_statut text,
  p_motif text,
  p_acteur uuid,
  p_acteur_email text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.partenaires;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
begin
  if p_statut not in ('VALIDE', 'REFUSE', 'BROUILLON', 'SUSPENDU', 'ARCHIVE') then
    raise exception 'Décision inconnue : %', p_statut using errcode = '22023';
  end if;
  if p_statut in ('REFUSE', 'BROUILLON', 'SUSPENDU') and v_motif is null then
    raise exception 'Un motif est obligatoire' using errcode = '23514';
  end if;

  select * into v from public.partenaires where id = p_partenaire_id for update;
  if v.id is null then
    raise exception 'Partenaire introuvable' using errcode = 'P0002';
  end if;
  if v.statut = p_statut then
    raise exception 'Le partenaire est déjà au statut %', p_statut using errcode = '23514';
  end if;

  perform set_config('app.acteur_id', coalesce(p_acteur::text, ''), true);
  update public.partenaires
     set statut = p_statut,
         motif_decision = case when p_statut = 'VALIDE' then null else coalesce(v_motif, motif_decision) end,
         valide_par = case when p_statut = 'VALIDE' then p_acteur else valide_par end,
         valide_par_email = case when p_statut = 'VALIDE' then p_acteur_email else valide_par_email end,
         valide_le = case when p_statut = 'VALIDE' then now() else valide_le end
   where id = v.id;
  return p_statut;
end;
$$;

/*
 * Proposition (ou saisie par Smart Vision) d'un tarif et de ses paliers, en une transaction.
 *  - sans lignée : nouveau tarif, version 1 ;
 *  - lignée avec une version en discussion : cette version est remplacée sur place ;
 *  - lignée sans version en discussion : nouvelle version (max + 1).
 * Le tarif est TOUJOURS créé au statut PROPOSE : la validation est un acte séparé.
 * p_tarif : {nom, mode_calcul, nature, prix_fcfa, conditions, service_id, capacite_id}
 * p_paliers : [{quantite_min, quantite_max, prix_unitaire_fcfa}, …]
 */
create or replace function public.proposer_tarif_partenaire(
  p_partenaire_id uuid,
  p_lignee_id uuid,
  p_origine text,
  p_acteur uuid,
  p_tarif jsonb,
  p_paliers jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_statut text;
  v_tarif_id uuid;
  v_version integer := 1;
  v_erreur text;
  v_palier jsonb;
begin
  if p_origine not in ('PARTENAIRE', 'SMART_VISION') then
    raise exception 'Origine inconnue' using errcode = '22023';
  end if;
  if p_tarif is null or jsonb_typeof(p_tarif) <> 'object' then
    raise exception 'Tarif manquant' using errcode = '22023';
  end if;
  if p_paliers is not null and jsonb_typeof(p_paliers) <> 'array' then
    raise exception 'Paliers invalides' using errcode = '22023';
  end if;

  select statut into v_statut from public.partenaires where id = p_partenaire_id for update;
  if v_statut is null then
    raise exception 'Partenaire introuvable' using errcode = 'P0002';
  end if;
  if v_statut in ('SUSPENDU', 'ARCHIVE') then
    raise exception 'Partenaire % : aucun tarif ne peut être proposé', v_statut using errcode = '42501';
  end if;

  if p_lignee_id is not null then
    if not exists (select 1 from public.partenaire_tarifs where lignee_id = p_lignee_id and partenaire_id = p_partenaire_id) then
      raise exception 'Tarif introuvable' using errcode = 'P0002';
    end if;
    select id into v_tarif_id
      from public.partenaire_tarifs
     where lignee_id = p_lignee_id and statut in ('PROPOSE', 'MODIFICATION_DEMANDEE')
     for update;
    if v_tarif_id is null then
      select coalesce(max(version), 0) + 1 into v_version from public.partenaire_tarifs where lignee_id = p_lignee_id;
    end if;
  end if;

  if v_tarif_id is not null then
    update public.partenaire_tarifs
       set nom = p_tarif ->> 'nom',
           mode_calcul = p_tarif ->> 'mode_calcul',
           nature = coalesce(p_tarif ->> 'nature', 'PRESTATION'),
           prix_fcfa = nullif(p_tarif ->> 'prix_fcfa', '')::integer,
           conditions = nullif(p_tarif ->> 'conditions', ''),
           service_id = nullif(p_tarif ->> 'service_id', '')::uuid,
           capacite_id = nullif(p_tarif ->> 'capacite_id', '')::uuid,
           statut = 'PROPOSE',
           origine = p_origine,
           propose_par = p_acteur,
           motif_decision = null
     where id = v_tarif_id;
    delete from public.partenaire_tarif_paliers where tarif_id = v_tarif_id;
  else
    insert into public.partenaire_tarifs (
      lignee_id, version, partenaire_id, service_id, capacite_id, nom, mode_calcul, nature,
      prix_fcfa, conditions, statut, origine, propose_par
    ) values (
      p_lignee_id, v_version, p_partenaire_id,
      nullif(p_tarif ->> 'service_id', '')::uuid, nullif(p_tarif ->> 'capacite_id', '')::uuid,
      p_tarif ->> 'nom', p_tarif ->> 'mode_calcul', coalesce(p_tarif ->> 'nature', 'PRESTATION'),
      nullif(p_tarif ->> 'prix_fcfa', '')::integer, nullif(p_tarif ->> 'conditions', ''),
      'PROPOSE', p_origine, p_acteur
    ) returning id into v_tarif_id;
  end if;

  for v_palier in select * from jsonb_array_elements(coalesce(p_paliers, '[]'::jsonb)) loop
    insert into public.partenaire_tarif_paliers (tarif_id, quantite_min, quantite_max, prix_unitaire_fcfa)
    values (
      v_tarif_id,
      (v_palier ->> 'quantite_min')::integer,
      nullif(v_palier ->> 'quantite_max', '')::integer,
      nullif(v_palier ->> 'prix_unitaire_fcfa', '')::integer
    );
  end loop;

  v_erreur := public.erreur_paliers_tarif(v_tarif_id);
  if v_erreur is not null then
    raise exception '%', v_erreur using errcode = '23514';
  end if;

  return v_tarif_id;
end;
$$;

/*
 * Validation d'une version proposée. La version validée précédente de la lignée passe à
 * REMPLACE dans la même transaction (l'index unique n'admet qu'une version VALIDE).
 */
create or replace function public.valider_tarif_partenaire(
  p_tarif_id uuid,
  p_acteur uuid,
  p_acteur_email text,
  p_valide_du date,
  p_valide_jusquau date
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.partenaire_tarifs;
  v_du date := coalesce(p_valide_du, current_date);
  v_erreur text;
begin
  if coalesce(trim(p_acteur_email), '') = '' then
    raise exception 'Auteur de la validation manquant' using errcode = '22023';
  end if;
  select * into v from public.partenaire_tarifs where id = p_tarif_id for update;
  if v.id is null then
    raise exception 'Tarif introuvable' using errcode = 'P0002';
  end if;
  if v.statut <> 'PROPOSE' then
    raise exception 'Seul un tarif proposé peut être validé (statut : %)', v.statut using errcode = '23514';
  end if;
  if p_valide_jusquau is not null and p_valide_jusquau < v_du then
    raise exception 'Fin de validité antérieure au début' using errcode = '23514';
  end if;
  v_erreur := public.erreur_paliers_tarif(v.id);
  if v_erreur is not null then
    raise exception '%', v_erreur using errcode = '23514';
  end if;

  update public.partenaire_tarifs
     set statut = 'REMPLACE',
         valide_jusquau = greatest(valide_du, least(coalesce(valide_jusquau, v_du - 1), v_du - 1))
   where lignee_id = v.lignee_id and statut = 'VALIDE';

  update public.partenaire_tarifs
     set statut = 'VALIDE',
         valide_par = p_acteur,
         valide_par_email = trim(p_acteur_email),
         valide_le = now(),
         valide_du = v_du,
         valide_jusquau = p_valide_jusquau,
         motif_decision = null
   where id = v.id;
  return v.id;
end;
$$;

/* ======================================================= reprise (données) ==== */

/*
 * 1. Capacités : les types d'impression et dimensions saisis sur les fiches deviennent des
 *    capacités grand format. Elles avaient été saisies par Smart Vision : elles sont reprises
 *    VALIDEE (datées de la migration, sans auteur nominatif).
 */
insert into public.partenaire_capacites (
  partenaire_id, categorie, prestation, nom, largeur_max_mm, longueur_max_mm, unite_capacite,
  delai_jours, statut_validation, valide_le, contraintes
)
select p.id, 'GRAND_FORMAT', t.type,
       coalesce(tg.libelle, initcap(replace(lower(t.type), '_', ' '))),
       case when p.largeur_max_m is not null then round(p.largeur_max_m * 1000)::integer end,
       case when p.longueur_max_m is not null then round(p.longueur_max_m * 1000)::integer end,
       'M2', p.delai_jours, 'VALIDEE', now(),
       'Reprise de la fiche prestataire (migration 0012).'
  from public.partenaires p
  cross join lateral unnest(p.types_impression) as t(type)
  left join public.tarifs_grand_format tg on tg.support = t.type
 where t.type ~ '^[A-Z0-9_]{2,40}$'
   and not exists (
     select 1 from public.partenaire_capacites c where c.partenaire_id = p.id and c.prestation = t.type
   );

/*
 * 2. Tarifs : l'ancien prix au m² devient un tarif PROPOSE d'origine SMART_VISION. Il n'avait
 *    jamais été validé formellement : la finance le valide une fois dans le back-office.
 */
insert into public.partenaire_tarifs (partenaire_id, nom, mode_calcul, nature, prix_fcfa, conditions, statut, origine)
select p.id, 'Impression grand format au m² (reprise)', 'AU_M2', 'PRESTATION',
       (p.tarifs ->> 'prix_m2_fcfa')::integer,
       nullif(left(coalesce(p.tarifs ->> 'conditions', ''), 2000), ''),
       'PROPOSE', 'SMART_VISION'
  from public.partenaires p
 where jsonb_typeof(p.tarifs -> 'prix_m2_fcfa') = 'number'
   and (p.tarifs ->> 'prix_m2_fcfa')::numeric between 0 and 100000000
   and (p.tarifs ->> 'prix_m2_fcfa')::numeric = trunc((p.tarifs ->> 'prix_m2_fcfa')::numeric)
   and not exists (select 1 from public.partenaire_tarifs t where t.partenaire_id = p.id);

/* ============================================================ RLS et droits ==== */

alter table public.historique_statuts_partenaire enable row level security;
alter table public.partenaire_utilisateurs enable row level security;
alter table public.partenaire_invitations enable row level security;
alter table public.partenaire_machines enable row level security;
alter table public.partenaire_capacites enable row level security;
alter table public.partenaire_capacite_machines enable row level security;
alter table public.partenaire_services enable row level security;
alter table public.partenaire_tarifs enable row level security;
alter table public.partenaire_tarif_paliers enable row level security;
alter table public.partenaire_disponibilites enable row level security;
alter table public.partenaire_fichiers enable row level security;

-- `partenaires` : la politique staff existante est conservée. AUCUNE politique partenaire :
-- un partenaire lit sa fiche par `mon_partenaire()` (colonnes autorisées seulement).

drop policy if exists historique_statuts_partenaire_select on public.historique_statuts_partenaire;
create policy historique_statuts_partenaire_select on public.historique_statuts_partenaire
  for select to authenticated
  using (public.is_staff() or partenaire_id = public.partenaire_session());

drop policy if exists partenaire_utilisateurs_select on public.partenaire_utilisateurs;
create policy partenaire_utilisateurs_select on public.partenaire_utilisateurs
  for select to authenticated
  using (public.is_staff() or partenaire_id = public.partenaire_session());

drop policy if exists partenaire_invitations_select on public.partenaire_invitations;
create policy partenaire_invitations_select on public.partenaire_invitations
  for select to authenticated
  using (public.has_role(array['admin']));

drop policy if exists partenaire_machines_select on public.partenaire_machines;
create policy partenaire_machines_select on public.partenaire_machines
  for select to authenticated
  using (public.is_staff() or partenaire_id = public.partenaire_session());

drop policy if exists partenaire_capacites_select on public.partenaire_capacites;
create policy partenaire_capacites_select on public.partenaire_capacites
  for select to authenticated
  using (public.is_staff() or partenaire_id = public.partenaire_session());

drop policy if exists partenaire_capacite_machines_select on public.partenaire_capacite_machines;
create policy partenaire_capacite_machines_select on public.partenaire_capacite_machines
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.partenaire_capacites c
       where c.id = capacite_id and c.partenaire_id = public.partenaire_session()
    )
  );

drop policy if exists partenaire_services_select on public.partenaire_services;
create policy partenaire_services_select on public.partenaire_services
  for select to authenticated
  using (public.is_staff() or partenaire_id = public.partenaire_session());

-- Tarifs : confidentiels. Admin et finance ; côté partenaire, le responsable seulement.
drop policy if exists partenaire_tarifs_select on public.partenaire_tarifs;
create policy partenaire_tarifs_select on public.partenaire_tarifs
  for select to authenticated
  using (
    public.has_role(array['admin', 'finance'])
    or (partenaire_id = public.partenaire_session() and public.role_partenaire_session() = 'RESPONSABLE')
  );

drop policy if exists partenaire_tarif_paliers_select on public.partenaire_tarif_paliers;
create policy partenaire_tarif_paliers_select on public.partenaire_tarif_paliers
  for select to authenticated
  using (
    public.has_role(array['admin', 'finance'])
    or (
      public.role_partenaire_session() = 'RESPONSABLE'
      and exists (
        select 1 from public.partenaire_tarifs t
         where t.id = tarif_id and t.partenaire_id = public.partenaire_session()
      )
    )
  );

drop policy if exists partenaire_disponibilites_select on public.partenaire_disponibilites;
create policy partenaire_disponibilites_select on public.partenaire_disponibilites
  for select to authenticated
  using (public.is_staff() or partenaire_id = public.partenaire_session());

drop policy if exists partenaire_fichiers_select on public.partenaire_fichiers;
create policy partenaire_fichiers_select on public.partenaire_fichiers
  for select to authenticated
  using (public.is_staff() or partenaire_id = public.partenaire_session());

revoke all on public.historique_statuts_partenaire, public.partenaire_utilisateurs,
  public.partenaire_invitations, public.partenaire_machines, public.partenaire_capacites,
  public.partenaire_capacite_machines, public.partenaire_services, public.partenaire_tarifs,
  public.partenaire_tarif_paliers, public.partenaire_disponibilites, public.partenaire_fichiers
  from anon, authenticated;

grant select on public.historique_statuts_partenaire, public.partenaire_utilisateurs,
  public.partenaire_invitations, public.partenaire_machines, public.partenaire_capacites,
  public.partenaire_capacite_machines, public.partenaire_services, public.partenaire_tarifs,
  public.partenaire_tarif_paliers, public.partenaire_disponibilites, public.partenaire_fichiers
  to authenticated;

grant all on public.partenaire_utilisateurs, public.partenaire_invitations,
  public.partenaire_machines, public.partenaire_capacites, public.partenaire_capacite_machines,
  public.partenaire_services, public.partenaire_tarifs, public.partenaire_tarif_paliers,
  public.partenaire_fichiers
  to service_role;
-- Historiques : ajout et lecture seulement, jamais de réécriture.
grant select, insert on public.historique_statuts_partenaire, public.partenaire_disponibilites to service_role;
grant usage on sequence public.historique_statuts_partenaire_id_seq to service_role;

-- Fonctions de session : appelées par les politiques et par le portail (session utilisateur).
revoke all on function public.partenaire_session() from public, anon;
revoke all on function public.role_partenaire_session() from public, anon;
revoke all on function public.mon_partenaire() from public, anon;
grant execute on function public.partenaire_session() to authenticated, service_role;
grant execute on function public.role_partenaire_session() to authenticated, service_role;
grant execute on function public.mon_partenaire() to authenticated, service_role;

-- Fonctions internes et transitions : jamais appelables depuis le navigateur.
revoke all on function public.transition_partenaire_autorisee(text, text) from public, anon, authenticated;
revoke all on function public.transition_tarif_autorisee(text, text) from public, anon, authenticated;
revoke all on function public.verifier_transition_partenaire() from public, anon, authenticated;
revoke all on function public.verifier_utilisateur_partenaire() from public, anon, authenticated;
revoke all on function public.reinitialiser_validation_machine() from public, anon, authenticated;
revoke all on function public.reinitialiser_validation_capacite() from public, anon, authenticated;
revoke all on function public.reinitialiser_validation_service() from public, anon, authenticated;
revoke all on function public.verifier_tarif_partenaire() from public, anon, authenticated;
revoke all on function public.verifier_palier_partenaire() from public, anon, authenticated;
revoke all on function public.verifier_meme_partenaire() from public, anon, authenticated;
revoke all on function public.erreur_paliers_tarif(uuid) from public, anon, authenticated;
revoke all on function public.creer_partenaire_inscription(uuid, text, text) from public, anon, authenticated;
revoke all on function public.accepter_invitation_partenaire(text, uuid) from public, anon, authenticated;
revoke all on function public.soumettre_partenaire(uuid, uuid) from public, anon, authenticated;
revoke all on function public.decider_partenaire(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.proposer_tarif_partenaire(uuid, uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.valider_tarif_partenaire(uuid, uuid, text, date, date) from public, anon, authenticated;

grant execute on function public.transition_partenaire_autorisee(text, text) to service_role;
grant execute on function public.transition_tarif_autorisee(text, text) to service_role;
grant execute on function public.erreur_paliers_tarif(uuid) to service_role;
grant execute on function public.creer_partenaire_inscription(uuid, text, text) to service_role;
grant execute on function public.accepter_invitation_partenaire(text, uuid) to service_role;
grant execute on function public.soumettre_partenaire(uuid, uuid) to service_role;
grant execute on function public.decider_partenaire(uuid, text, text, uuid, text) to service_role;
grant execute on function public.proposer_tarif_partenaire(uuid, uuid, text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.valider_tarif_partenaire(uuid, uuid, text, date, date) to service_role;

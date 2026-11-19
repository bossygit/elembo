-- Migration 20261119120000 — Elembo Partners, Lot 2 (socle des affectations).
--
-- Objet : permettre à Smart Vision de proposer un travail à un atelier partenaire, à l'atelier
-- de l'accepter ou de le refuser, et de figer le tarif négocié au moment de la proposition.
--
-- Additive : aucune colonne existante n'est modifiée, aucune donnée n'est reprise. Les colonnes
-- `travaux_production.partenaire_id` et `demandes_grand_format.partenaire_id` restent les
-- colonnes lues par l'atelier ; elles sont écrites par le trigger de synchronisation à
-- l'acceptation, et effacées à l'annulation.
--
-- Décisions : docs/plan-lot-2.md §1.4 (validées le 19/11/2026).

begin;

/* ================================================================ socle ==== */

create sequence if not exists public.affectations_reference_seq;

create table if not exists public.affectations_production (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'AFF-' || to_char(now(), 'YYMMDD') || '-'
    || lpad(nextval('public.affectations_reference_seq')::text, 4, '0')
  ),
  partenaire_id uuid not null references public.partenaires (id) on delete restrict,
  commande_id uuid not null references public.commandes (id) on delete cascade,
  tache_id uuid references public.travaux_production (id) on delete cascade,
  devis_id uuid references public.demandes_grand_format (devis_id) on delete cascade,
  objet text not null check (objet in ('TACHE_PRODUCTION', 'BANDEROLE')),
  statut text not null default 'PROPOSEE'
    check (statut in ('PROPOSEE', 'ACCEPTEE', 'REFUSEE', 'ANNULEE', 'EXPIREE', 'TERMINEE')),

  -- Travail demandé (figé à la proposition).
  libelle text not null check (char_length(trim(libelle)) between 2 and 200),
  support text check (support is null or support ~ '^[A-Z0-9_]{2,40}$'),
  quantite integer check (quantite is null or quantite > 0),
  unite text check (unite is null or unite in ('M2', 'METRE_LINEAIRE', 'PIECE', 'HEURE', 'LOT')),
  surface_m2 numeric(12, 4) check (surface_m2 is null or surface_m2 > 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  priorite text not null default 'NORMALE' check (priorite in ('NORMALE', 'URGENTE')),
  date_debut_prevue date,
  date_fin_prevue date,
  date_limite_reponse timestamptz not null default now() + interval '72 hours',

  -- Instantané du tarif : jamais réécrit après l'insertion.
  tarif_id uuid references public.partenaire_tarifs (id) on delete set null,
  tarif_lignee_id uuid,
  tarif_version integer check (tarif_version is null or tarif_version > 0),
  tarif_nom text,
  tarif_mode_calcul text,
  tarif_prix_unitaire_fcfa integer check (tarif_prix_unitaire_fcfa is null or tarif_prix_unitaire_fcfa >= 0),
  quantite_base numeric(12, 4) check (quantite_base is null or quantite_base > 0),
  montant_fcfa integer not null check (montant_fcfa >= 0),
  tarif_source text not null check (tarif_source in ('TARIF_VALIDE', 'ANCIEN_PRIX', 'MANUEL', 'SUR_DEVIS')),
  tarif_motif text check (tarif_motif is null or char_length(tarif_motif) <= 1000),

  -- Cycle de vie.
  proposee_le timestamptz not null default now(),
  proposee_par uuid references auth.users (id) on delete set null,
  acceptee_le timestamptz,
  acceptee_par uuid references auth.users (id) on delete set null,
  refusee_le timestamptz,
  refusee_par uuid references auth.users (id) on delete set null,
  motif_refus text check (motif_refus is null or char_length(motif_refus) <= 1000),
  annulee_le timestamptz,
  annulee_par uuid references auth.users (id) on delete set null,
  motif_annulation text check (motif_annulation is null or char_length(motif_annulation) <= 1000),
  expiree_le timestamptz,
  terminee_le timestamptz,
  terminee_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),

  constraint affectations_objet_unique check (num_nonnulls(tache_id, devis_id) = 1),
  constraint affectations_objet_coherent check (
    (objet = 'TACHE_PRODUCTION' and tache_id is not null and devis_id is null)
    or (objet = 'BANDEROLE' and devis_id is not null and tache_id is null)
  ),
  constraint affectations_dates check (
    date_fin_prevue is null or date_debut_prevue is null or date_fin_prevue >= date_debut_prevue
  ),
  constraint affectations_manuel_motive check (
    tarif_source not in ('MANUEL', 'SUR_DEVIS') or btrim(coalesce(tarif_motif, '')) <> ''
  ),
  constraint affectations_tarif_valide_lie check (
    tarif_source <> 'TARIF_VALIDE' or tarif_id is not null
  ),
  constraint affectations_sur_devis_montant check (
    tarif_source <> 'SUR_DEVIS' or montant_fcfa > 0
  ),
  constraint affectations_decision_coherente check (
    (statut <> 'ACCEPTEE' or acceptee_le is not null)
    and (statut <> 'REFUSEE' or (refusee_le is not null and btrim(coalesce(motif_refus, '')) <> ''))
    and (statut <> 'ANNULEE' or (annulee_le is not null and btrim(coalesce(motif_annulation, '')) <> ''))
    and (statut <> 'EXPIREE' or expiree_le is not null)
    and (statut <> 'TERMINEE' or terminee_le is not null)
  )
);

comment on table public.affectations_production is
  'Offre de travaux d''un atelier partenaire : proposition, acceptation, exécution. Le tarif est figé à la proposition et ne peut plus être réécrit.';
comment on column public.affectations_production.montant_fcfa is
  'Coût atelier figé (FCFA). Confidentiel : seul le RESPONSABLE de l''atelier le voit via mes_affectations(), et les rôles staff admin/finance.';
comment on column public.affectations_production.tarif_source is
  'TARIF_VALIDE = partenaire_tarifs en vigueur ; ANCIEN_PRIX = ancien prix_m2_fcfa ; MANUEL = négociation ; SUR_DEVIS = prix provisoire.';

create unique index if not exists affectations_une_active_tache
  on public.affectations_production (tache_id)
  where tache_id is not null and statut in ('PROPOSEE', 'ACCEPTEE');
create unique index if not exists affectations_une_active_devis
  on public.affectations_production (devis_id)
  where devis_id is not null and statut in ('PROPOSEE', 'ACCEPTEE');
create index if not exists affectations_partenaire_idx
  on public.affectations_production (partenaire_id, statut);
create index if not exists affectations_commande_idx
  on public.affectations_production (commande_id);
create index if not exists affectations_echeance_idx
  on public.affectations_production (statut, date_limite_reponse);
create index if not exists affectations_planning_idx
  on public.affectations_production (partenaire_id, date_fin_prevue);

create table if not exists public.affectations_evenements (
  id bigserial primary key,
  affectation_id uuid not null references public.affectations_production (id) on delete cascade,
  ancien_statut text,
  nouveau_statut text not null,
  acteur uuid references auth.users (id) on delete set null,
  acteur_type text not null check (acteur_type in ('STAFF', 'PARTENAIRE', 'SYSTEME')),
  motif text check (motif is null or char_length(motif) <= 1000),
  cree_le timestamptz not null default now()
);
create index if not exists affectations_evenements_idx
  on public.affectations_evenements (affectation_id, cree_le);

comment on table public.affectations_evenements is
  'Historique des affectations, en ajout seul (jamais de réécriture).';

create table if not exists public.affectation_fichiers (
  affectation_id uuid not null references public.affectations_production (id) on delete cascade,
  fichier_id uuid not null references public.fichiers_commande (id) on delete cascade,
  ajoute_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  primary key (affectation_id, fichier_id)
);

comment on table public.affectation_fichiers is
  'Fichiers de commande explicitement partagés avec l''atelier affecté (partage sélectif).';

/* ======================================================= transitions ==== */

create or replace function public.transition_affectation_autorisee(ancien text, nouveau text)
returns boolean
language sql
immutable
as $$
  select (ancien, nouveau) in (
    ('PROPOSEE', 'ACCEPTEE'),
    ('PROPOSEE', 'REFUSEE'),
    ('PROPOSEE', 'ANNULEE'),
    ('PROPOSEE', 'EXPIREE'),
    ('ACCEPTEE', 'ANNULEE'),
    ('ACCEPTEE', 'TERMINEE')
  );
$$;

create or replace function public.verifier_transition_affectation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.statut is distinct from old.statut then
    if not public.transition_affectation_autorisee(old.statut, new.statut) then
      raise exception 'Transition d''affectation interdite : % → %', old.statut, new.statut
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

/* ================================================== instantané figé ==== */

create or replace function public.verifier_affectation_immuable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.partenaire_id is distinct from old.partenaire_id
     or new.commande_id is distinct from old.commande_id
     or new.tache_id is distinct from old.tache_id
     or new.devis_id is distinct from old.devis_id
     or new.objet is distinct from old.objet
     or new.libelle is distinct from old.libelle
     or new.support is distinct from old.support
     or new.quantite is distinct from old.quantite
     or new.unite is distinct from old.unite
     or new.surface_m2 is distinct from old.surface_m2
     or new.details is distinct from old.details
     or new.instructions is distinct from old.instructions
     or new.priorite is distinct from old.priorite
     or new.date_debut_prevue is distinct from old.date_debut_prevue
     or new.date_fin_prevue is distinct from old.date_fin_prevue
     or new.date_limite_reponse is distinct from old.date_limite_reponse
     or new.tarif_id is distinct from old.tarif_id
     or new.tarif_lignee_id is distinct from old.tarif_lignee_id
     or new.tarif_version is distinct from old.tarif_version
     or new.tarif_nom is distinct from old.tarif_nom
     or new.tarif_mode_calcul is distinct from old.tarif_mode_calcul
     or new.tarif_prix_unitaire_fcfa is distinct from old.tarif_prix_unitaire_fcfa
     or new.quantite_base is distinct from old.quantite_base
     or new.montant_fcfa is distinct from old.montant_fcfa
     or new.tarif_source is distinct from old.tarif_source
     or new.tarif_motif is distinct from old.tarif_motif
     or new.proposee_le is distinct from old.proposee_le
     or new.proposee_par is distinct from old.proposee_par
  then
    raise exception 'Une affectation est figée : annulez-la et proposez-en une nouvelle'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

/* ================================================ cohérence de l'objet ==== */

create or replace function public.verifier_affectation_objet()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_annulee timestamptz;
  v_commande_tache uuid;
begin
  select annulee_le into v_annulee from public.commandes where id = new.commande_id;
  if not found then
    raise exception 'Commande introuvable' using errcode = 'P0002';
  end if;
  if v_annulee is not null and new.statut in ('PROPOSEE', 'ACCEPTEE') then
    raise exception 'Une commande annulée ne peut pas recevoir de travaux' using errcode = '23514';
  end if;

  if new.tache_id is not null then
    select commande_id into v_commande_tache
      from public.travaux_production where id = new.tache_id;
    if v_commande_tache is null or v_commande_tache <> new.commande_id then
      raise exception 'La tâche n''appartient pas à la commande' using errcode = '23514';
    end if;
  elsif new.devis_id is not null then
    if not exists (
      select 1
        from public.commandes c
        join public.demandes_grand_format d on d.devis_id = c.devis_id
       where c.id = new.commande_id and c.devis_id = new.devis_id
    ) then
      raise exception 'La banderole n''appartient pas à la commande' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

/* ============================================= synchronisation atelier ==== */

create or replace function public.synchroniser_affectation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.statut = 'ACCEPTEE' and old.statut = 'PROPOSEE' then
    if new.tache_id is not null then
      update public.travaux_production
         set partenaire_id = new.partenaire_id,
             interne = false,
             date_prevue = coalesce(date_prevue, new.date_fin_prevue)
       where id = new.tache_id;
    elsif new.devis_id is not null then
      update public.demandes_grand_format
         set partenaire_id = new.partenaire_id
       where devis_id = new.devis_id;
    end if;
  elsif new.statut in ('ANNULEE', 'REFUSEE') and old.statut = 'ACCEPTEE' then
    if new.tache_id is not null then
      update public.travaux_production
         set partenaire_id = null, interne = true
       where id = new.tache_id and partenaire_id = new.partenaire_id;
    elsif new.devis_id is not null then
      update public.demandes_grand_format
         set partenaire_id = null
       where devis_id = new.devis_id and partenaire_id = new.partenaire_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.verifier_affectation_fichier()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_commande uuid;
begin
  select f.commande_id into v_commande
    from public.fichiers_commande f
    join public.affectations_production a on a.id = new.affectation_id
   where f.id = new.fichier_id
     and f.commande_id = a.commande_id;
  if v_commande is null then
    raise exception 'Le fichier n''appartient pas à la commande de l''affectation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

/* ======================================================== proposition ==== */

/*
 * Crée une proposition d'affectation. Le serveur calcule `p_montant_fcfa` avec les fonctions
 * pures (paliers) ; la base vérifie que le tarif appartient bien à l'atelier, qu'il est validé et
 * en vigueur, puis fige l'instantané. Aucun `partenaire_id` n'est écrit sur la tâche ou la
 * banderole avant l'acceptation.
 */
create or replace function public.proposer_affectation(
  p_objet text,
  p_commande_id uuid,
  p_tache_id uuid,
  p_devis_id uuid,
  p_partenaire_id uuid,
  p_tarif_id uuid,
  p_quantite_base numeric,
  p_montant_fcfa integer,
  p_tarif_source text,
  p_donnees jsonb,
  p_acteur uuid,
  p_acteur_email text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_donnees jsonb := coalesce(p_donnees, '{}'::jsonb);
  v_statut text;
  v_actif boolean;
  v_compte boolean;
  v_id uuid;
  v_tarif public.partenaire_tarifs;
  v_source text := coalesce(nullif(btrim(p_tarif_source), ''), 'TARIF_VALIDE');
  v_libelle text;
  v_support text;
  v_quantite integer;
  v_unite text;
  v_surface numeric;
  v_details jsonb;
  v_instructions text;
  v_priorite text;
  v_debut date;
  v_fin date;
  v_limite timestamptz;
  v_motif text;
begin
  if p_objet not in ('TACHE_PRODUCTION', 'BANDEROLE') then
    raise exception 'Objet d''affectation inconnu' using errcode = '22023';
  end if;
  if jsonb_typeof(v_donnees) <> 'object' then
    raise exception 'Données d''affectation invalides' using errcode = '22023';
  end if;
  if num_nonnulls(p_tache_id, p_devis_id) <> 1
     or (p_objet = 'TACHE_PRODUCTION' and p_tache_id is null)
     or (p_objet = 'BANDEROLE' and p_devis_id is null)
  then
    raise exception 'Objet et identifiant incohérents' using errcode = '22023';
  end if;
  if coalesce(trim(p_acteur_email), '') = '' then
    raise exception 'Auteur de la proposition manquant' using errcode = '22023';
  end if;

  select statut, actif into v_statut, v_actif
    from public.partenaires where id = p_partenaire_id for update;
  if v_statut is null then
    raise exception 'Partenaire introuvable' using errcode = 'P0002';
  end if;
  if v_statut <> 'VALIDE' or not v_actif then
    raise exception 'Ce partenaire n''est pas validé ou n''est pas actif : il ne peut pas recevoir de travaux.'
      using errcode = '42501';
  end if;

  select exists (
    select 1
      from public.partenaire_utilisateurs pu
      join auth.users u on u.id = pu.user_id
     where pu.partenaire_id = p_partenaire_id
       and pu.actif
       and u.email_confirmed_at is not null
  ) into v_compte;
  if not v_compte then
    raise exception 'Ce partenaire n''a aucun compte portail actif : invitez-le avant de proposer un travail.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.affectations_production
     where statut in ('PROPOSEE', 'ACCEPTEE')
       and (
         (p_tache_id is not null and tache_id = p_tache_id)
         or (p_devis_id is not null and devis_id = p_devis_id)
       )
  ) then
    raise exception 'Une affectation est déjà active sur ce travail' using errcode = '23505';
  end if;

  v_libelle := nullif(btrim(coalesce(v_donnees ->> 'libelle', '')), '');
  if v_libelle is null or char_length(v_libelle) < 2 then
    raise exception 'Libellé de l''affectation manquant' using errcode = '22023';
  end if;
  v_support := nullif(btrim(coalesce(v_donnees ->> 'support', '')), '');
  v_quantite := nullif(v_donnees ->> 'quantite', '')::integer;
  v_unite := nullif(btrim(coalesce(v_donnees ->> 'unite', '')), '');
  v_surface := nullif(v_donnees ->> 'surface_m2', '')::numeric;
  v_details := coalesce(v_donnees -> 'details', '{}'::jsonb);
  v_instructions := nullif(v_donnees ->> 'instructions', '');
  v_priorite := coalesce(nullif(btrim(v_donnees ->> 'priorite'), ''), 'NORMALE');
  v_debut := nullif(v_donnees ->> 'date_debut_prevue', '')::date;
  v_fin := nullif(v_donnees ->> 'date_fin_prevue', '')::date;
  v_limite := coalesce(nullif(v_donnees ->> 'date_limite_reponse', '')::timestamptz, now() + interval '72 hours');
  v_motif := nullif(btrim(coalesce(v_donnees ->> 'tarif_motif', '')), '');

  if v_priorite not in ('NORMALE', 'URGENTE') then
    raise exception 'Priorité inconnue' using errcode = '22023';
  end if;
  if v_limite <= now() + interval '1 hour' then
    raise exception 'La date limite de réponse doit être au moins une heure dans le futur'
      using errcode = '22023';
  end if;
  if jsonb_typeof(v_details) <> 'object' then
    raise exception 'Détails d''affectation invalides' using errcode = '22023';
  end if;
  if p_montant_fcfa is null or p_montant_fcfa < 0 then
    raise exception 'Montant d''affectation manquant' using errcode = '22023';
  end if;

  if p_tarif_id is not null then
    select * into v_tarif
      from public.partenaire_tarifs
     where id = p_tarif_id and partenaire_id = p_partenaire_id;
    if v_tarif.id is null then
      raise exception 'Tarif introuvable pour cet atelier' using errcode = 'P0002';
    end if;
    if v_tarif.statut <> 'VALIDE' then
      raise exception 'Seul un tarif validé peut être utilisé pour une affectation' using errcode = '23514';
    end if;
    if v_tarif.valide_du > current_date
       or (v_tarif.valide_jusquau is not null and v_tarif.valide_jusquau < current_date)
    then
      raise exception 'Ce tarif n''est pas en vigueur' using errcode = '23514';
    end if;
    if v_source <> 'TARIF_VALIDE' then
      raise exception 'Un tarif validé impose la source TARIF_VALIDE' using errcode = '22023';
    end if;
    if p_quantite_base is null or p_quantite_base <= 0 then
      raise exception 'Quantité de base manquante pour appliquer le tarif' using errcode = '22023';
    end if;
  else
    if v_source = 'TARIF_VALIDE' then
      raise exception 'Aucun tarif validé fourni' using errcode = '22023';
    end if;
    if v_source in ('MANUEL', 'SUR_DEVIS') and v_motif is null then
      raise exception 'Un motif est obligatoire pour un montant manuel ou sur devis' using errcode = '22023';
    end if;
    if v_source = 'SUR_DEVIS' and p_montant_fcfa <= 0 then
      raise exception 'Un prix provisoire strictement positif est nécessaire pour SUR_DEVIS'
        using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.affectations_production (
      partenaire_id, commande_id, tache_id, devis_id, objet, statut,
      libelle, support, quantite, unite, surface_m2, details, instructions, priorite,
      date_debut_prevue, date_fin_prevue, date_limite_reponse,
      tarif_id, tarif_lignee_id, tarif_version, tarif_nom, tarif_mode_calcul,
      tarif_prix_unitaire_fcfa, quantite_base, montant_fcfa, tarif_source, tarif_motif,
      proposee_par
    ) values (
      p_partenaire_id, p_commande_id, p_tache_id, p_devis_id, p_objet, 'PROPOSEE',
      v_libelle, v_support, v_quantite, v_unite, v_surface, v_details, v_instructions, v_priorite,
      v_debut, v_fin, v_limite,
      p_tarif_id, v_tarif.lignee_id, v_tarif.version, v_tarif.nom, v_tarif.mode_calcul,
      v_tarif.prix_fcfa, p_quantite_base, p_montant_fcfa, v_source, v_motif,
      p_acteur
    ) returning id into v_id;
  exception when unique_violation then
    raise exception 'Une affectation est déjà active sur ce travail' using errcode = '23505';
  end;

  insert into public.affectations_evenements (affectation_id, ancien_statut, nouveau_statut, acteur, acteur_type)
  values (v_id, null, 'PROPOSEE', p_acteur, 'STAFF');

  return v_id;
end;
$$;

/*
 * Ajoute des fichiers de la commande à une proposition. Refusé après acceptation : un fichier
 * supplémentaire se transmet par une nouvelle proposition ou hors plateforme.
 */
create or replace function public.ajouter_fichiers_affectation(
  p_id uuid,
  p_fichiers uuid[],
  p_acteur uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.affectations_production;
  v_fichier uuid;
begin
  select * into v from public.affectations_production where id = p_id for update;
  if v.id is null then
    raise exception 'Affectation introuvable' using errcode = 'P0002';
  end if;
  if v.statut <> 'PROPOSEE' then
    raise exception 'Les fichiers ne peuvent être ajoutés qu''à une proposition en attente'
      using errcode = '23514';
  end if;
  if p_fichiers is null then
    return;
  end if;
  foreach v_fichier in array p_fichiers loop
    if not exists (
      select 1 from public.fichiers_commande
       where id = v_fichier and commande_id = v.commande_id and verifie
    ) then
      raise exception 'Fichier introuvable ou non vérifié pour cette commande' using errcode = 'P0002';
    end if;
    insert into public.affectation_fichiers (affectation_id, fichier_id, ajoute_par)
    values (p_id, v_fichier, p_acteur)
    on conflict do nothing;
  end loop;
end;
$$;

/* ============================================================ décision ==== */

/*
 * Décision de l'atelier. Vérifie elle-même le rattachement et le rôle : le serveur a déjà appelé
 * `exigerPartenaire`, mais la base reste l'arbitre.
 */
create or replace function public.decider_affectation(
  p_id uuid,
  p_utilisateur uuid,
  p_decision text,
  p_motif text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.affectations_production;
  v_statut text;
  v_actif boolean;
  v_role text;
begin
  if p_decision not in ('ACCEPTEE', 'REFUSEE') then
    raise exception 'Décision inconnue' using errcode = '22023';
  end if;
  select * into v from public.affectations_production where id = p_id for update;
  if v.id is null then
    raise exception 'Affectation introuvable' using errcode = 'P0002';
  end if;
  if v.statut <> 'PROPOSEE' then
    raise exception 'Cette proposition n''est plus en attente (statut : %)', v.statut using errcode = '23514';
  end if;
  if v.date_limite_reponse < now() then
    raise exception 'Le délai de réponse est dépassé' using errcode = '23514';
  end if;

  select statut, actif into v_statut, v_actif from public.partenaires where id = v.partenaire_id;
  if v_statut <> 'VALIDE' or not v_actif then
    raise exception 'L''atelier n''est plus validé ou actif' using errcode = '42501';
  end if;
  if exists (select 1 from public.commandes where id = v.commande_id and annulee_le is not null) then
    raise exception 'La commande de ce travail est annulée' using errcode = '23514';
  end if;

  select pu.role_partenaire into v_role
    from public.partenaire_utilisateurs pu
    join auth.users u on u.id = pu.user_id
   where pu.user_id = p_utilisateur
     and pu.partenaire_id = v.partenaire_id
     and pu.actif
     and u.email_confirmed_at is not null;
  if v_role is null or v_role <> 'RESPONSABLE' then
    raise exception 'Seul le responsable de l''atelier peut répondre' using errcode = '42501';
  end if;

  if p_decision = 'REFUSEE' then
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Un motif est obligatoire pour refuser' using errcode = '22023';
    end if;
    update public.affectations_production
       set statut = 'REFUSEE', refusee_le = now(), refusee_par = p_utilisateur,
           motif_refus = btrim(p_motif)
     where id = p_id;
    insert into public.affectations_evenements (affectation_id, ancien_statut, nouveau_statut, acteur, acteur_type, motif)
    values (p_id, 'PROPOSEE', 'REFUSEE', p_utilisateur, 'PARTENAIRE', btrim(p_motif));
  else
    update public.affectations_production
       set statut = 'ACCEPTEE', acceptee_le = now(), acceptee_par = p_utilisateur
     where id = p_id;
    insert into public.affectations_evenements (affectation_id, ancien_statut, nouveau_statut, acteur, acteur_type)
    values (p_id, 'PROPOSEE', 'ACCEPTEE', p_utilisateur, 'PARTENAIRE');
  end if;

  return p_decision;
end;
$$;

create or replace function public.annuler_affectation(
  p_id uuid,
  p_acteur uuid,
  p_acteur_email text,
  p_motif text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.affectations_production;
begin
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Un motif est obligatoire pour annuler' using errcode = '22023';
  end if;
  if coalesce(trim(p_acteur_email), '') = '' then
    raise exception 'Auteur de l''annulation manquant' using errcode = '22023';
  end if;
  select * into v from public.affectations_production where id = p_id for update;
  if v.id is null then
    raise exception 'Affectation introuvable' using errcode = 'P0002';
  end if;
  if v.statut not in ('PROPOSEE', 'ACCEPTEE') then
    raise exception 'Cette affectation ne peut plus être annulée (statut : %)', v.statut using errcode = '23514';
  end if;

  update public.affectations_production
     set statut = 'ANNULEE', annulee_le = now(), annulee_par = p_acteur,
         motif_annulation = btrim(p_motif)
   where id = p_id;
  insert into public.affectations_evenements (affectation_id, ancien_statut, nouveau_statut, acteur, acteur_type, motif)
  values (p_id, v.statut, 'ANNULEE', p_acteur, 'STAFF', btrim(p_motif));
end;
$$;

create or replace function public.terminer_affectation(
  p_id uuid,
  p_utilisateur uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.affectations_production;
  v_role text;
  v_statut text;
  v_actif boolean;
begin
  select * into v from public.affectations_production where id = p_id for update;
  if v.id is null then
    raise exception 'Affectation introuvable' using errcode = 'P0002';
  end if;
  if v.statut <> 'ACCEPTEE' then
    raise exception 'Seule une affectation acceptée peut être terminée' using errcode = '23514';
  end if;
  select statut, actif into v_statut, v_actif from public.partenaires where id = v.partenaire_id;
  if v_statut <> 'VALIDE' or not v_actif then
    raise exception 'L''atelier n''est plus validé ou actif' using errcode = '42501';
  end if;
  select pu.role_partenaire into v_role
    from public.partenaire_utilisateurs pu
    join auth.users u on u.id = pu.user_id
   where pu.user_id = p_utilisateur
     and pu.partenaire_id = v.partenaire_id
     and pu.actif
     and u.email_confirmed_at is not null;
  if v_role is null or v_role not in ('RESPONSABLE', 'PRODUCTION') then
    raise exception 'Seul un membre actif de l''atelier peut signaler la fin' using errcode = '42501';
  end if;

  update public.affectations_production
     set statut = 'TERMINEE', terminee_le = now(), terminee_par = p_utilisateur
   where id = p_id;
  insert into public.affectations_evenements (affectation_id, ancien_statut, nouveau_statut, acteur, acteur_type)
  values (p_id, 'ACCEPTEE', 'TERMINEE', p_utilisateur, 'PARTENAIRE');
end;
$$;

create or replace function public.expirer_affectations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v record;
  v_n integer := 0;
begin
  for v in
    select id, statut from public.affectations_production
     where statut = 'PROPOSEE' and date_limite_reponse < now()
     for update
  loop
    update public.affectations_production
       set statut = 'EXPIREE', expiree_le = now()
     where id = v.id;
    insert into public.affectations_evenements (affectation_id, ancien_statut, nouveau_statut, acteur_type)
    values (v.id, v.statut, 'EXPIREE', 'SYSTEME');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/* =========================================================== lectures ==== */

create or replace function public.mes_affectations()
returns table (
  id uuid,
  reference text,
  objet text,
  statut text,
  libelle text,
  support text,
  quantite integer,
  unite text,
  surface_m2 numeric,
  details jsonb,
  instructions text,
  priorite text,
  date_debut_prevue date,
  date_fin_prevue date,
  date_limite_reponse timestamptz,
  montant_fcfa integer,
  tarif_nom text,
  tarif_version integer,
  tarif_mode_calcul text,
  tarif_prix_unitaire_fcfa integer,
  commande_reference text,
  cree_le timestamptz,
  acceptee_le timestamptz,
  refusee_le timestamptz,
  terminee_le timestamptz,
  motif_refus text,
  motif_annulation text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_partenaire uuid := public.partenaire_session();
begin
  if v_partenaire is null then
    return;
  end if;
  return query
    select a.id, a.reference, a.objet, a.statut, a.libelle, a.support, a.quantite, a.unite,
           a.surface_m2, a.details, a.instructions, a.priorite,
           a.date_debut_prevue, a.date_fin_prevue, a.date_limite_reponse,
           case when public.role_partenaire_session() = 'RESPONSABLE' then a.montant_fcfa end,
           a.tarif_nom, a.tarif_version, a.tarif_mode_calcul, a.tarif_prix_unitaire_fcfa,
           c.reference,
           a.cree_le, a.acceptee_le, a.refusee_le, a.terminee_le, a.motif_refus, a.motif_annulation
      from public.affectations_production a
      join public.commandes c on c.id = a.commande_id
     where a.partenaire_id = v_partenaire
     order by case a.statut
                when 'PROPOSEE' then 0
                when 'ACCEPTEE' then 1
                when 'TERMINEE' then 2
                else 3
              end,
              a.date_fin_prevue nulls last,
              a.cree_le desc;
end;
$$;

create or replace function public.mon_affectation(p_id uuid)
returns table (
  id uuid,
  reference text,
  objet text,
  statut text,
  libelle text,
  support text,
  quantite integer,
  unite text,
  surface_m2 numeric,
  details jsonb,
  instructions text,
  priorite text,
  date_debut_prevue date,
  date_fin_prevue date,
  date_limite_reponse timestamptz,
  montant_fcfa integer,
  tarif_nom text,
  tarif_version integer,
  tarif_mode_calcul text,
  tarif_prix_unitaire_fcfa integer,
  commande_reference text,
  cree_le timestamptz,
  acceptee_le timestamptz,
  refusee_le timestamptz,
  terminee_le timestamptz,
  motif_refus text,
  motif_annulation text,
  evenements jsonb,
  fichiers jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_partenaire uuid := public.partenaire_session();
begin
  if v_partenaire is null then
    return;
  end if;
  return query
    select a.id, a.reference, a.objet, a.statut, a.libelle, a.support, a.quantite, a.unite,
           a.surface_m2, a.details, a.instructions, a.priorite,
           a.date_debut_prevue, a.date_fin_prevue, a.date_limite_reponse,
           case when public.role_partenaire_session() = 'RESPONSABLE' then a.montant_fcfa end,
           a.tarif_nom, a.tarif_version, a.tarif_mode_calcul, a.tarif_prix_unitaire_fcfa,
           c.reference,
           a.cree_le, a.acceptee_le, a.refusee_le, a.terminee_le, a.motif_refus, a.motif_annulation,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'statut', e.nouveau_statut,
               'acteur_type', e.acteur_type,
               'motif', e.motif,
               'cree_le', e.cree_le
             ) order by e.cree_le)
               from public.affectations_evenements e
              where e.affectation_id = a.id
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'fichier_id', f.id,
               'nom', f.nom,
               'type_mime', f.type_mime,
               'taille_octets', f.taille_octets
             ) order by f.cree_le)
               from public.affectation_fichiers af
               join public.fichiers_commande f on f.id = af.fichier_id
              where af.affectation_id = a.id
           ), '[]'::jsonb)
      from public.affectations_production a
      join public.commandes c on c.id = a.commande_id
     where a.id = p_id and a.partenaire_id = v_partenaire;
end;
$$;

/* ====================================================== entretien ==== */

create or replace function public.brouillons_abandonnes(p_jours integer default 90)
returns table (id uuid, nom text, maj_le timestamptz, fichiers integer)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p.id, p.nom, p.maj_le,
         (select count(*)::integer from public.partenaire_fichiers f where f.partenaire_id = p.id)
    from public.partenaires p
   where p.statut = 'BROUILLON'
     and p.origine = 'INSCRIPTION'
     and p.soumis_le is null
     and p.maj_le < now() - make_interval(days => greatest(coalesce(p_jours, 90), 1))
   order by p.maj_le;
$$;

/*
 * Archivage doux d'un dossier abandonné. Le serveur supprime d'abord les objets du bucket ; la
 * fonction ne touche ni à la fiche `partenaires` (archivée, jamais supprimée) ni aux comptes Auth.
 */
create or replace function public.archiver_brouillon(p_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v public.partenaires;
begin
  select * into v from public.partenaires where id = p_id for update;
  if v.id is null then
    raise exception 'Partenaire introuvable' using errcode = 'P0002';
  end if;
  if v.statut <> 'BROUILLON' or v.origine <> 'INSCRIPTION' then
    raise exception 'Seul un dossier BROUILLON issu d''une inscription peut être purgé'
      using errcode = '23514';
  end if;
  update public.partenaires
     set statut = 'ARCHIVE',
         motif_decision = coalesce(nullif(btrim(p_motif), ''), 'Dossier abandonné (purge automatique)')
   where id = p_id;

  -- Le garde-fou du Lot 1 interdit de retirer le dernier responsable actif. Une purge
  -- administrative doit pourtant couper les accès : on désactive le garde-fou le temps de
  -- l'opération (verrou de table, transaction unique), puis on le rétablit.
  execute 'alter table public.partenaire_utilisateurs disable trigger partenaire_utilisateurs_garde';
  update public.partenaire_utilisateurs set actif = false where partenaire_id = p_id and actif;
  execute 'alter table public.partenaire_utilisateurs enable trigger partenaire_utilisateurs_garde';

  delete from public.partenaire_fichiers where partenaire_id = p_id;
end;
$$;

/* =========================================================== triggers ==== */

drop trigger if exists affectations_maj_le on public.affectations_production;
create trigger affectations_maj_le before update on public.affectations_production
  for each row execute function public.set_maj_le();

drop trigger if exists affectations_transition on public.affectations_production;
create trigger affectations_transition before update of statut on public.affectations_production
  for each row execute function public.verifier_transition_affectation();

drop trigger if exists affectations_immuable on public.affectations_production;
create trigger affectations_immuable before update on public.affectations_production
  for each row execute function public.verifier_affectation_immuable();

drop trigger if exists affectations_objet on public.affectations_production;
create trigger affectations_objet before insert or update on public.affectations_production
  for each row execute function public.verifier_affectation_objet();

drop trigger if exists affectations_sync on public.affectations_production;
create trigger affectations_sync after insert or update of statut on public.affectations_production
  for each row execute function public.synchroniser_affectation();

drop trigger if exists affectation_fichiers_coherence on public.affectation_fichiers;
create trigger affectation_fichiers_coherence before insert or update on public.affectation_fichiers
  for each row execute function public.verifier_affectation_fichier();

/* =============================================================== RLS ==== */

alter table public.affectations_production enable row level security;
alter table public.affectations_evenements enable row level security;
alter table public.affectation_fichiers enable row level security;

drop policy if exists affectations_production_staff on public.affectations_production;
create policy affectations_production_staff on public.affectations_production
  for select to authenticated using (public.is_staff());

drop policy if exists affectations_evenements_staff on public.affectations_evenements;
create policy affectations_evenements_staff on public.affectations_evenements
  for select to authenticated using (public.is_staff());

drop policy if exists affectation_fichiers_staff on public.affectation_fichiers;
create policy affectation_fichiers_staff on public.affectation_fichiers
  for select to authenticated using (public.is_staff());

revoke all on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers from anon, authenticated;
grant select on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers to authenticated;

-- service_role : lecture pour le back-office ; les écritures passent par les fonctions.
revoke all on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers from service_role;
grant select on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers to service_role;

revoke all on sequence public.affectations_reference_seq from anon, authenticated;
grant usage, select on sequence public.affectations_reference_seq to service_role;
revoke all on sequence public.affectations_evenements_id_seq from anon, authenticated;
grant usage, select on sequence public.affectations_evenements_id_seq to service_role;

/* ============================================================= grants ==== */

revoke all on function public.transition_affectation_autorisee(text, text) from public, anon, authenticated;
grant execute on function public.transition_affectation_autorisee(text, text) to service_role;

revoke all on function public.verifier_transition_affectation() from public, anon, authenticated;
revoke all on function public.verifier_affectation_immuable() from public, anon, authenticated;
revoke all on function public.verifier_affectation_objet() from public, anon, authenticated;
revoke all on function public.verifier_affectation_fichier() from public, anon, authenticated;
revoke all on function public.synchroniser_affectation() from public, anon, authenticated;

revoke all on function public.proposer_affectation(text, uuid, uuid, uuid, uuid, uuid, numeric, integer, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.ajouter_fichiers_affectation(uuid, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.decider_affectation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.annuler_affectation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.terminer_affectation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expirer_affectations() from public, anon, authenticated;
revoke all on function public.brouillons_abandonnes(integer) from public, anon, authenticated;
revoke all on function public.archiver_brouillon(uuid, text) from public, anon, authenticated;

grant execute on function public.proposer_affectation(text, uuid, uuid, uuid, uuid, uuid, numeric, integer, text, jsonb, uuid, text) to service_role;
grant execute on function public.ajouter_fichiers_affectation(uuid, uuid[], uuid) to service_role;
grant execute on function public.decider_affectation(uuid, uuid, text, text) to service_role;
grant execute on function public.annuler_affectation(uuid, uuid, text, text) to service_role;
grant execute on function public.terminer_affectation(uuid, uuid) to service_role;
grant execute on function public.expirer_affectations() to service_role;
grant execute on function public.brouillons_abandonnes(integer) to service_role;
grant execute on function public.archiver_brouillon(uuid, text) to service_role;

revoke all on function public.mes_affectations() from public, anon;
revoke all on function public.mon_affectation(uuid) from public, anon;
grant execute on function public.mes_affectations() to authenticated, service_role;
grant execute on function public.mon_affectation(uuid) to authenticated, service_role;

commit;

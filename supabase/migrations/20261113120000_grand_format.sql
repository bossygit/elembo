-- Elembo — migration 0011 : offre « Banderoles & supports grand format ».
--
-- Principe : une demande de banderole EST un devis Elembo (famille IMPRESSION). Cette migration
-- n'ajoute ni statut, ni circuit de paiement, ni second modèle de commande. Elle ajoute :
--
--   1. `partenaires` : les informations utiles à l'affectation d'un imprimeur (contact, adresse,
--      types d'impression, dimensions maximales). Les tarifs négociés réutilisent la colonne
--      existante `partenaires.tarifs` (jsonb).
--   2. `tarifs_grand_format` : la grille de VENTE servant à l'estimation en ligne. Aucun prix
--      n'est inséré : les supports sont créés en `TEST`, sans montant. Seul un tarif `VALIDE`
--      (validé par une personne nommée, à une date) peut produire une estimation publique.
--   3. `demandes_grand_format` : les paramètres structurés de la demande (1—1 avec `devis`) et le
--      chiffrage interne (prix, coûts estimés, imprimeur affecté, dates prévues).
--   4. `creer_demande_grand_format` : crée devis + demande dans UNE transaction, en appelant la
--      fonction existante `creer_devis_atomique` (mêmes règles client, idempotence, notifications).
--
-- Migration additive : aucune colonne existante n'est modifiée ni supprimée, aucune donnée
-- existante n'est réécrite. Retour arrière : supabase/rollbacks/20261113120000_grand_format_down.sql.

/* ------------------------------------------------------------ partenaires ---- */

alter table public.partenaires
  add column if not exists contact_nom text
    check (contact_nom is null or char_length(contact_nom) <= 120),
  add column if not exists adresse text
    check (adresse is null or char_length(adresse) <= 300),
  add column if not exists types_impression text[] not null default '{}'::text[],
  add column if not exists largeur_max_m numeric(5, 2)
    check (largeur_max_m is null or largeur_max_m > 0),
  add column if not exists longueur_max_m numeric(6, 2)
    check (longueur_max_m is null or longueur_max_m > 0);

comment on column public.partenaires.tarifs is
  'Tarifs négociés (confidentiels) : {"prix_m2_fcfa": entier, "conditions": texte}. Jamais exposés au public.';
comment on column public.partenaires.largeur_max_m is 'Laize maximale imprimable (m).';
comment on column public.partenaires.types_impression is 'Ex. BANDEROLE, BACHE, ROLL_UP, KAKEMONO, X_BANNER, PANNEAU.';

create index if not exists partenaires_types_impression_idx
  on public.partenaires using gin (types_impression);

/* --------------------------------------------------- grille de vente (estimation) ---- */

create table if not exists public.tarifs_grand_format (
  support text primary key
    check (support in ('BANDEROLE', 'BACHE', 'ROLL_UP', 'KAKEMONO', 'X_BANNER', 'PANNEAU')),
  libelle text not null check (char_length(trim(libelle)) between 2 and 80),
  prix_m2_fcfa integer check (prix_m2_fcfa is null or prix_m2_fcfa > 0),
  minimum_piece_fcfa integer check (minimum_piece_fcfa is null or minimum_piece_fcfa >= 0),
  supplement_oeillets_ml_fcfa integer check (supplement_oeillets_ml_fcfa is null or supplement_oeillets_ml_fcfa >= 0),
  supplement_ourlets_ml_fcfa integer check (supplement_ourlets_ml_fcfa is null or supplement_ourlets_ml_fcfa >= 0),
  supplement_fourreaux_ml_fcfa integer check (supplement_fourreaux_ml_fcfa is null or supplement_fourreaux_ml_fcfa >= 0),
  frais_creation_fcfa integer check (frais_creation_fcfa is null or frais_creation_fcfa >= 0),
  laize_max_m numeric(5, 2) check (laize_max_m is null or laize_max_m > 0),
  statut_prix public.statut_prix not null default 'TEST',
  prix_valide_par uuid references auth.users (id) on delete set null,
  prix_valide_par_email text,
  prix_valide_le timestamptz,
  actif boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint tarifs_grand_format_valide_check
    check (statut_prix <> 'VALIDE'
           or (prix_m2_fcfa is not null and prix_valide_par_email is not null and prix_valide_le is not null))
);

comment on table public.tarifs_grand_format is
  'Prix de VENTE des supports grand format, pour l’estimation en ligne. Seul un tarif VALIDE et actif est utilisé. Les coûts d’achat sont dans partenaires.tarifs.';

drop trigger if exists tarifs_grand_format_maj_le on public.tarifs_grand_format;
create trigger tarifs_grand_format_maj_le before update on public.tarifs_grand_format
  for each row execute function public.set_maj_le();

/*
 * Un montant modifié fait tomber la validation : un prix validé ne change jamais « en douce ».
 * La validation est un acte séparé (statut VALIDE + auteur + date, sans changement de montant).
 */
create or replace function public.reinitialiser_validation_tarif_grand_format()
returns trigger
language plpgsql
as $$
begin
  if (new.prix_m2_fcfa, new.minimum_piece_fcfa, new.supplement_oeillets_ml_fcfa,
      new.supplement_ourlets_ml_fcfa, new.supplement_fourreaux_ml_fcfa, new.frais_creation_fcfa,
      new.laize_max_m)
     is distinct from
     (old.prix_m2_fcfa, old.minimum_piece_fcfa, old.supplement_oeillets_ml_fcfa,
      old.supplement_ourlets_ml_fcfa, old.supplement_fourreaux_ml_fcfa, old.frais_creation_fcfa,
      old.laize_max_m) then
    if new.statut_prix = 'VALIDE' then
      new.statut_prix := 'PROVISOIRE';
    end if;
    new.prix_valide_par := null;
    new.prix_valide_par_email := null;
    new.prix_valide_le := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tarifs_grand_format_validation on public.tarifs_grand_format;
create trigger tarifs_grand_format_validation
  before update on public.tarifs_grand_format
  for each row execute function public.reinitialiser_validation_tarif_grand_format();

-- Supports proposés, SANS prix : Smart Vision saisit puis valide sa grille dans le back-office.
insert into public.tarifs_grand_format (support, libelle) values
  ('BANDEROLE', 'Banderole PVC'),
  ('BACHE', 'Bâche de façade'),
  ('ROLL_UP', 'Roll-up'),
  ('KAKEMONO', 'Kakémono'),
  ('X_BANNER', 'X-banner'),
  ('PANNEAU', 'Panneau rigide')
on conflict (support) do nothing;

/* ------------------------------------------------------- demandes grand format ---- */

create table if not exists public.demandes_grand_format (
  devis_id uuid primary key references public.devis (id) on delete cascade,

  -- Demande du client.
  usage text not null
    check (usage in ('DEUIL', 'EGLISE', 'EVENEMENT', 'PUBLICITE', 'INSTITUTION', 'AUTRE')),
  support text not null
    check (support in ('BANDEROLE', 'BACHE', 'ROLL_UP', 'KAKEMONO', 'X_BANNER', 'PANNEAU', 'AUTRE')),
  support_precision text check (support_precision is null or char_length(support_precision) <= 200),
  largeur_m numeric(5, 2) not null check (largeur_m between 0.2 and 50),
  hauteur_m numeric(5, 2) not null check (hauteur_m between 0.2 and 50),
  quantite integer not null check (quantite between 1 and 1000),
  surface_totale_m2 numeric(12, 4) generated always as (largeur_m * hauteur_m * quantite) stored,
  finition text not null
    check (finition in ('SANS', 'OEILLETS', 'OURLETS', 'OURLETS_OEILLETS', 'FOURREAUX', 'AUTRE')),
  finition_precision text check (finition_precision is null or char_length(finition_precision) <= 200),
  delai text not null check (delai in ('STANDARD', 'EXPRESS', 'DATE')),
  date_souhaitee date,
  prestation text not null check (prestation in ('FICHIER_PRET', 'CREATION', 'ACCOMPAGNEMENT')),
  commentaire text check (commentaire is null or char_length(commentaire) <= 2000),

  -- Estimation calculée par le serveur au dépôt (null = « sur devis »).
  estimation_fcfa integer check (estimation_fcfa is null or estimation_fcfa >= 0),
  estimation_detail jsonb not null default '{}'::jsonb,

  -- Chiffrage interne (jamais exposé au client, sauf le prix une fois proposé).
  partenaire_id uuid references public.partenaires (id) on delete set null,
  prix_impression_fcfa integer check (prix_impression_fcfa is null or prix_impression_fcfa >= 0),
  frais_creation_fcfa integer check (frais_creation_fcfa is null or frais_creation_fcfa >= 0),
  prix_vente_fcfa integer generated always as (
    case when prix_impression_fcfa is null and frais_creation_fcfa is null then null
         else coalesce(prix_impression_fcfa, 0) + coalesce(frais_creation_fcfa, 0) end
  ) stored,
  cout_impression_estime_fcfa integer check (cout_impression_estime_fcfa is null or cout_impression_estime_fcfa >= 0),
  cout_creation_estime_fcfa integer check (cout_creation_estime_fcfa is null or cout_creation_estime_fcfa >= 0),
  cout_livraison_estime_fcfa integer check (cout_livraison_estime_fcfa is null or cout_livraison_estime_fcfa >= 0),
  autres_couts_estimes_fcfa integer check (autres_couts_estimes_fcfa is null or autres_couts_estimes_fcfa >= 0),
  cout_estime_total_fcfa integer generated always as (
    case when cout_impression_estime_fcfa is null and cout_creation_estime_fcfa is null
              and cout_livraison_estime_fcfa is null and autres_couts_estimes_fcfa is null then null
         else coalesce(cout_impression_estime_fcfa, 0) + coalesce(cout_creation_estime_fcfa, 0)
            + coalesce(cout_livraison_estime_fcfa, 0) + coalesce(autres_couts_estimes_fcfa, 0) end
  ) stored,
  production_prevue_le date,
  livraison_prevue_le date,

  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),

  constraint demandes_grand_format_date_check check (delai <> 'DATE' or date_souhaitee is not null),
  constraint demandes_grand_format_estimation_object check (jsonb_typeof(estimation_detail) = 'object'),
  constraint demandes_grand_format_planning_check
    check (production_prevue_le is null or livraison_prevue_le is null or livraison_prevue_le >= production_prevue_le)
);

comment on table public.demandes_grand_format is
  'Paramètres et chiffrage d’une demande de banderole / support grand format. 1—1 avec devis.';

create index if not exists demandes_grand_format_cree_le_idx on public.demandes_grand_format (cree_le desc);
create index if not exists demandes_grand_format_partenaire_idx on public.demandes_grand_format (partenaire_id);
create index if not exists demandes_grand_format_usage_idx on public.demandes_grand_format (usage);

drop trigger if exists demandes_grand_format_maj_le on public.demandes_grand_format;
create trigger demandes_grand_format_maj_le before update on public.demandes_grand_format
  for each row execute function public.set_maj_le();

/*
 * Le coût estimé total alimente `devis.cout_estime_fcfa` (migration 0010) : la marge estimée
 * du devis et les écrans existants restent justes sans saisie en double.
 */
create or replace function public.synchroniser_cout_estime_grand_format()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.devis
     set cout_estime_fcfa = new.cout_estime_total_fcfa
   where id = new.devis_id
     and cout_estime_fcfa is distinct from new.cout_estime_total_fcfa;
  return null;
end;
$$;

drop trigger if exists demandes_grand_format_cout_estime on public.demandes_grand_format;
create trigger demandes_grand_format_cout_estime
  after insert or update of cout_impression_estime_fcfa, cout_creation_estime_fcfa,
                            cout_livraison_estime_fcfa, autres_couts_estimes_fcfa
  on public.demandes_grand_format
  for each row execute function public.synchroniser_cout_estime_grand_format();

/* ------------------------------------------------------ création atomique ---- */

/*
 * Devis + demande grand format dans la même transaction. Les règles de `creer_devis_atomique`
 * s'appliquent telles quelles (client retrouvé par email / téléphone, idempotence, notifications
 * Telegram / email). Rejouée avec la même clé, la fonction renvoie le devis existant sans rien
 * dupliquer.
 */
create or replace function public.creer_demande_grand_format(
  p_idempotency_key text,
  p_reference text,
  p_suivi_token_hash text,
  p_suivi_token_expire_le timestamptz,
  p_nom text,
  p_societe text,
  p_email text,
  p_telephone text,
  p_telephone_normalise text,
  p_type_client public.type_client,
  p_ville text,
  p_besoin text,
  p_format text,
  p_quantite integer,
  p_specifications jsonb,
  p_contact_snapshot jsonb,
  p_staff_email text,
  p_staff_telegram text,
  p_grand_format jsonb
) returns table (
  devis_id uuid,
  client_id uuid,
  reference text,
  deja_existant boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v record;
begin
  if p_grand_format is null or jsonb_typeof(p_grand_format) <> 'object' then
    raise exception 'Paramètres grand format manquants' using errcode = '22023';
  end if;

  select * into v
    from public.creer_devis_atomique(
      p_idempotency_key, p_reference, p_suivi_token_hash, p_suivi_token_expire_le,
      p_nom, p_societe, p_email, p_telephone, p_telephone_normalise, p_type_client, p_ville,
      'IMPRESSION', p_besoin, p_format, p_quantite, p_specifications, p_contact_snapshot,
      p_staff_email, p_staff_telegram, 'SITE'
    );

  insert into public.demandes_grand_format (
    devis_id, usage, support, support_precision, largeur_m, hauteur_m, quantite,
    finition, finition_precision, delai, date_souhaitee, prestation, commentaire,
    estimation_fcfa, estimation_detail
  ) values (
    v.devis_id,
    p_grand_format->>'usage',
    p_grand_format->>'support',
    nullif(p_grand_format->>'support_precision', ''),
    (p_grand_format->>'largeur_m')::numeric,
    (p_grand_format->>'hauteur_m')::numeric,
    (p_grand_format->>'quantite')::integer,
    p_grand_format->>'finition',
    nullif(p_grand_format->>'finition_precision', ''),
    p_grand_format->>'delai',
    nullif(p_grand_format->>'date_souhaitee', '')::date,
    p_grand_format->>'prestation',
    nullif(p_grand_format->>'commentaire', ''),
    nullif(p_grand_format->>'estimation_fcfa', '')::integer,
    coalesce(p_grand_format->'estimation_detail', '{}'::jsonb)
  )
  on conflict on constraint demandes_grand_format_pkey do nothing;

  devis_id := v.devis_id;
  client_id := v.client_id;
  reference := v.reference;
  deja_existant := v.deja_existant;
  return next;
end;
$$;

/* -------------------------------------------------------------- RLS et droits ---- */

-- Même modèle que le reste du schéma : le navigateur ne lit ni n'écrit ces tables. Les routes
-- serveur (service_role) contrôlent le rôle staff ; la RLS est la seconde barrière.
alter table public.tarifs_grand_format enable row level security;
alter table public.demandes_grand_format enable row level security;

drop policy if exists tarifs_grand_format_select_staff on public.tarifs_grand_format;
create policy tarifs_grand_format_select_staff on public.tarifs_grand_format
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'finance']));

drop policy if exists demandes_grand_format_select_staff on public.demandes_grand_format;
create policy demandes_grand_format_select_staff on public.demandes_grand_format
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'finance']));

revoke all on public.tarifs_grand_format, public.demandes_grand_format from anon, authenticated;
grant select on public.tarifs_grand_format, public.demandes_grand_format to authenticated;
grant all on public.tarifs_grand_format, public.demandes_grand_format to service_role;

revoke all on function public.reinitialiser_validation_tarif_grand_format() from public, anon, authenticated;
revoke all on function public.synchroniser_cout_estime_grand_format() from public, anon, authenticated;
revoke all on function public.creer_demande_grand_format(text, text, text, timestamptz, text, text, text, text, text, public.type_client, text, text, text, integer, jsonb, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.creer_demande_grand_format(text, text, text, timestamptz, text, text, text, text, text, public.type_client, text, text, text, integer, jsonb, jsonb, text, text, jsonb) to service_role;

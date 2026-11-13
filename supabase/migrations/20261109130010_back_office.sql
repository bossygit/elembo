-- Elembo — migration 0010 : back-office (catalogue, coûts et marges, notes, facturation,
-- étapes commerciales des devis, recherche et statistiques).
--
-- Principe inchangé depuis 0004 : le navigateur ne lit ni n'écrit les tables métier. Les
-- écrans /admin passent par le serveur Next.js (service_role) APRÈS contrôle du rôle staff.
-- Les nouvelles tables reçoivent la même RLS « seconde barrière » que les autres.
--
-- Migration additive : aucune colonne existante n'est supprimée ni renommée.

/* ------------------------------------------------------------ catégories ---- */

create table if not exists public.categories_produit (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  nom text not null check (char_length(trim(nom)) between 2 and 80),
  famille public.famille_produit not null,
  description text check (description is null or char_length(description) <= 500),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

comment on table public.categories_produit is
  'Catégorie commerciale d’un produit (rayon), rattachée à une famille technique.';

drop trigger if exists categories_produit_maj_le on public.categories_produit;
create trigger categories_produit_maj_le before update on public.categories_produit
  for each row execute function public.set_maj_le();

insert into public.categories_produit (id, nom, famille, ordre) values
  ('textile', 'Textile personnalisé', 'TEXTILE', 10),
  ('tableaux', 'Tableaux et toiles', 'TABLEAUX', 20),
  ('impression', 'Impression', 'IMPRESSION', 30),
  ('services', 'Services créatifs', 'SERVICES', 40)
on conflict (id) do nothing;

alter table public.produits
  add column if not exists categorie_id text references public.categories_produit (id) on delete set null;

create index if not exists produits_categorie_idx on public.produits (categorie_id);

update public.produits p
   set categorie_id = c.id
  from public.categories_produit c
 where p.categorie_id is null
   and c.id = lower(p.famille::text);

/* ---------------------------------------------------------------- images ---- */

create table if not exists public.images_produit (
  id uuid primary key default gen_random_uuid(),
  produit_id text not null references public.produits (id) on delete cascade,
  chemin text not null unique check (chemin ~ '^produits/[a-z0-9][a-z0-9_-]{2,63}/[A-Za-z0-9._-]{1,160}$'),
  type_mime text not null check (type_mime in ('image/png', 'image/jpeg', 'image/webp')),
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 5242880),
  texte_alternatif text check (texte_alternatif is null or char_length(texte_alternatif) <= 200),
  ordre integer not null default 0,
  principale boolean not null default false,
  cree_le timestamptz not null default now()
);

create index if not exists images_produit_produit_idx on public.images_produit (produit_id, ordre);
create unique index if not exists images_produit_principale_unique
  on public.images_produit (produit_id) where principale;

-- Bucket public : ce sont des visuels de catalogue, destinés à être affichés. L'écriture
-- reste réservée au serveur (aucune politique d'insertion pour anon/authenticated).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogue', 'catalogue', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ----------------------------------------------- variantes : prix et coûts ---- */

-- NULL = la variante hérite du prix / du coût du produit.
alter table public.variantes_produit
  add column if not exists prix_fcfa integer check (prix_fcfa is null or prix_fcfa >= 0),
  add column if not exists cout_fcfa integer check (cout_fcfa is null or cout_fcfa >= 0);

/* ---------------------------------------------------- notes internes ---- */

create table if not exists public.notes_internes (
  id uuid primary key default gen_random_uuid(),
  entite text not null check (entite in ('commande', 'client', 'devis')),
  entite_id uuid not null,
  contenu text not null check (char_length(trim(contenu)) between 1 and 4000),
  auteur uuid references auth.users (id) on delete set null,
  auteur_email text,
  cree_le timestamptz not null default now()
);

comment on table public.notes_internes is
  'Notes du personnel sur une commande, un client ou un devis. Jamais visibles du client.';

create index if not exists notes_internes_entite_idx
  on public.notes_internes (entite, entite_id, cree_le desc);

/* ------------------------------------------------ clients : facturation ---- */

alter table public.clients
  add column if not exists facturation_raison_sociale text
    check (facturation_raison_sociale is null or char_length(facturation_raison_sociale) <= 160),
  add column if not exists facturation_niu text
    check (facturation_niu is null or char_length(facturation_niu) <= 40),
  add column if not exists facturation_rccm text
    check (facturation_rccm is null or char_length(facturation_rccm) <= 60),
  add column if not exists facturation_adresse text
    check (facturation_adresse is null or char_length(facturation_adresse) <= 300),
  add column if not exists facturation_ville text
    check (facturation_ville is null or char_length(facturation_ville) <= 120),
  add column if not exists facturation_email text
    check (facturation_email is null or char_length(facturation_email) <= 254);

comment on column public.clients.facturation_niu is 'Numéro d’identification unique (fiscal) du client professionnel.';

/* ---------------------------------------------- devis : étapes commerciales ---- */

alter table public.devis
  add column if not exists analyse_besoins text
    check (analyse_besoins is null or char_length(analyse_besoins) <= 8000),
  add column if not exists cout_estime_fcfa integer
    check (cout_estime_fcfa is null or cout_estime_fcfa >= 0),
  add column if not exists delai_propose_jours integer
    check (delai_propose_jours is null or delai_propose_jours between 0 and 365),
  add column if not exists proposition_commerciale text
    check (proposition_commerciale is null or char_length(proposition_commerciale) <= 8000),
  add column if not exists prix_valide_par uuid references auth.users (id) on delete set null,
  add column if not exists prix_valide_par_email text,
  add column if not exists prix_valide_le timestamptz;

/*
 * « Prix validé » désigne le montant ACTUEL. S'il change avant l'acceptation, la validation
 * tombe et doit être refaite. À l'acceptation, le trigger de 0007 pose prix_valide = true et
 * verrouille le prix : on complète alors la date si personne ne l'avait validé avant.
 */
create or replace function public.reinitialiser_validation_prix_devis()
returns trigger
language plpgsql
as $$
begin
  if new.montant_propose_fcfa is distinct from old.montant_propose_fcfa
     and new.statut <> 'ACCEPTE' then
    new.prix_valide := false;
    new.prix_valide_par := null;
    new.prix_valide_par_email := null;
    new.prix_valide_le := null;
  end if;
  if new.prix_valide and new.prix_valide_le is null then
    new.prix_valide_le := now();
  end if;
  return new;
end;
$$;

-- Nommé pour s'exécuter APRÈS `devis_transition` (ordre alphabétique des triggers BEFORE).
drop trigger if exists devis_zz_validation_prix on public.devis;
create trigger devis_zz_validation_prix
  before update on public.devis
  for each row execute function public.reinitialiser_validation_prix_devis();

/* ----------------------------------------------------- coûts et marges ---- */

/*
 * Coût d'une commande = Σ (quantité × coût unitaire des lignes) + Σ coûts des travaux de
 * production (sous-traitance, reprises). Marge = sous-total − coût : la livraison est
 * refacturée au client et n'entre pas dans la marge produit.
 *
 * Le coût unitaire d'une ligne est figé à la création (coût de la variante, sinon du
 * produit) : modifier un coût catalogue ne réécrit pas l'historique.
 */
create or replace function public.completer_cout_ligne()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_cout integer;
begin
  if coalesce(new.cout_unitaire_fcfa, 0) = 0 and new.produit_id is not null then
    select coalesce(v.cout_fcfa, p.cout_fcfa)
      into v_cout
      from public.produits p
      left join public.variantes_produit v
        on v.id = new.variante_id and v.produit_id = p.id
     where p.id = new.produit_id;
    new.cout_unitaire_fcfa := coalesce(v_cout, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists lignes_commande_cout on public.lignes_commande;
create trigger lignes_commande_cout
  before insert on public.lignes_commande
  for each row execute function public.completer_cout_ligne();

create or replace function public.recalculer_cout_commande(p_commande_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.commandes c
     set cout_fcfa =
           coalesce((select sum(l.quantite * l.cout_unitaire_fcfa)
                       from public.lignes_commande l
                      where l.commande_id = c.id), 0)
         + coalesce((select sum(t.cout_fcfa)
                       from public.travaux_production t
                      where t.commande_id = c.id), 0)
   where c.id = p_commande_id;
end;
$$;

create or replace function public.declencher_recalcul_cout()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalculer_cout_commande(old.commande_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.commande_id is distinct from old.commande_id) then
    perform public.recalculer_cout_commande(new.commande_id);
  end if;
  return null;
end;
$$;

drop trigger if exists lignes_commande_recalcul_cout on public.lignes_commande;
create trigger lignes_commande_recalcul_cout
  after insert or delete or update of quantite, cout_unitaire_fcfa, commande_id
  on public.lignes_commande
  for each row execute function public.declencher_recalcul_cout();

drop trigger if exists travaux_production_recalcul_cout on public.travaux_production;
create trigger travaux_production_recalcul_cout
  after insert or delete or update of cout_fcfa, commande_id
  on public.travaux_production
  for each row execute function public.declencher_recalcul_cout();

create or replace function public.calculer_marge_commande()
returns trigger
language plpgsql
as $$
begin
  new.marge_fcfa := new.sous_total_fcfa - new.cout_fcfa;
  return new;
end;
$$;

drop trigger if exists commandes_marge on public.commandes;
create trigger commandes_marge
  before insert or update of sous_total_fcfa, cout_fcfa on public.commandes
  for each row execute function public.calculer_marge_commande();

-- Rattrapage des données existantes (lignes à coût nul dont le produit a un coût).
update public.lignes_commande l
   set cout_unitaire_fcfa = coalesce(
         (select v.cout_fcfa from public.variantes_produit v where v.id = l.variante_id),
         (select p.cout_fcfa from public.produits p where p.id = l.produit_id),
         0)
 where l.cout_unitaire_fcfa = 0
   and l.produit_id is not null;

update public.commandes c
   set cout_fcfa =
         coalesce((select sum(l.quantite * l.cout_unitaire_fcfa)
                     from public.lignes_commande l where l.commande_id = c.id), 0)
       + coalesce((select sum(t.cout_fcfa)
                     from public.travaux_production t where t.commande_id = c.id), 0);

update public.commandes set marge_fcfa = sous_total_fcfa - cout_fcfa;

/* --------------------------------------------------------------- stock ---- */

/*
 * Mouvement de stock atomique : la variante est verrouillée, le stock ne descend jamais sous
 * zéro (contrainte de 0002) et chaque mouvement est tracé dans `mouvements_stock`.
 * `AJUSTEMENT` fixe le stock à la valeur donnée (inventaire) ; les autres types l'incrémentent
 * (ENTREE) ou le décrémentent (SORTIE, PERTE).
 */
create or replace function public.mouvementer_stock(
  p_variante_id uuid,
  p_type public.type_mouvement_stock,
  p_quantite integer,
  p_motif text default null,
  p_commande_id uuid default null
) returns public.variantes_produit
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_variante public.variantes_produit;
  v_nouveau integer;
  v_delta integer;
begin
  if p_quantite is null or p_quantite < 0 or (p_type <> 'AJUSTEMENT' and p_quantite = 0) then
    raise exception 'Quantité de mouvement invalide' using errcode = '23514';
  end if;

  select * into v_variante from public.variantes_produit where id = p_variante_id for update;
  if not found then
    raise exception 'Variante inconnue : %', p_variante_id using errcode = '23503';
  end if;

  v_nouveau := case p_type
    when 'ENTREE' then v_variante.stock + p_quantite
    when 'SORTIE' then v_variante.stock - p_quantite
    when 'PERTE' then v_variante.stock - p_quantite
    when 'AJUSTEMENT' then p_quantite
  end;
  if v_nouveau < 0 then
    raise exception 'Stock insuffisant : % disponible(s), % demandé(s)', v_variante.stock, p_quantite
      using errcode = '23514';
  end if;
  v_delta := v_nouveau - v_variante.stock;
  if v_delta = 0 then
    return v_variante;
  end if;

  update public.variantes_produit set stock = v_nouveau where id = p_variante_id
  returning * into v_variante;

  insert into public.mouvements_stock
    (produit_id, variante_id, type, quantite, motif, commande_id)
  values
    (v_variante.produit_id, v_variante.id, p_type, v_delta, nullif(trim(p_motif), ''), p_commande_id);

  return v_variante;
end;
$$;

/* ------------------------------------------------------------ recherche ---- */

create index if not exists commandes_paye_le_idx on public.commandes (paye_le) where paye_le is not null;
create index if not exists commandes_livree_le_idx on public.commandes (livree_le) where livree_le is not null;
create index if not exists clients_type_idx on public.clients (type_client);
create index if not exists clients_nom_idx on public.clients (lower(nom));

/*
 * Recherche paginée des commandes. Le texte libre est un paramètre lié (jamais concaténé dans
 * un filtre PostgREST) : référence, nom, téléphone, email ou société.
 * `p_debut` inclus, `p_fin` exclu, appliqués à la date de création.
 */
create or replace function public.rechercher_commandes(
  p_texte text default null,
  p_statut public.statut_commande default null,
  p_statut_paiement public.statut_paiement_commande default null,
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_limite integer default 50,
  p_decalage integer default 0
) returns table (
  id uuid,
  reference text,
  client_id uuid,
  devis_id uuid,
  statut public.statut_commande,
  statut_paiement public.statut_paiement_commande,
  statut_production public.statut_production,
  mode_paiement public.mode_paiement_commande,
  total_fcfa integer,
  sous_total_fcfa integer,
  livraison_fcfa integer,
  cout_fcfa integer,
  marge_fcfa integer,
  ville text,
  contact_snapshot jsonb,
  cree_le timestamptz,
  paye_le timestamptz,
  livree_le timestamptz,
  livraison_prevue_le date,
  total_lignes bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with filtre as (
    select c.*
      from public.commandes c
     where (p_statut is null or c.statut = p_statut)
       and (p_statut_paiement is null or c.statut_paiement = p_statut_paiement)
       and (p_debut is null or c.cree_le >= p_debut)
       and (p_fin is null or c.cree_le < p_fin)
       and (
         nullif(trim(p_texte), '') is null
         or c.reference ilike '%' || trim(p_texte) || '%'
         or c.contact_snapshot->>'nom' ilike '%' || trim(p_texte) || '%'
         or c.contact_snapshot->>'telephone' ilike '%' || trim(p_texte) || '%'
         or c.contact_snapshot->>'email' ilike '%' || trim(p_texte) || '%'
         or c.contact_snapshot->>'societe' ilike '%' || trim(p_texte) || '%'
       )
  )
  select f.id, f.reference, f.client_id, f.devis_id, f.statut, f.statut_paiement,
         f.statut_production, f.mode_paiement, f.total_fcfa, f.sous_total_fcfa,
         f.livraison_fcfa, f.cout_fcfa, f.marge_fcfa, f.ville, f.contact_snapshot,
         f.cree_le, f.paye_le, f.livree_le, f.livraison_prevue_le,
         count(*) over () as total_lignes
    from filtre f
   order by f.cree_le desc, f.id
   limit least(greatest(coalesce(p_limite, 50), 1), 5000)
  offset greatest(coalesce(p_decalage, 0), 0);
$$;

/*
 * Clients avec leurs agrégats : nombre de commandes, montant dépensé (commandes payées
 * uniquement) et dernière commande.
 */
create or replace function public.rechercher_clients(
  p_texte text default null,
  p_type public.type_client default null,
  p_limite integer default 50,
  p_decalage integer default 0
) returns table (
  id uuid,
  type_client public.type_client,
  nom text,
  societe text,
  email text,
  telephone text,
  ville text,
  cree_le timestamptz,
  nb_commandes bigint,
  montant_depense_fcfa bigint,
  derniere_commande_le timestamptz,
  total_lignes bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with filtre as (
    select cl.*
      from public.clients cl
     where (p_type is null or cl.type_client = p_type)
       and (
         nullif(trim(p_texte), '') is null
         or cl.nom ilike '%' || trim(p_texte) || '%'
         or cl.societe ilike '%' || trim(p_texte) || '%'
         or cl.email ilike '%' || trim(p_texte) || '%'
         or cl.telephone ilike '%' || trim(p_texte) || '%'
         or cl.ville ilike '%' || trim(p_texte) || '%'
       )
  )
  select f.id, f.type_client, f.nom, f.societe, f.email, f.telephone, f.ville, f.cree_le,
         coalesce(a.nb, 0), coalesce(a.depense, 0), a.derniere,
         count(*) over ()
    from filtre f
    left join lateral (
      select count(*) as nb,
             sum(c.total_fcfa) filter (where c.statut_paiement = 'PAYE') as depense,
             max(c.cree_le) as derniere
        from public.commandes c
       where c.client_id = f.id
    ) a on true
   order by a.derniere desc nulls last, f.nom
   limit least(greatest(coalesce(p_limite, 50), 1), 500)
  offset greatest(coalesce(p_decalage, 0), 0);
$$;

/* -------------------------------------------------------- statistiques ---- */

/*
 * Indicateurs du tableau de bord sur une période [p_debut, p_fin[.
 *  - CA : commandes PAYÉES dont le paiement tombe dans la période (date de paiement) ;
 *  - commandes reçues : créées dans la période, brouillons exclus ;
 *  - en production : instantané (indépendant de la période) ;
 *  - ventes par catégorie et produits les plus vendus : lignes des commandes payées ;
 *  - marge : sur les commandes payées ; `sans_cout` compte celles dont le coût n'est pas
 *    renseigné (marge surestimée tant qu'il manque) ;
 *  - alertes de stock : variantes dont le seuil est renseigné (> 0) et atteint. Un seuil à 0
 *    signifie « stock non suivi » (production à la demande).
 *  - séries découpées à l'heure de Brazzaville.
 */
create or replace function public.statistiques_back_office(
  p_debut timestamptz,
  p_fin timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with payees as (
    select c.*
      from public.commandes c
     where c.statut_paiement = 'PAYE'
       and c.paye_le >= p_debut and c.paye_le < p_fin
  ),
  lignes as (
    -- Catégorie : celle du produit, sinon la catégorie par défaut de sa famille (même id que
    -- la famille en minuscules), sinon la famille du devis : une famille = une seule barre.
    select l.*, p.nom as produit_nom,
           coalesce(cat.nom, catf.nom, initcap(lower(coalesce(p.famille::text, c.design_snapshot->>'famille')))) as categorie_nom
      from public.lignes_commande l
      join payees c on c.id = l.commande_id
      left join public.produits p on p.id = l.produit_id
      left join public.categories_produit cat on cat.id = p.categorie_id
      left join public.categories_produit catf
        on catf.id = lower(coalesce(p.famille::text, c.design_snapshot->>'famille'))
  ),
  pas as (
    select case when p_fin - p_debut > interval '62 days' then 'week' else 'day' end as unite
  )
  select jsonb_build_object(
    'periode', jsonb_build_object('debut', p_debut, 'fin', p_fin, 'unite', (select unite from pas)),
    'chiffre_affaires_fcfa', coalesce((select sum(total_fcfa) from payees), 0),
    'ventes_fcfa', coalesce((select sum(sous_total_fcfa) from payees), 0),
    'commandes_recues', (
      select count(*) from public.commandes
       where cree_le >= p_debut and cree_le < p_fin and statut <> 'BROUILLON'
    ),
    'commandes_payees', (select count(*) from payees),
    'commandes_livrees', (
      select count(*) from public.commandes where livree_le >= p_debut and livree_le < p_fin
    ),
    'commandes_en_production', (
      select count(*) from public.commandes
       where statut in ('A_PRODUIRE', 'EN_PRODUCTION', 'CONTROLE_QUALITE')
    ),
    'commandes_a_lancer', (select count(*) from public.commandes where statut = 'PAYEE'),
    'commandes_pretes', (select count(*) from public.commandes where statut in ('PRETE', 'EN_LIVRAISON')),
    'paiements_anomalie', (
      select count(*) from public.commandes where statut_paiement = 'ANOMALIE'
    ),
    'devis_recus', (
      select count(*) from public.devis where cree_le >= p_debut and cree_le < p_fin
    ),
    'devis_par_statut', coalesce((
      select jsonb_object_agg(statut, n) from (
        select statut::text, count(*) as n from public.devis group by statut
      ) s
    ), '{}'::jsonb),
    'travaux_en_retard', (
      select count(*) from public.travaux_production
       where date_prevue < current_date and statut in ('A_FAIRE', 'EN_COURS', 'BLOQUE')
    ),
    'marge', jsonb_build_object(
      'ventes_fcfa', coalesce((select sum(sous_total_fcfa) from payees), 0),
      'cout_fcfa', coalesce((select sum(cout_fcfa) from payees), 0),
      'marge_fcfa', coalesce((select sum(marge_fcfa) from payees), 0),
      'sans_cout', (select count(*) from payees where cout_fcfa = 0)
    ),
    'ventes_par_categorie', coalesce((
      select jsonb_agg(x order by x.montant_fcfa desc) from (
        select coalesce(categorie_nom, 'Non classé') as categorie,
               sum(total_ligne_fcfa) as montant_fcfa,
               sum(quantite) as quantite
          from lignes
         group by 1
      ) x
    ), '[]'::jsonb),
    'produits_plus_vendus', coalesce((
      select jsonb_agg(x order by x.quantite desc, x.montant_fcfa desc) from (
        select coalesce(produit_id, 'sur-devis') as produit_id,
               coalesce(produit_nom, 'Prestations sur devis') as nom,
               sum(quantite) as quantite,
               sum(total_ligne_fcfa) as montant_fcfa,
               sum(total_ligne_fcfa - quantite * cout_unitaire_fcfa) as marge_fcfa
          from lignes
         group by 1, 2
         order by sum(quantite) desc, sum(total_ligne_fcfa) desc
         limit 8
      ) x
    ), '[]'::jsonb),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('debut', g.debut, 'ca_fcfa', coalesce(s.ca, 0), 'commandes', coalesce(s.n, 0)) order by g.debut)
        from (
          select generate_series(
            date_trunc((select unite from pas), p_debut, 'Africa/Brazzaville'),
            p_fin - interval '1 second',
            case when (select unite from pas) = 'week' then interval '1 week' else interval '1 day' end
          ) as debut
        ) g
        left join (
          select date_trunc((select unite from pas), paye_le, 'Africa/Brazzaville') as debut,
                 sum(total_fcfa) as ca, count(*) as n
            from payees group by 1
        ) s on s.debut = g.debut
    ), '[]'::jsonb),
    'alertes_stock', coalesce((
      select jsonb_agg(x order by x.stock, x.produit_nom) from (
        select v.id, v.produit_id, p.nom as produit_nom, v.taille, v.couleur, v.sku,
               v.stock, v.seuil_alerte
          from public.variantes_produit v
          join public.produits p on p.id = v.produit_id
         where v.actif and p.actif and v.seuil_alerte > 0 and v.stock <= v.seuil_alerte
         order by v.stock, p.nom
         limit 20
      ) x
    ), '[]'::jsonb)
  );
$$;

/* -------------------------------------------------------- RLS et droits ---- */

alter table public.categories_produit enable row level security;
alter table public.images_produit enable row level security;
alter table public.notes_internes enable row level security;

drop policy if exists categories_select_public on public.categories_produit;
create policy categories_select_public on public.categories_produit
  for select to anon, authenticated
  using (actif or public.is_staff());

drop policy if exists images_produit_select_public on public.images_produit;
create policy images_produit_select_public on public.images_produit
  for select to anon
  using (exists (
    select 1 from public.produits p
     where p.id = images_produit.produit_id
       and p.actif and p.disponible and p.statut_prix = 'VALIDE'
  ));

drop policy if exists images_produit_select_staff on public.images_produit;
create policy images_produit_select_staff on public.images_produit
  for select to authenticated
  using (public.is_staff());

drop policy if exists notes_internes_select_staff on public.notes_internes;
create policy notes_internes_select_staff on public.notes_internes
  for select to authenticated
  using (
    case entite
      when 'devis' then public.has_role(array['admin', 'commercial', 'finance'])
      when 'client' then public.has_role(array['admin', 'commercial', 'finance'])
      else public.is_staff()
    end
  );

revoke all on public.categories_produit, public.images_produit, public.notes_internes
  from anon, authenticated;
grant select on public.categories_produit to anon, authenticated;
grant select on public.images_produit to anon, authenticated;
grant select on public.notes_internes to authenticated;
grant all on public.categories_produit, public.images_produit, public.notes_internes to service_role;

revoke all on function public.recalculer_cout_commande(uuid) from public, anon, authenticated;
revoke all on function public.declencher_recalcul_cout() from public, anon, authenticated;
revoke all on function public.completer_cout_ligne() from public, anon, authenticated;
revoke all on function public.calculer_marge_commande() from public, anon, authenticated;
revoke all on function public.reinitialiser_validation_prix_devis() from public, anon, authenticated;
revoke all on function public.mouvementer_stock(uuid, public.type_mouvement_stock, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.rechercher_commandes(text, public.statut_commande, public.statut_paiement_commande, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.rechercher_clients(text, public.type_client, integer, integer) from public, anon, authenticated;
revoke all on function public.statistiques_back_office(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.recalculer_cout_commande(uuid) to service_role;
grant execute on function public.mouvementer_stock(uuid, public.type_mouvement_stock, integer, text, uuid) to service_role;
grant execute on function public.rechercher_commandes(text, public.statut_commande, public.statut_paiement_commande, timestamptz, timestamptz, integer, integer) to service_role;
grant execute on function public.rechercher_clients(text, public.type_client, integer, integer) to service_role;
grant execute on function public.statistiques_back_office(timestamptz, timestamptz) to service_role;

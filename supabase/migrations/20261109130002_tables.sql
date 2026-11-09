-- Elembo — socle Supabase, migration 0002 : tables et relations.
-- Ordre de création : référentiels → clients → produits → devis → commandes → production.

/* ------------------------------------------------------------------ clients ---- */

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  type_client public.type_client not null default 'PARTICULIER',
  nom text not null check (char_length(trim(nom)) between 2 and 160),
  societe text,
  email text,
  telephone text not null check (char_length(trim(telephone)) between 6 and 32),
  telephone_normalise text,
  adresse text,
  ville text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

comment on table public.clients is
  'Client final ou entreprise. Un client peut exister sans compte ; user_id est réservé aux comptes futurs.';

/* ----------------------------------------------------------------- produits ---- */

create table public.produits (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  famille public.famille_produit not null,
  nom text not null,
  description text,
  technique text,
  disponible boolean not null default false,
  actif boolean not null default true,
  statut_prix public.statut_prix not null default 'PROVISOIRE',
  prix_fcfa integer check (prix_fcfa is null or prix_fcfa >= 0),
  cout_fcfa integer check (cout_fcfa is null or cout_fcfa >= 0),
  delai_jours integer check (delai_jours is null or delai_jours >= 0),
  quantite_min integer not null default 1 check (quantite_min >= 1),
  metadata jsonb not null default '{}'::jsonb,
  prix_valide_par uuid references auth.users (id) on delete set null,
  prix_valide_par_email text,
  prix_valide_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint produits_prix_valide_check
    check (
      statut_prix <> 'VALIDE'
      or (
        prix_fcfa is not null
        and prix_valide_par_email is not null
        and char_length(trim(prix_valide_par_email)) between 3 and 254
        and prix_valide_le is not null
      )
    )
);

comment on table public.produits is
  'Référentiel commercial. Un prix VALIDE est le seul facturable ; TEST et PROVISOIRE passent par un devis.';

create table public.variantes_produit (
  id uuid primary key default gen_random_uuid(),
  produit_id text not null references public.produits (id) on delete cascade,
  taille text,
  couleur text,
  sku text,
  stock integer not null default 0 check (stock >= 0),
  seuil_alerte integer not null default 0 check (seuil_alerte >= 0),
  actif boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create unique index variantes_produit_unique
  on public.variantes_produit (produit_id, coalesce(taille, ''), coalesce(couleur, ''));
create unique index variantes_produit_sku_unique
  on public.variantes_produit (sku) where sku is not null;

/* ------------------------------------------------------------------- devis ---- */

create table public.devis (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^DEV-[A-Z0-9-]{6,40}$'),
  client_id uuid not null references public.clients (id) on delete restrict,
  famille public.famille_produit not null,
  besoin text not null check (char_length(trim(besoin)) between 10 and 4000),
  format text,
  quantite integer check (quantite is null or quantite >= 1),
  specifications jsonb not null default '{}'::jsonb,
  statut public.statut_devis not null default 'NOUVEAU',
  montant_propose_fcfa integer check (montant_propose_fcfa is null or montant_propose_fcfa >= 0),
  prix_valide boolean not null default false,
  prix_verrouille boolean not null default false,
  date_relance date,
  expire_le timestamptz,
  assigne_a uuid references auth.users (id) on delete set null,
  source text not null default 'SITE' check (source in ('SITE', 'WHATSAPP', 'EMAIL', 'TELEPHONE', 'AUTRE')),
  notes_internes text,
  idempotency_key text unique,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint devis_prix_valide_check
    check (not prix_valide or montant_propose_fcfa is not null)
);

comment on table public.devis is
  'Demande de devis. Un devis ACCEPTE conserve son prix et ses options (prix_verrouille).';

create table public.fichiers_devis (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis (id) on delete cascade,
  nom text not null check (char_length(trim(nom)) between 1 and 255),
  chemin text not null,
  type_mime text not null,
  taille_octets bigint not null check (taille_octets > 0),
  type_fichier public.type_fichier not null default 'SOURCE',
  fournisseur public.fournisseur_stockage not null default 'SUPABASE',
  checksum text,
  verifie boolean not null default false,
  verifie_le timestamptz,
  expire_le timestamptz,
  cree_le timestamptz not null default now(),
  unique (devis_id, nom)
);

/* --------------------------------------------------------------- commandes ---- */

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^ELB-[A-Z0-9-]{6,40}$'),
  client_id uuid not null references public.clients (id) on delete restrict,
  devis_id uuid unique references public.devis (id) on delete set null,
  statut public.statut_commande not null default 'BROUILLON',
  statut_paiement public.statut_paiement_commande not null default 'EN_ATTENTE',
  statut_production public.statut_production not null default 'A_FAIRE',
  statut_livraison public.statut_livraison not null default 'A_LIVRER',
  sous_total_fcfa integer not null default 0 check (sous_total_fcfa >= 0),
  livraison_fcfa integer not null default 0 check (livraison_fcfa >= 0),
  total_fcfa integer not null default 0 check (total_fcfa >= 0),
  cout_fcfa integer not null default 0 check (cout_fcfa >= 0),
  marge_fcfa integer not null default 0,
  ville text,
  adresse text,
  notes text,
  design_snapshot jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  paye_le timestamptz,
  production_demarree_le timestamptz,
  prete_le timestamptz,
  livree_le timestamptz,
  annulee_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint commandes_design_snapshot_object
    check (jsonb_typeof(design_snapshot) = 'object'),
  constraint commandes_paiement_coherent
    check (statut_paiement <> 'PAYE' or paye_le is not null)
);

comment on table public.commandes is
  'Commande créée AVANT le paiement. La transaction de paiement est un enfant de cette ligne.';

create table public.lignes_commande (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes (id) on delete cascade,
  produit_id text references public.produits (id) on delete restrict,
  variante_id uuid references public.variantes_produit (id) on delete set null,
  designation text not null,
  quantite integer not null check (quantite > 0),
  prix_unitaire_fcfa integer not null check (prix_unitaire_fcfa >= 0),
  cout_unitaire_fcfa integer not null default 0 check (cout_unitaire_fcfa >= 0),
  total_ligne_fcfa integer not null check (total_ligne_fcfa >= 0),
  options jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now()
);

create table public.fichiers_commande (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes (id) on delete cascade,
  nom text not null check (char_length(trim(nom)) between 1 and 255),
  chemin text not null,
  type_mime text not null,
  taille_octets bigint not null check (taille_octets > 0),
  type_fichier public.type_fichier not null,
  fournisseur public.fournisseur_stockage not null default 'SUPABASE',
  checksum text,
  verifie boolean not null default false,
  verifie_le timestamptz,
  expire_le timestamptz,
  cree_le timestamptz not null default now(),
  unique (commande_id, nom)
);

create table public.paiements (
  reference_id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes (id) on delete restrict,
  operateur public.operateur_paiement not null default 'MTN_MOMO',
  montant_fcfa integer not null check (montant_fcfa > 0),
  montant_envoye text not null,
  devise text not null default 'XAF',
  statut public.statut_transaction not null default 'PENDING',
  financial_tx_id text,
  msisdn text not null,
  raison text,
  idempotency_key text unique,
  payload jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

-- Une seule transaction PAYE par commande : la base refuse un double encaissement.
create unique index paiements_un_seul_paye_par_commande
  on public.paiements (commande_id) where statut = 'PAYE';

/* -------------------------------------------------------------- production ---- */

create table public.partenaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  specialite text not null,
  telephone text,
  email text,
  tarifs jsonb not null default '{}'::jsonb,
  delai_jours integer check (delai_jours is null or delai_jours >= 0),
  notes text,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create table public.travaux_production (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes (id) on delete cascade,
  etape text not null,
  statut public.statut_production not null default 'A_FAIRE',
  partenaire_id uuid references public.partenaires (id) on delete set null,
  interne boolean not null default true,
  date_prevue date,
  instructions text,
  cout_fcfa integer check (cout_fcfa is null or cout_fcfa >= 0),
  termine_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create table public.historique_statuts_commande (
  id bigserial primary key,
  commande_id uuid not null references public.commandes (id) on delete cascade,
  ancien_statut public.statut_commande not null,
  nouveau_statut public.statut_commande not null,
  acteur uuid references auth.users (id) on delete set null,
  note text,
  cree_le timestamptz not null default now()
);

create table public.historique_statuts_devis (
  id bigserial primary key,
  devis_id uuid not null references public.devis (id) on delete cascade,
  ancien_statut public.statut_devis not null,
  nouveau_statut public.statut_devis not null,
  acteur uuid references auth.users (id) on delete set null,
  note text,
  cree_le timestamptz not null default now()
);

/* --------------------------------------------------------- stock et finances --- */

create table public.mouvements_stock (
  id uuid primary key default gen_random_uuid(),
  produit_id text not null references public.produits (id) on delete restrict,
  variante_id uuid references public.variantes_produit (id) on delete set null,
  type public.type_mouvement_stock not null,
  quantite integer not null check (quantite <> 0),
  cout_unitaire_fcfa integer check (cout_unitaire_fcfa is null or cout_unitaire_fcfa >= 0),
  motif text,
  commande_id uuid references public.commandes (id) on delete set null,
  cree_le timestamptz not null default now()
);

create table public.lignes_budget (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  montant_prevu_fcfa integer not null check (montant_prevu_fcfa >= 0),
  reserve boolean not null default false,
  categorie public.categorie_depense not null default 'AUTRE',
  cree_le timestamptz not null default now()
);

create table public.depenses (
  id uuid primary key default gen_random_uuid(),
  ligne_budget_id uuid references public.lignes_budget (id) on delete set null,
  categorie public.categorie_depense not null default 'AUTRE',
  libelle text not null,
  montant_fcfa integer not null check (montant_fcfa > 0),
  date_depense date not null default current_date,
  justificatif_url text,
  notes text,
  cree_le timestamptz not null default now()
);

/* ------------------------------------------------------- audit et messages ---- */

create table public.journal_audit (
  id bigserial primary key,
  acteur uuid references auth.users (id) on delete set null,
  acteur_email text,
  action text not null,
  entite text not null,
  entite_id text,
  avant jsonb,
  apres jsonb,
  cree_le timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  canal public.canal_notification not null,
  destinataire text not null,
  sujet text,
  corps text not null,
  statut public.statut_notification not null default 'A_ENVOYER',
  tentatives integer not null default 0 check (tentatives >= 0),
  derniere_erreur text,
  envoye_le timestamptz,
  entite text,
  entite_id text,
  cle_idempotence text unique,
  metadata jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create table public.paiement_evenements (
  id bigserial primary key,
  reference_id uuid not null,
  commande_id uuid references public.commandes (id) on delete set null,
  source text not null check (source in ('CALLBACK', 'POLL', 'RECONCILIATION', 'MANUEL')),
  statut_recu text,
  cle_evenement text not null unique,
  payload jsonb not null default '{}'::jsonb,
  occurrences integer not null default 1 check (occurrences >= 1),
  traite boolean not null default false,
  traite_le timestamptz,
  erreur text,
  premier_recu_le timestamptz not null default now(),
  dernier_recu_le timestamptz not null default now()
);

comment on table public.paiement_evenements is
  'Journal durable des callbacks et vérifications MTN. Un doublon incrémente occurrences sans être retraité.';

create table public.taches_reconciliation (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'PAIEMENT_PENDING',
    'PAIEMENT_SANS_DOSSIER',
    'PRODUCTION_SANS_TACHE',
    'NOTIFICATION_ECHEC',
    'FICHIER_ORPHELIN'
  )),
  reference_id uuid,
  commande_id uuid references public.commandes (id) on delete cascade,
  statut text not null default 'A_FAIRE' check (statut in ('A_FAIRE', 'EN_COURS', 'TERMINE', 'ECHEC', 'ANNULE')),
  tentatives integer not null default 0 check (tentatives >= 0),
  prochaine_tentative timestamptz not null default now(),
  derniere_erreur text,
  metadata jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique nulls not distinct (type, reference_id, commande_id)
);

comment on table public.taches_reconciliation is
  'File durable de reprise : paiement en attente, paiement sans dossier, production sans tâche, notification échouée.';

create table public.parametres (
  cle text primary key,
  valeur jsonb not null,
  est_public boolean not null default false,
  description text,
  maj_le timestamptz not null default now()
);

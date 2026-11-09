-- Elembo — socle Supabase, migration 0001 : extensions et types.
-- À appliquer dans l'ordre : 0001 → 0006.
-- Supabase fournit déjà les schémas `auth` et `storage` ; ne pas les recréer.

create extension if not exists pgcrypto;

do $$ begin
  create type public.type_client as enum ('PARTICULIER', 'ENTREPRISE', 'ASSOCIATION', 'ECOLE', 'AUTRE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.famille_produit as enum ('TEXTILE', 'TABLEAUX', 'IMPRESSION', 'SERVICES');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_prix as enum ('TEST', 'PROVISOIRE', 'VALIDE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_commande as enum (
    'BROUILLON',
    'EN_ATTENTE_DE_VALIDATION',
    'EN_ATTENTE_DE_PAIEMENT',
    'PAYEE',
    'A_PRODUIRE',
    'EN_PRODUCTION',
    'CONTROLE_QUALITE',
    'PRETE',
    'EN_LIVRAISON',
    'LIVREE',
    'ANNULEE',
    'REMBOURSEMENT_A_TRAITER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_paiement_commande as enum (
    'NON_REQUIS',
    'EN_ATTENTE',
    'PAYE',
    'ECHEC',
    'ANOMALIE',
    'REMBOURSE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_transaction as enum ('PENDING', 'PAYE', 'ECHEC', 'ANOMALIE', 'REMBOURSE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.operateur_paiement as enum ('MTN_MOMO', 'AIRTEL_MONEY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_production as enum ('A_FAIRE', 'EN_COURS', 'TERMINE', 'BLOQUE', 'ANNULE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_livraison as enum ('A_LIVRER', 'EN_LIVRAISON', 'LIVREE', 'ECHEC');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_devis as enum ('NOUVEAU', 'EN_ANALYSE', 'PROPOSE', 'ACCEPTE', 'REFUSE', 'EXPIRE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.type_fichier as enum ('VISUEL_IMPRESSION', 'FICHE_PRODUCTION', 'BAT', 'FACTURE', 'SOURCE', 'AUTRE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fournisseur_stockage as enum ('SUPABASE', 'VERCEL_BLOB');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.type_mouvement_stock as enum ('ENTREE', 'SORTIE', 'AJUSTEMENT', 'PERTE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.categorie_depense as enum (
    'TEXTILE',
    'DTF',
    'FLEX',
    'SOUS_TRAITANCE',
    'EMBALLAGE',
    'PAIEMENT',
    'LIVRAISON',
    'PUBLICITE',
    'OUTILS',
    'AUTRE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.canal_notification as enum ('TELEGRAM', 'EMAIL', 'WHATSAPP');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.statut_notification as enum ('A_ENVOYER', 'ENVOYEE', 'ECHEC', 'ANNULEE');
exception when duplicate_object then null; end $$;

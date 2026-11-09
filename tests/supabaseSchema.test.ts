/**
 * Garde-fous statiques du schéma Supabase.
 *
 * Ces tests ne remplacent pas une exécution sur une base de test : ils empêchent qu'une
 * migration future supprime sans bruit les invariants qui protègent l'argent et les données
 * clients (commande avant paiement, un seul paiement payé, RLS, prix de devis verrouillé).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');

function lire(nom: string): string {
  return readFileSync(join(DIR, nom), 'utf8');
}

const fichiers = [
  '20261109130001_extensions_types.sql',
  '20261109130002_tables.sql',
  '20261109130003_fonctions_index.sql',
  '20261109130004_rls_permissions.sql',
  '20261109130005_storage.sql',
  '20261109130006_seed_reference.sql',
  '20261109130007_devis_suivi.sql',
];

const tables = lire(fichiers[1]);
const fonctions = lire(fichiers[2]);
const rls = lire(fichiers[3]);
const seed = lire(fichiers[5]);
const migration7 = lire(fichiers[6]);

describe('schéma Supabase', () => {
  it('les sept migrations versionnées existent', () => {
    for (const fichier of fichiers) {
      expect(() => lire(fichier), fichier).not.toThrow();
    }
  });

  it('une transaction de paiement appartient obligatoirement à une commande', () => {
    expect(tables).toMatch(/create table public\.paiements/i);
    expect(tables).toMatch(/commande_id uuid not null references public\.commandes/i);
  });

  it('la base interdit deux paiements PAYE pour une même commande', () => {
    expect(tables).toMatch(/create unique index paiements_un_seul_paye_par_commande/i);
    expect(tables).toMatch(/where statut = 'PAYE'/i);
  });

  it('un paiement ne peut être créé que pour une commande en attente et au bon montant', () => {
    expect(fonctions).toMatch(/verifier_paiement_avant_insert/i);
    expect(fonctions).toMatch(/new\.montant_fcfa <> attendu/i);
    expect(fonctions).toMatch(/statut = 'EN_ATTENTE_DE_PAIEMENT'/i);
  });

  it('la machine à états refuse PAYEE sans paiement confirmé', () => {
    expect(fonctions).toMatch(/transition_commande_autorisee/i);
    expect(fonctions).toMatch(/ne peut pas passer PAYEE sans paiement confirmé/i);
  });

  it('un devis accepté verrouille son prix', () => {
    expect(fonctions).toMatch(/prix_verrouille := true/i);
    expect(fonctions).toMatch(/prix du devis accepté .* est verrouillé/i);
  });

  it('un prix VALIDE exige un acteur et une date de validation explicites', () => {
    expect(tables).toMatch(/prix_valide_par uuid references auth\.users/i);
    expect(tables).toMatch(/prix_valide_par_email text/i);
    expect(tables).toMatch(/prix_valide_le timestamptz/i);
    expect(tables).toMatch(/statut_prix <> 'VALIDE'[\s\S]*prix_valide_par_email is not null/i);
  });

  it('le paiement confirmé crée une tâche de production durable', () => {
    expect(fonctions).toMatch(/insert into public\.travaux_production/i);
    expect(fonctions).toMatch(/'INITIALISATION'/);
    expect(fonctions).toMatch(/on conflict \(commande_id, etape\) do nothing/i);
  });

  it('les fichiers portent une vérification et une date d’expiration', () => {
    expect(tables).toMatch(/verifie boolean not null default false/i);
    expect(tables).toMatch(/verifie_le timestamptz/i);
    expect(tables).toMatch(/expire_le timestamptz/i);
  });

  it('le design snapshot est un objet JSON conservé pour la régénération', () => {
    expect(tables).toMatch(/design_snapshot jsonb not null default '\{\}'/i);
    expect(tables).toMatch(/jsonb_typeof\(design_snapshot\) = 'object'/i);
  });

  it('les événements de paiement et les tâches de reprise sont journalisés', () => {
    expect(tables).toMatch(/create table public\.paiement_evenements/i);
    expect(tables).toMatch(/cle_evenement text not null unique/i);
    expect(tables).toMatch(/occurrences integer/i);
    expect(tables).toMatch(/create table public\.taches_reconciliation/i);
    expect(tables).toMatch(/prochaine_tentative timestamptz/i);
  });

  it('la RLS est activée sur toutes les tables métier', () => {
    const attendues = [
      'clients',
      'produits',
      'variantes_produit',
      'devis',
      'fichiers_devis',
      'commandes',
      'lignes_commande',
      'fichiers_commande',
      'paiements',
      'partenaires',
      'travaux_production',
      'historique_statuts_commande',
      'historique_statuts_devis',
      'mouvements_stock',
      'lignes_budget',
      'depenses',
      'journal_audit',
      'notifications',
      'paiement_evenements',
      'taches_reconciliation',
      'parametres',
      'devis_sessions',
    ];
    for (const table of attendues) {
      const source = table === 'devis_sessions' ? migration7 : rls;
      expect(source, table).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }
  });

  it('le navigateur n’a aucune écriture directe', () => {
    expect(rls).toMatch(/revoke all on all tables in schema public from anon, authenticated/i);
    expect(rls).toMatch(/grant all on all tables in schema public to service_role/i);
    expect(rls).not.toMatch(/grant (insert|update|delete)[^;]*to (anon|authenticated)/i);
  });

  it('le suivi des devis, les sessions et l’analyse des fichiers sont protégés', () => {
    expect(migration7).toMatch(/suivi_token_hash text/i);
    expect(migration7).toMatch(/create table public\.devis_sessions/i);
    expect(migration7).toMatch(/statut_analyse text not null default 'NON_ANALYSE'/i);
    expect(migration7).toMatch(/security definer/i);
    expect(migration7).toMatch(/set search_path = pg_catalog, public, auth/i);
    expect(migration7).toMatch(/revoke all on function .* from public, anon, authenticated/i);
    expect(migration7).toMatch(/grant execute on function .* to service_role/i);
    expect(migration7).toMatch(/devis-sessions:/i);
  });

  it('le seed ne fabrique ni stock ni prix commercial', () => {
    expect(seed).toMatch(/'tshirt-basic'/);
    expect(seed).toMatch(/'TEST'/);
    expect(seed).toMatch(/stock_a_confirmer/i);
    expect(seed).toMatch(/415000/);
    expect(seed).toMatch(/85000/);
    expect(seed).not.toMatch(/prix_fcfa.*[1-9][0-9]{3,}/i);
  });
});

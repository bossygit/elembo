/**
 * Garde-fous statiques de la migration du Lot 2 (affectations, 0013).
 *
 * Comme `partenairesSchema.test.ts`, ils ne remplacent pas `supabase/tests/affectations.sql`
 * exécuté sur une vraie base : ils empêchent qu'une modification future retire sans bruit une
 * protection de cloisonnement, un verrou d'immuabilité ou une révocation de droits.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261119120000_affectations.sql'), 'utf8');
const ROLLBACK = readFileSync(join(process.cwd(), 'supabase/rollbacks/20261119120000_affectations_down.sql'), 'utf8');
const TEST_SQL = readFileSync(join(process.cwd(), 'supabase/tests/affectations.sql'), 'utf8');

const tables = [...SQL.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
const fonctions = [...SQL.matchAll(/create or replace function public\.([a-z_]+)\(([^)]*)\)/g)].map((m) => m[1]);

describe('migration affectations (Lot 2)', () => {
  it('crée exactement les trois tables prévues', () => {
    expect(tables.sort()).toEqual(['affectation_fichiers', 'affectations_evenements', 'affectations_production']);
  });

  it('active la RLS et une politique staff sur chaque table', () => {
    for (const t of tables) {
      expect(SQL, t).toContain(`alter table public.${t} enable row level security;`);
      expect(SQL, t).toMatch(new RegExp(`create policy ${t}_staff on public\\.${t}`));
    }
  });

  it('n’ouvre aucune politique directe à un partenaire (lecture par fonctions)', () => {
    // Les seules politiques des tables d'affectation sont staff ; le cloisonnement A/B passe
    // par mes_affectations()/mon_affectation(), comme mon_partenaire() au Lot 1.
    const politiques = [...SQL.matchAll(/create policy ([a-z_]+) on public\.(affectations_production|affectations_evenements|affectation_fichiers)\s+for select to authenticated using \(([^;]+)\);/g)];
    expect(politiques.length).toBe(3);
    for (const m of politiques) expect(m[3], m[1]).toContain('public.is_staff()');
    expect(SQL).not.toMatch(/create policy [a-z_]+ on public\.(affectations_production|affectations_evenements|affectation_fichiers)[^;]*partenaire_session/);
  });

  it('n’accorde aucune écriture au navigateur', () => {
    expect(SQL).not.toMatch(/grant (insert|update|delete|all)[^;]*to[^;]*\b(anon|authenticated)\b/i);
    expect(SQL).not.toMatch(/for (insert|update|delete|all) to (anon|authenticated)/i);
  });

  it('garde les écritures en service_role et expose seulement les lectures au portail', () => {
    for (const f of [
      'proposer_affectation',
      'ajouter_fichiers_affectation',
      'decider_affectation',
      'annuler_affectation',
      'terminer_affectation',
      'expirer_affectations',
      'brouillons_abandonnes',
      'archiver_brouillon',
    ]) {
      expect(fonctions, f).toContain(f);
      expect(SQL, f).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, f).not.toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to [^;]*authenticated`));
    }
    for (const f of ['mes_affectations', 'mon_affectation']) {
      expect(SQL, f).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated, service_role;`));
    }
  });

  it('le tarif est figé et ne peut plus être réécrit', () => {
    const debut = SQL.indexOf('function public.verifier_affectation_immuable');
    const corps = SQL.slice(debut, SQL.indexOf('$$;', debut));
    for (const colonne of ['montant_fcfa', 'tarif_id', 'tarif_version', 'tarif_prix_unitaire_fcfa', 'quantite_base', 'tarif_source', 'partenaire_id', 'tache_id', 'devis_id']) {
      expect(corps, colonne).toContain(`new.${colonne} is distinct from old.${colonne}`);
    }
    expect(corps).toContain('Une affectation est figée');
  });

  it('une seule affectation active par tâche et par banderole', () => {
    expect(SQL).toMatch(/create unique index if not exists affectations_une_active_tache[\s\S]*?where tache_id is not null and statut in \('PROPOSEE', 'ACCEPTEE'\)/);
    expect(SQL).toMatch(/create unique index if not exists affectations_une_active_devis[\s\S]*?where devis_id is not null and statut in \('PROPOSEE', 'ACCEPTEE'\)/);
  });

  it('reflète exactement les transitions autorisées', () => {
    const debut = SQL.indexOf('function public.transition_affectation_autorisee');
    const corps = SQL.slice(debut, SQL.indexOf('$$;', debut));
    const paires = [...corps.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)].map((m) => `${m[1]}->${m[2]}`).sort();
    expect(paires).toEqual([
      'ACCEPTEE->ANNULEE',
      'ACCEPTEE->TERMINEE',
      'PROPOSEE->ACCEPTEE',
      'PROPOSEE->ANNULEE',
      'PROPOSEE->EXPIREE',
      'PROPOSEE->REFUSEE',
    ]);
  });

  it('l’acceptation pose l’atelier, l’annulation le retire', () => {
    const debut = SQL.indexOf('function public.synchroniser_affectation');
    const corps = SQL.slice(debut, SQL.indexOf('$$;', debut));
    expect(corps).toContain('set partenaire_id = new.partenaire_id');
    expect(corps).toContain('set partenaire_id = null');
    expect(corps).toContain("new.statut = 'ACCEPTEE' and old.statut = 'PROPOSEE'");
    expect(corps).toContain("new.statut in ('ANNULEE', 'REFUSEE') and old.statut = 'ACCEPTEE'");
  });

  it('le montant n’est visible que du responsable de l’atelier', () => {
    const debut = SQL.indexOf('function public.mes_affectations');
    const corps = SQL.slice(debut, SQL.indexOf('$$;', debut));
    expect(corps).toContain("case when public.role_partenaire_session() = 'RESPONSABLE' then a.montant_fcfa end");
  });

  it('le retour arrière supprime chaque table et chaque fonction', () => {
    for (const t of tables) expect(ROLLBACK, t).toContain(`drop table if exists public.${t};`);
    for (const f of new Set(fonctions)) expect(ROLLBACK, f).toMatch(new RegExp(`drop function if exists public\\.${f}\\(`));
    expect(ROLLBACK).toContain("where version = '20261119120000'");
  });

  it('le script SQL couvre l’acceptation, le refus, l’immuabilité et le cloisonnement A/B', () => {
    for (const attendu of [
      'acceptation : la tâche porte l’atelier',
      'refus : motif obligatoire',
      'instantané : un tarif accepté ne se réécrit pas',
      'RLS : un atelier ne lit pas les affectations d’un autre',
    ]) {
      expect(TEST_SQL, attendu).toContain(attendu);
    }
    expect(TEST_SQL.trim().endsWith('rollback;')).toBe(true);
  });
});

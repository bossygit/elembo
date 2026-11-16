/**
 * Garde-fous statiques de la migration Elembo Partners (0012).
 *
 * Ils ne remplacent pas `supabase/tests/elembo_partners.sql` (exécuté sur une vraie base) : ils
 * empêchent qu'une modification future retire sans bruit une protection de cloisonnement.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261116120000_elembo_partners.sql'), 'utf8');
const ROLLBACK = readFileSync(join(process.cwd(), 'supabase/rollbacks/20261116120000_elembo_partners_down.sql'), 'utf8');
const TEST_SQL = readFileSync(join(process.cwd(), 'supabase/tests/elembo_partners.sql'), 'utf8');

const tables = [...SQL.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
const fonctions = [...SQL.matchAll(/create or replace function public\.([a-z_]+)\(([^)]*)\)/g)].map((m) => m[1]);

describe('migration Elembo Partners', () => {
  it('crée les tables prévues', () => {
    expect(tables.sort()).toEqual(
      [
        'historique_statuts_partenaire',
        'partenaire_capacite_machines',
        'partenaire_capacites',
        'partenaire_disponibilites',
        'partenaire_fichiers',
        'partenaire_invitations',
        'partenaire_machines',
        'partenaire_services',
        'partenaire_tarif_paliers',
        'partenaire_tarifs',
        'partenaire_utilisateurs',
      ].sort(),
    );
  });

  it('active la RLS et pose une politique de lecture sur chaque nouvelle table', () => {
    for (const t of tables) {
      expect(SQL, t).toContain(`alter table public.${t} enable row level security;`);
      expect(SQL, t).toMatch(new RegExp(`create policy ${t}_select on public\\.${t}`));
    }
  });

  it('n’accorde aucune écriture au navigateur (anon, authenticated)', () => {
    expect(SQL).not.toMatch(/grant (insert|update|delete|all)[^;]*to[^;]*\b(anon|authenticated)\b/i);
    expect(SQL).not.toMatch(/for (insert|update|delete|all) to (anon|authenticated)/i);
  });

  it('ne donne aucune politique partenaire directe sur `partenaires` (fiche via mon_partenaire)', () => {
    expect(SQL).not.toMatch(/create policy [a-z_]+ on public\.partenaires\b/);
    // Colonnes internes jamais renvoyées au partenaire.
    const corps = SQL.slice(SQL.indexOf('function public.mon_partenaire()'), SQL.indexOf('$$;', SQL.indexOf('function public.mon_partenaire()')));
    for (const interne of ['p.notes', 'p.tarifs', 'p.valide_par', 'p.origine', 'p.types_impression']) {
      expect(corps, interne).not.toContain(interne);
    }
  });

  it('la session partenaire exige e-mail confirmé, association active, entreprise ouverte, et aucun rôle staff', () => {
    const corps = SQL.slice(SQL.indexOf('function public.partenaire_session()'), SQL.indexOf('$$;', SQL.indexOf('function public.partenaire_session()')));
    expect(corps).toContain('pu.user_id = auth.uid()');
    expect(corps).toContain('pu.actif');
    expect(corps).toContain("p.statut not in ('SUSPENDU', 'ARCHIVE')");
    expect(corps).toContain('u.email_confirmed_at is not null');
    expect(corps).toContain("public.jwt_role() = ''");
  });

  it('toute fonction security definer fixe son search_path', () => {
    for (const bloc of SQL.split(/create or replace function /).slice(1)) {
      const entete = bloc.slice(0, bloc.indexOf('$$'));
      if (/security definer/.test(entete)) expect(entete, bloc.slice(0, 60)).toMatch(/set search_path = /);
    }
  });

  it('les fonctions de service ne sont exécutables que par service_role', () => {
    const service = [
      'creer_partenaire_inscription',
      'accepter_invitation_partenaire',
      'soumettre_partenaire',
      'decider_partenaire',
      'proposer_tarif_partenaire',
      'valider_tarif_partenaire',
    ];
    for (const f of service) {
      expect(fonctions, f).toContain(f);
      expect(SQL, f).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, f).not.toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to [^;]*authenticated`));
    }
  });

  it('un tarif ne naît jamais validé et une version validée est unique et figée', () => {
    expect(SQL).toContain("raise exception 'Un tarif est toujours créé au statut PROPOSE'");
    expect(SQL).toMatch(/create unique index if not exists partenaire_tarifs_un_valide\s+on public\.partenaire_tarifs \(lignee_id\) where statut = 'VALIDE'/);
    expect(SQL).toContain('est figé : proposez une nouvelle version');
  });

  it('les historiques ne sont jamais réécrits', () => {
    expect(SQL).toContain('grant select, insert on public.historique_statuts_partenaire, public.partenaire_disponibilites to service_role;');
    expect(SQL).not.toMatch(/grant all on [^;]*(historique_statuts_partenaire|partenaire_disponibilites)/);
  });

  it('le retour arrière supprime chaque table et chaque fonction créées', () => {
    for (const t of tables) expect(ROLLBACK, t).toContain(`drop table if exists public.${t};`);
    for (const f of new Set(fonctions)) expect(ROLLBACK, f).toMatch(new RegExp(`drop function if exists public\\.${f}\\(`));
    expect(ROLLBACK).toContain("where version = '20261116120000'");
  });

  it('le script de vérification SQL couvre le cloisonnement A/B et la suspension', () => {
    expect(TEST_SQL).toContain('RLS b1 : données de A visibles');
    expect(TEST_SQL).toContain('RLS a2 : un opérateur voit les tarifs');
    expect(TEST_SQL).toContain('un partenaire suspendu lit encore ses données');
    expect(TEST_SQL.trim().endsWith('rollback;')).toBe(true);
  });
});

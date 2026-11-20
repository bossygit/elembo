/**
 * Lot 2.5 — purge des brouillons abandonnés.
 * Critères stricts, suppression des objets avant archivage, pas de suppression de la fiche ni
 * du compte Auth, audit et branchement dans le cron existant.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ENTRETIEN = lire('src/server/partenaires/entretien.ts');
const CRON = lire('src/app/api/cron/notifications/route.ts');
const SQL = lire('supabase/migrations/20261119120000_affectations.sql');

describe('purge des brouillons partenaires', () => {
  it('repose sur les fonctions SQL avec les critères de 90 jours', () => {
    expect(ENTRETIEN).toMatch(/rpc\('brouillons_abandonnes', \{ p_jours: jours \}\)/);
    expect(ENTRETIEN).toMatch(/rpc\('archiver_brouillon'/);
    expect(ENTRETIEN).toContain("const MOTIF = 'Dossier abandonné depuis plus de 90 jours");
    const corps = SQL.slice(SQL.indexOf('function public.brouillons_abandonnes'), SQL.indexOf('$$;', SQL.indexOf('function public.brouillons_abandonnes')));
    expect(corps).toContain("p.statut = 'BROUILLON'");
    expect(corps).toContain("p.origine = 'INSCRIPTION'");
    expect(corps).toContain('p.soumis_le is null');
    expect(corps).toContain('make_interval');
  });

  it('supprime les objets du bucket avant d’archiver et trace l’opération', () => {
    const suppression = ENTRETIEN.indexOf('supprimerObjets(chemins)');
    const archivage = ENTRETIEN.indexOf("rpc('archiver_brouillon'");
    expect(suppression).toBeGreaterThan(0);
    expect(archivage).toBeGreaterThan(suppression);
    expect(ENTRETIEN).toContain('BUCKET_PARTENAIRES');
    expect(ENTRETIEN).toMatch(/\.remove\(lot\)/);
    expect(ENTRETIEN).toContain("action: 'PARTENAIRE_BROUILLON_PURGE'");
  });

  it('ne supprime ni la fiche partenaire ni le compte Auth', () => {
    expect(ENTRETIEN).not.toMatch(/delete from public\.partenaires/i);
    expect(ENTRETIEN).not.toMatch(/auth\.admin\.deleteUser/);
    expect(ENTRETIEN).not.toMatch(/from\('partenaires'\)\s*\.delete/);
  });

  it('est branchée dans le cron existant, sans troisième cron Vercel', () => {
    expect(CRON).toMatch(/purgerBrouillonsAbandonnes\(\)/);
    const vercel = JSON.parse(lire('vercel.json')) as { crons: { path: string }[] };
    expect(vercel.crons).toHaveLength(2);
    expect(vercel.crons.map((c) => c.path)).toContain('/api/cron/notifications');
  });
});

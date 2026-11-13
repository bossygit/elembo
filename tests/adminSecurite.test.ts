/**
 * Garanties structurelles du back-office, vérifiées sur le code source.
 *
 * Dans l'App Router, un layout ne protège ni les pages ni les actions serveur qu'il entoure :
 * chaque point d'entrée doit vérifier lui-même la permission. Ces tests échouent dès qu'une
 * page, une action ou une route de /admin est ajoutée sans contrôle d'accès.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = process.cwd();
const ADMIN = join(RACINE, 'src/app/admin');
const PROTEGE = join(ADMIN, '(protected)');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const tous = fichiers(ADMIN).filter((f) => /\.(ts|tsx)$/.test(f));

describe('back-office — contrôle d’accès à chaque point d’entrée', () => {
  it('toutes les pages hors connexion sont dans le groupe protégé', () => {
    const pages = tous.filter((f) => /(page|route)\.tsx?$/.test(f));
    for (const page of pages) {
      const rel = relative(ADMIN, page);
      if (rel.startsWith('connexion/')) continue;
      expect(page.startsWith(PROTEGE), rel).toBe(true);
    }
  });

  it('chaque page protégée appelle exigerAcces avant toute donnée', () => {
    for (const page of tous.filter((f) => f.startsWith(PROTEGE) && f.endsWith('page.tsx'))) {
      const contenu = readFileSync(page, 'utf8');
      expect(contenu, relative(RACINE, page)).toMatch(/await exigerAcces\('[a-z_.]+'\)/);
    }
  });

  it('chaque route HTTP protégée appelle verifierAccesRoute', () => {
    for (const route of tous.filter((f) => f.startsWith(PROTEGE) && f.endsWith('route.ts'))) {
      const contenu = readFileSync(route, 'utf8');
      expect(contenu, relative(RACINE, route)).toMatch(/await verifierAccesRoute\('[a-z_.]+'\)/);
    }
  });

  it('chaque action serveur exportée vérifie la permission en première instruction', () => {
    const actions = tous.filter((f) => f.startsWith(PROTEGE) && f.endsWith('actions.ts'));
    expect(actions.length).toBeGreaterThan(0);
    for (const fichier of actions) {
      const contenu = readFileSync(fichier, 'utf8');
      expect(contenu.trimStart().startsWith("'use server'"), relative(RACINE, fichier)).toBe(true);
      const exportees = [...contenu.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
      expect(exportees.length, relative(RACINE, fichier)).toBeGreaterThan(0);
      for (const [, nom, premiere] of exportees) {
        expect(premiere, `${relative(RACINE, fichier)} → ${nom}`).toMatch(/await exigerAcces\('[a-z_.]+'\)/);
      }
      // Rien d'autre qu'une fonction async n'est exporté (chaque export devient appelable).
      expect(contenu, relative(RACINE, fichier)).not.toMatch(/export (const|let|function [^(]*\()(?!.*async)/);
    }
  });

  it('les pages n’ouvrent pas directement le client service_role', () => {
    for (const f of tous) {
      expect(readFileSync(f, 'utf8'), relative(RACINE, f)).not.toMatch(/supabaseAdmin\(/);
    }
  });

  it('aucun composant client du back-office ne touche au serveur', () => {
    const composants = fichiers(join(RACINE, 'src/components/admin'));
    for (const f of composants) {
      const contenu = readFileSync(f, 'utf8');
      if (!/['"]use client['"]/.test(contenu)) continue;
      expect(contenu, relative(RACINE, f)).not.toMatch(/@\/server\//);
    }
  });

  it('les permissions citées existent dans la matrice', async () => {
    const { MATRICE } = await import('../src/lib/admin/permissions');
    for (const f of tous) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:exigerAcces|verifierAccesRoute)\('([a-z_.]+)'\)/g)) {
        expect(Object.keys(MATRICE), `${relative(RACINE, f)} : ${m[1]}`).toContain(m[1]);
      }
    }
  });
});

describe('back-office — séparation du site public et proxy', () => {
  it('le layout racine ne charge plus l’habillage public', () => {
    const racine = readFileSync(join(RACINE, 'src/app/layout.tsx'), 'utf8');
    expect(racine).not.toMatch(/components\/site\/Header|WhatsAppFlottant|BarreMobile/);
    const site = readFileSync(join(RACINE, 'src/app/(site)/layout.tsx'), 'utf8');
    expect(site).toMatch(/<Header \/>/);
  });

  it('le proxy couvre tout /admin, ne fait pas confiance à user_metadata et interdit l’indexation', () => {
    const proxy = readFileSync(join(RACINE, 'src/proxy.ts'), 'utf8');
    expect(proxy).toMatch(/matcher: \['\/admin\/:path\*'\]/);
    expect(proxy).toMatch(/auth\.getUser\(\)/);
    expect(proxy).not.toMatch(/user_metadata/);
    expect(proxy).toMatch(/X-Robots-Tag/);
    expect(proxy).toMatch(/no-store/);
  });

  it('l’accès serveur revalide la session auprès de Supabase Auth (pas un simple décodage)', () => {
    const session = readFileSync(join(RACINE, 'src/server/auth/session.ts'), 'utf8');
    expect(session).toMatch(/auth\.getUser\(\)/);
    expect(session).not.toMatch(/getSession\(\)/);
  });
});

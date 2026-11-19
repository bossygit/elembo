/**
 * Lot 2.3 — garde-fous du portail travaux.
 *
 * Vérifie que les pages passent par la couche d'accès, que les montants restent conditionnés au
 * droit `travaux.montant` et que les écritures passent par les fonctions SQL (aucune lecture ou
 * écriture directe de la table).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const LISTE = lire('src/app/partenaire/travaux/page.tsx');
const DETAIL = lire('src/app/partenaire/travaux/[id]/page.tsx');
const ACTIONS = lire('src/app/partenaire/travaux/actions.ts');
const SERVICE = lire('src/server/partenaires/travaux.ts');
const NAV = lire('src/app/partenaire/layout.tsx');

describe('portail travaux', () => {
  it('les pages protégées exigent le droit de voir les travaux', () => {
    expect(LISTE).toMatch(/await exigerPartenaire\('travaux\.voir'\)/);
    expect(DETAIL).toMatch(/await exigerPartenaire\('travaux\.voir'\)/);
    expect(NAV).toMatch(/href: '\/partenaire\/travaux'[^]*?droit: 'travaux\.voir'/);
  });

  it('le montant n’est affiché qu’avec le droit travaux.montant', () => {
    expect(LISTE).toMatch(/peutPartenaire\(session\.role, 'travaux\.montant'/);
    expect(DETAIL).toMatch(/peutPartenaire\(session\.role, 'travaux\.montant'/);
  });

  it('accepter/refuser exigent travaux.decider, terminer exige travaux.executer', () => {
    expect(ACTIONS).toMatch(/exigerPartenaire\('travaux\.decider'\)[^]*?repondreAffectation\(session, id, 'ACCEPTEE'/);
    expect(ACTIONS).toMatch(/exigerPartenaire\('travaux\.decider'\)[^]*?repondreAffectation\(session, id, 'REFUSEE'/);
    expect(ACTIONS).toMatch(/exigerPartenaire\('travaux\.executer'\)[^]*?terminerAffectation\(session, id\)/);
    expect(ACTIONS).not.toMatch(/partenaire_id/);
  });

  it('aucune page ni action ne lit la table en direct', () => {
    for (const fichier of [LISTE, DETAIL, ACTIONS, SERVICE]) {
      expect(fichier).not.toMatch(/from\('affectations_production'\)/);
      expect(fichier).not.toMatch(/from\('affectations_evenements'\)/);
    }
    expect(SERVICE).toMatch(/rpc\('mes_affectations'\)/);
    expect(SERVICE).toMatch(/rpc\('mon_affectation'/);
    expect(SERVICE).toMatch(/rpc\('decider_affectation'/);
    expect(SERVICE).toMatch(/rpc\('terminer_affectation'/);
  });

  it('une proposition sans droit de décision est expliquée, sans bouton', () => {
    expect(DETAIL).toContain('Seul le responsable de l’atelier peut accepter ou refuser');
  });
});

/**
 * Fichiers du dossier partenaire — chemins, droits, quotas, et garanties des actions d'envoi.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FICHIER_TAILLE_MAX, FICHIER_TYPES_MIME, TYPES_FICHIER } from '../src/lib/partenaires/catalogue';
import { peutPartenaire } from '../src/lib/partenaires/droits';
import {
  MIMES_PAR_TYPE,
  QUOTAS,
  TYPES_MIME_FICHIER,
  cheminAutorise,
  cheminFichier,
  droitPourType,
  nomAffichable,
} from '../src/lib/partenaires/fichiers';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

describe('chemins des fichiers', () => {
  it('le chemin fabriqué est accepté pour son entreprise et son type, et seulement eux', () => {
    const chemin = cheminFichier(A, 'MACHINE', ID, 'image/jpeg');
    expect(chemin).toBe(`${A}/MACHINE/${ID}.jpg`);
    expect(cheminAutorise(chemin, A, 'MACHINE')).toBe(true);
    expect(cheminAutorise(chemin, B, 'MACHINE')).toBe(false);
    expect(cheminAutorise(chemin, A, 'LOGO')).toBe(false);
  });

  it('refuse tout chemin bricolé', () => {
    for (const c of [
      `${A}/MACHINE/../${B}/MACHINE/${ID}.jpg`,
      `${A}/MACHINE/${ID}.svg`,
      `${A}/MACHINE/${ID}.jpg.html`,
      `/${A}/MACHINE/${ID}.jpg`,
      `${A}/MACHINE/pas-un-uuid.jpg`,
      `${A}//MACHINE/${ID}.jpg`,
      42,
    ]) {
      expect(cheminAutorise(c, A, 'MACHINE'), String(c)).toBe(false);
    }
    expect(cheminAutorise(`${A}/MACHINE/${ID}.jpg`, 'pas-un-uuid', 'MACHINE')).toBe(false);
  });

  it('nom d’origine nettoyé (chemin et caractères de contrôle retirés)', () => {
    expect(nomAffichable('C:\\photos\\atelier\u0000.jpg')).toBe('atelier.jpg');
    expect(nomAffichable('../../etc/passwd')).toBe('passwd');
    expect(nomAffichable(12)).toBeNull();
  });
});

describe('règles d’envoi', () => {
  it('types MIME identiques au bucket et à la table ; pas de SVG ni de HTML', () => {
    expect(Object.keys(TYPES_MIME_FICHIER).sort()).toEqual([...FICHIER_TYPES_MIME].sort());
    for (const t of TYPES_FICHIER) {
      for (const m of MIMES_PAR_TYPE[t.id]) expect(FICHIER_TYPES_MIME, `${t.id} ${m}`).toContain(m);
    }
    expect(FICHIER_TAILLE_MAX).toBe(10 * 1024 * 1024);
  });

  it('seuls les documents acceptent le PDF ; un logo unique', () => {
    for (const t of TYPES_FICHIER) {
      expect(MIMES_PAR_TYPE[t.id].includes('application/pdf'), t.id).toBe(t.id === 'DOCUMENT');
    }
    expect(QUOTAS.LOGO).toBe(1);
  });

  it('un opérateur envoie des photos de machines, pas de logo ni de document ; le rôle lecture rien', () => {
    expect(peutPartenaire('PRODUCTION', droitPourType('MACHINE'), 'VALIDE')).toBe(true);
    for (const t of ['LOGO', 'ATELIER', 'PORTFOLIO', 'DOCUMENT'] as const) {
      expect(peutPartenaire('PRODUCTION', droitPourType(t), 'VALIDE'), t).toBe(false);
      expect(peutPartenaire('RESPONSABLE', droitPourType(t), 'VALIDE'), t).toBe(true);
    }
    for (const t of TYPES_FICHIER) expect(peutPartenaire('LECTURE', droitPourType(t.id), 'VALIDE'), t.id).toBe(false);
  });
});

describe('actions et serveur des fichiers', () => {
  const actions = readFileSync(join(process.cwd(), 'src/app/partenaire/fichiers-actions.ts'), 'utf8');
  const serveur = readFileSync(join(process.cwd(), 'src/server/partenaires/fichiers.ts'), 'utf8');

  it('chaque action exige la session et le droit d’envoi en première instruction, puis le droit du type', () => {
    expect(actions.trimStart().startsWith("'use server'")).toBe(true);
    const exportees = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
    expect(exportees.map((e) => e[1]).sort()).toEqual(['confirmerFichier', 'preparerEnvoiFichier', 'retirerFichierAction']);
    for (const [, nom, premiere] of exportees) expect(premiere, nom).toMatch(/await exigerPartenaire\('fichiers\.envoyer'\)/);
    expect(actions.match(/autorise\(session, /g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('le serveur fabrique le chemin, revérifie les octets et supprime un fichier non conforme', () => {
    expect(serveur).toMatch(/cheminFichier\(session\.partenaireId/);
    expect(serveur).toMatch(/cheminAutorise\(c\.chemin, session\.partenaireId/);
    expect(serveur).toMatch(/verifierFichier\(/);
    expect(serveur).toMatch(/if \(!verdict\.ok\) \{\n\s+await bucket\(\)\.remove\(\[c\.chemin\]\)/);
    // Toute ligne lue ou supprimée par identifiant l'est dans l'entreprise de la session.
    for (const bloc of serveur.split(".from('partenaire_fichiers')").slice(1)) {
      const requete = bloc.slice(0, bloc.indexOf(';'));
      if (/\.eq\('id', id\)/.test(requete)) expect(requete).toMatch(/\.eq\('partenaire_id', session\.partenaireId\)/);
    }
  });
});

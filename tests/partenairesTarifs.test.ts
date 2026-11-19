/**
 * Tarifs négociés (sous-lot 1.4) — formulaire, versions, affichage et garanties structurelles.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { peutPartenaire } from '../src/lib/partenaires/droits';
import { LIGNES_PALIERS, fcfaChamp, lireTarif } from '../src/lib/partenaires/formulaires';
import { regrouperTarifs, resumePaliers, resumeVersion, type VersionTarif } from '../src/lib/partenaires/paliers';

function f(champs: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
}

/** Formulaire avec toutes les lignes de paliers, comme le navigateur les envoie. */
function avecPaliers(base: Record<string, string>, lignes: [string, string, string][]): FormData {
  const fd = f(base);
  for (let i = 0; i < LIGNES_PALIERS; i++) {
    const [min, max, prix] = lignes[i] ?? ['', '', ''];
    fd.append('palier_min', min);
    fd.append('palier_max', max);
    fd.append('palier_prix', prix);
  }
  return fd;
}

const base = { nom: 'Impression bâche au m²', mode_calcul: 'AU_M2', nature: 'PRESTATION' };

describe('montants en FCFA', () => {
  it('accepte les écritures usuelles, refuse les décimales et le texte', () => {
    expect(fcfaChamp('2 500')).toBe(2500);
    expect(fcfaChamp('2.500')).toBe(2500);
    expect(fcfaChamp('2 500 FCFA')).toBe(2500);
    expect(fcfaChamp('')).toBeNull();
    expect(fcfaChamp('2500,50')).toBeNaN();
    expect(fcfaChamp('-100')).toBeNaN();
    expect(fcfaChamp('1234567890')).toBeNaN();
  });
});

describe('formulaire de tarif', () => {
  it('prix seul, lignes de paliers vides ignorées', () => {
    const r = lireTarif(avecPaliers({ ...base, prix_fcfa: '2 500' }, []));
    expect(r).toMatchObject({ ok: true, valeur: { champs: { prix_fcfa: 2500, nature: 'PRESTATION' }, paliers: [] } });
  });

  it('grille du cahier des charges (§8.4), dernier palier ouvert et sur négociation', () => {
    const r = lireTarif(
      avecPaliers(base, [
        ['1', '5', '2 500'],
        ['6', '20', '2 200'],
        ['21', '50', '2 000'],
        ['51', '', ''],
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.champs.prix_fcfa).toBeNull();
    expect(r.valeur.paliers).toEqual([
      { quantiteMin: 1, quantiteMax: 5, prixUnitaireFcfa: 2500 },
      { quantiteMin: 6, quantiteMax: 20, prixUnitaireFcfa: 2200 },
      { quantiteMin: 21, quantiteMax: 50, prixUnitaireFcfa: 2000 },
      { quantiteMin: 51, quantiteMax: null, prixUnitaireFcfa: null },
    ]);
  });

  it('refuse un trou, une ligne incomplète, un tarif sans prix ni palier', () => {
    expect(lireTarif(avecPaliers(base, [['1', '5', '100'], ['7', '', '90']]))).toMatchObject({ ok: false, erreur: expect.stringMatching(/sans trou/) });
    expect(lireTarif(avecPaliers(base, [['', '5', '100']]))).toMatchObject({ ok: false, erreur: expect.stringMatching(/Palier 1/) });
    expect(lireTarif(avecPaliers(base, []))).toMatchObject({ ok: false, erreur: expect.stringMatching(/prix ou au moins un palier/) });
    expect(lireTarif(avecPaliers({ ...base, mode_calcul: 'AU_KILO' }, [['1', '', '10']])).ok).toBe(false);
  });

  it('n’écrit que les colonnes autorisées (jamais statut, origine, validation, entreprise)', () => {
    const r = lireTarif(avecPaliers({ ...base, prix_fcfa: '100', statut: 'VALIDE', origine: 'SMART_VISION', partenaire_id: 'x', valide_du: '2026-01-01' }, []));
    expect(r.ok && Object.keys(r.valeur.champs).sort()).toEqual(['capacite_id', 'conditions', 'mode_calcul', 'nature', 'nom', 'prix_fcfa', 'service_id']);
  });
});

describe('versions et affichage', () => {
  const v = (version: number, statut: string, cree: string, prix: number | null = 2500): VersionTarif => ({
    id: `t${version}`,
    lignee_id: 'L',
    version,
    nom: `Bâche v${version}`,
    mode_calcul: 'AU_M2',
    nature: 'PRESTATION',
    prix_fcfa: prix,
    conditions: null,
    capacite_id: null,
    service_id: null,
    statut,
    origine: 'PARTENAIRE',
    valide_du: null,
    valide_jusquau: null,
    valide_le: null,
    motif_decision: null,
    cree_le: cree,
    paliers: [],
  });

  it('regroupe par lignée : version en vigueur, proposition en cours, historique décroissant', () => {
    const [l] = regrouperTarifs([v(1, 'REMPLACE', '2026-01-01'), v(3, 'PROPOSE', '2026-03-01'), v(2, 'VALIDE', '2026-02-01')]);
    expect(l.enVigueur?.version).toBe(2);
    expect(l.enCours?.version).toBe(3);
    expect(l.historique.map((x) => x.version)).toEqual([3, 2, 1]);
    expect(l.nom).toBe('Bâche v3');
  });

  it('résumés lisibles', () => {
    expect(resumeVersion(v(1, 'VALIDE', '2026-01-01'))).toBe('2 500 FCFA / m²');
    expect(resumePaliers([{ quantiteMin: 51, quantiteMax: null, prixUnitaireFcfa: null }, { quantiteMin: 1, quantiteMax: 50, prixUnitaireFcfa: 2000 }])).toBe(
      '1 à 50 : 2 000 FCFA · 51 et plus : sur négociation',
    );
  });
});

/* ------------------------------------------------- garanties structurelles -- */

const lire = (chemin: string) => readFileSync(join(process.cwd(), chemin), 'utf8');

describe('confidentialité et décisions', () => {
  it('seul le responsable voit et propose des tarifs', () => {
    for (const r of ['PRODUCTION', 'LECTURE'] as const) {
      expect(peutPartenaire(r, 'tarifs.voir', 'VALIDE')).toBe(false);
      expect(peutPartenaire(r, 'tarifs.proposer', 'VALIDE')).toBe(false);
    }
    expect(peutPartenaire('RESPONSABLE', 'tarifs.proposer', 'BROUILLON')).toBe(true);
  });

  it('chaque action exige un droit tarif en première instruction ; chaque page exige tarifs.voir ou tarifs.proposer', () => {
    const actions = lire('src/app/partenaire/tarifs-actions.ts');
    const exportees = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
    expect(exportees.length).toBe(2);
    for (const [, nom, premiere] of exportees) expect(premiere, nom).toMatch(/await exigerPartenaire\('tarifs\.proposer'\)/);
    for (const page of ['src/app/partenaire/tarifs/page.tsx', 'src/app/partenaire/tarifs/[lignee]/page.tsx', 'src/app/partenaire/tarifs/nouveau/page.tsx']) {
      expect(lire(page), page).toMatch(/await exigerPartenaire\('tarifs\.(voir|proposer)'\)/);
    }
  });

  it('les montants ne partent jamais dans une notification', () => {
    const serveur = lire('src/server/partenaires/tarifs.ts');
    const corps = serveur.slice(serveur.indexOf(".from('notifications')"), serveur.indexOf('if (e2)'));
    expect(corps).not.toMatch(/prix|paliers|fcfa/i);
  });

  it('le partenaire propose toujours en origine PARTENAIRE, Smart Vision en SMART_VISION', () => {
    expect(lire('src/server/partenaires/tarifs.ts')).toMatch(/p_origine: 'PARTENAIRE'/);
    expect(lire('src/server/partenaires/tarifs.ts')).not.toMatch(/SMART_VISION'/);
    expect(lire('src/server/admin/tarifsPartenaires.ts')).toMatch(/p_origine: 'SMART_VISION'/);
  });

  it('refus et demande de modification exigent un motif ; un retrait ne touche que la proposition de l’entreprise', () => {
    const admin = lire('src/server/admin/tarifsPartenaires.ts');
    expect(admin).toMatch(/if \(!texte\) throw new ErreurMetier\('Un motif est obligatoire/);
    const partenaire = lire('src/server/partenaires/tarifs.ts');
    const retrait = partenaire.slice(partenaire.indexOf('export async function retirerProposition'));
    expect(retrait).toMatch(/\.eq\('partenaire_id', session\.partenaireId\)/);
    expect(retrait).toMatch(/\.in\('statut', \['PROPOSE', 'MODIFICATION_DEMANDEE'\]\)/);
  });
});

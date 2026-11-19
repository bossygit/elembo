/**
 * Lot 2 — domaine des affectations.
 *
 * Vérifie l'alignement avec la migration 0013 (statuts, transitions), le calcul du montant à
 * partir d'un tarif validé et les permissions staff. La base reste l'arbitre ; ces tests
 * garantissent que l'écran et les actions appliquent la même règle avant l'envoi.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MATRICE, peut } from '../src/lib/admin/permissions';
import {
  STATUTS_AFFECTATION,
  TRANSITIONS_AFFECTATION,
  affectationActive,
  calculerMontant,
  dateLimiteValide,
  libelleSourceTarif,
  statutAffectation,
  tarifEnVigueur,
  tarifsAffectables,
  transitionAffectationPermise,
  type StatutAffectation,
} from '../src/lib/partenaires/affectations';
import type { Palier, VersionTarif } from '../src/lib/partenaires/paliers';

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261119120000_affectations.sql'), 'utf8');

function transitionsSql(): Record<string, string[]> {
  const debut = SQL.indexOf('function public.transition_affectation_autorisee');
  const corps = SQL.slice(debut, SQL.indexOf('$$;', debut));
  const res: Record<string, string[]> = {};
  for (const m of corps.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)) (res[m[1]] ??= []).push(m[2]);
  for (const k of Object.keys(res)) res[k].sort();
  return res;
}

const p = (quantiteMin: number, quantiteMax: number | null, prixUnitaireFcfa: number | null): Palier => ({
  quantiteMin,
  quantiteMax,
  prixUnitaireFcfa,
});

function version(overrides: Partial<VersionTarif> = {}): VersionTarif {
  return {
    id: 't1',
    lignee_id: 'l1',
    version: 1,
    nom: 'Impression au m²',
    mode_calcul: 'AU_M2',
    nature: 'PRESTATION',
    prix_fcfa: 2000,
    conditions: null,
    capacite_id: null,
    service_id: null,
    statut: 'VALIDE',
    origine: 'SMART_VISION',
    valide_du: '2026-01-01',
    valide_jusquau: null,
    valide_le: '2026-01-01T00:00:00Z',
    motif_decision: null,
    cree_le: '2026-01-01T00:00:00Z',
    paliers: [],
    ...overrides,
  };
}

describe('cycle d’une affectation', () => {
  it('reflète exactement transition_affectation_autorisee (migration 0013)', () => {
    const sql = transitionsSql();
    for (const s of STATUTS_AFFECTATION) {
      expect([...TRANSITIONS_AFFECTATION[s.id]].sort(), s.id).toEqual(sql[s.id] ?? []);
    }
  });

  it('les statuts correspondent à la contrainte check de la table', () => {
    const m = SQL.match(/statut text not null default 'PROPOSEE'\s+check \(statut in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    expect(STATUTS_AFFECTATION.map((s) => s.id).sort()).toEqual([...m![1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort());
  });

  it('une seule affectation active à la fois (PROPOSEE ou ACCEPTEE)', () => {
    for (const s of STATUTS_AFFECTATION) {
      expect(affectationActive(s.id), s.id).toBe(s.id === 'PROPOSEE' || s.id === 'ACCEPTEE');
    }
  });

  it('le responsable de l’atelier ne peut pas annuler, le staff si', () => {
    expect(transitionAffectationPermise('PROPOSEE', 'ACCEPTEE')).toBe(true);
    expect(transitionAffectationPermise('PROPOSEE', 'REFUSEE')).toBe(true);
    expect(transitionAffectationPermise('ACCEPTEE', 'TERMINEE')).toBe(true);
    expect(transitionAffectationPermise('ACCEPTEE', 'PROPOSEE')).toBe(false);
    expect(transitionAffectationPermise('REFUSEE', 'ACCEPTEE')).toBe(false);
    expect(transitionAffectationPermise('ANNULEE', 'ACCEPTEE')).toBe(false);
  });

  it('libellés et tons disponibles pour chaque statut', () => {
    for (const s of STATUTS_AFFECTATION) {
      expect(statutAffectation(s.id as StatutAffectation).label.length).toBeGreaterThan(2);
      expect(s.ton.length).toBeGreaterThan(2);
    }
  });
});

describe('calcul du montant d’une affectation', () => {
  it('applique le prix de base à la quantité de base', () => {
    expect(calculerMontant({ prixFcfa: 2000, paliers: [] }, 6)).toEqual({
      type: 'MONTANT',
      montantFcfa: 12000,
      prixUnitaireFcfa: 2000,
      quantitePalier: 6,
    });
  });

  it('applique le palier à la quantité entière supérieure, montant sur la quantité réelle', () => {
    const paliers = [p(1, 5, 2500), p(6, 20, 2200)];
    expect(calculerMontant({ prixFcfa: null, paliers }, 6.5)).toEqual({
      type: 'MONTANT',
      montantFcfa: 14300,
      prixUnitaireFcfa: 2200,
      quantitePalier: 7,
    });
  });

  it('arrondit le montant à la centaine supérieure', () => {
    expect(calculerMontant({ prixFcfa: 1, paliers: [] }, 1)).toEqual({
      type: 'MONTANT',
      montantFcfa: 100,
      prixUnitaireFcfa: 1,
      quantitePalier: 1,
    });
  });

  it('refuse une quantité nulle, une négociation et un minimum non atteint', () => {
    expect(calculerMontant({ prixFcfa: 2000, paliers: [] }, 0)).toMatchObject({ type: 'ERREUR' });
    expect(calculerMontant({ prixFcfa: null, paliers: [p(51, null, null)] }, 60)).toMatchObject({ type: 'ERREUR' });
    expect(calculerMontant({ prixFcfa: null, paliers: [p(10, null, 900)] }, 4)).toMatchObject({ type: 'ERREUR' });
  });
});

describe('tarifs affectables', () => {
  it('ne retient que la version validée en vigueur à la date du jour', () => {
    const lignees = [
      { enVigueur: version({ id: 'ok' }) },
      { enVigueur: version({ id: 'futur', valide_du: '2027-01-01' }) },
      { enVigueur: version({ id: 'expire', valide_jusquau: '2026-06-30' }) },
      { enVigueur: null },
    ];
    expect(tarifsAffectables(lignees, '2026-11-19').map((t) => t.id)).toEqual(['ok']);
  });

  it('expose les champs utiles au formulaire', () => {
    const [t] = tarifsAffectables([{ enVigueur: version({ capacite_id: 'c1' }) }], '2026-11-19');
    expect(t).toMatchObject({ id: 't1', ligneeId: 'l1', version: 1, modeCalcul: 'AU_M2', capaciteId: 'c1' });
  });

  it('compare les dates de validité', () => {
    expect(tarifEnVigueur({ valide_du: '2026-01-01', valide_jusquau: null }, '2026-11-19')).toBe(true);
    expect(tarifEnVigueur({ valide_du: '2026-01-01', valide_jusquau: '2026-11-18' }, '2026-11-19')).toBe(false);
    expect(tarifEnVigueur({ valide_du: '2026-11-20', valide_jusquau: null }, '2026-11-19')).toBe(false);
  });
});

describe('délai et libellés', () => {
  it('exige une date limite au moins une heure dans le futur', () => {
    const maintenant = new Date('2026-11-19T12:00:00Z');
    expect(dateLimiteValide(null, maintenant)).toBe(true);
    expect(dateLimiteValide('2026-11-19T12:30:00Z', maintenant)).toBe(false);
    expect(dateLimiteValide('2026-11-19T14:00:00Z', maintenant)).toBe(true);
    expect(dateLimiteValide('pas une date', maintenant)).toBe(false);
  });

  it('nomme chaque source de tarif', () => {
    expect(libelleSourceTarif('TARIF_VALIDE')).toBe('Tarif validé');
    expect(libelleSourceTarif('MANUEL')).toBe('Montant négocié');
    expect(libelleSourceTarif('SUR_DEVIS')).toBe('Prix provisoire');
  });
});

describe('permissions staff des affectations', () => {
  it('proposer et annuler est ouvert au commercial et à l’atelier, pas à la finance', () => {
    expect(MATRICE['affectations.gerer']).toEqual(['admin', 'commercial', 'atelier']);
    expect(MATRICE['affectations.annuler']).toEqual(['admin', 'commercial', 'atelier']);
    expect(peut('finance', 'affectations.gerer')).toBe(false);
    expect(peut('finance', 'affectations.annuler')).toBe(false);
  });

  it('les montants restent réservés à l’administration et à la finance', () => {
    expect(MATRICE['affectations.couts']).toEqual(['admin', 'finance']);
    expect(peut('atelier', 'affectations.couts')).toBe(false);
    expect(peut('commercial', 'affectations.couts')).toBe(false);
    expect(peut('admin', 'affectations.voir')).toBe(true);
    expect(peut('finance', 'affectations.voir')).toBe(true);
  });
});

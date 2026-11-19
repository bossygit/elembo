/**
 * Lot 2.2 — calcul et validation côté service avant l'appel SQL.
 * Le montant d'un tarif est toujours recalculé ici : un montant envoyé par le navigateur ne
 * l'emporte jamais.
 */

import { describe, expect, it } from 'vitest';

import { validerProposition, type PropositionAffectation } from '../src/server/admin/affectations';
import type { TarifAffectation } from '../src/lib/partenaires/affectations';

const uuid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;

const tarif: TarifAffectation = {
  id: uuid(9),
  ligneeId: uuid(8),
  version: 1,
  nom: 'Impression au m²',
  modeCalcul: 'AU_M2',
  nature: 'PRESTATION',
  prixFcfa: 2000,
  conditions: null,
  capaciteId: null,
  serviceId: null,
  paliers: [],
};

const base: PropositionAffectation = {
  objet: 'TACHE_PRODUCTION',
  commandeId: uuid(1),
  tacheId: uuid(2),
  partenaireId: uuid(3),
  tarifId: null,
  quantiteBase: null,
  montantFcfa: 5000,
  tarifSource: 'MANUEL',
  tarifMotif: 'Accord ponctuel',
  libelle: 'Impression banderole',
  priorite: 'NORMALE',
};

describe('validation d’une proposition d’affectation', () => {
  it('recalcule le montant d’un tarif et ignore le montant envoyé', () => {
    const v = validerProposition({ ...base, tarifId: tarif.id, tarifSource: 'TARIF_VALIDE', quantiteBase: 6, montantFcfa: 1 }, [tarif]);
    expect(v).toEqual({ montantFcfa: 12000, quantiteBase: 6, tarifId: tarif.id, tarifSource: 'TARIF_VALIDE' });
  });

  it('accepte un montant manuel motivé', () => {
    expect(validerProposition(base, [])).toMatchObject({ montantFcfa: 5000, tarifId: null, tarifSource: 'MANUEL' });
  });

  it('refuse un montant manuel sans motif', () => {
    expect(() => validerProposition({ ...base, tarifMotif: '  ' }, [])).toThrow(/motif/i);
  });

  it('refuse un prix provisoire nul', () => {
    expect(() => validerProposition({ ...base, tarifSource: 'SUR_DEVIS', montantFcfa: 0 }, [])).toThrow(/strictement positif/i);
  });

  it('refuse un tarif absent de la liste, une quantité manquante ou un objet incohérent', () => {
    expect(() => validerProposition({ ...base, tarifId: uuid(7), tarifSource: 'TARIF_VALIDE', quantiteBase: 6 }, [tarif])).toThrow(/tarif/i);
    expect(() => validerProposition({ ...base, tarifId: tarif.id, tarifSource: 'TARIF_VALIDE', quantiteBase: null }, [tarif])).toThrow(/quantité/i);
    expect(() => validerProposition({ ...base, tacheId: null, devisId: null }, [])).toThrow(/exactement/i);
    expect(() => validerProposition({ ...base, tacheId: null, devisId: uuid(5) }, [])).toThrow(/tâche/i);
  });

  it('refuse un libellé trop court et une échéance passée', () => {
    expect(() => validerProposition({ ...base, libelle: 'x' }, [])).toThrow(/libellé/i);
    const passe = new Date(Date.now() - 60_000).toISOString();
    expect(() => validerProposition({ ...base, dateLimiteReponse: passe }, [])).toThrow(/une heure/i);
  });
});

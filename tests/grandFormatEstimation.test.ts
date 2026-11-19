import { describe, expect, it } from 'vitest';

import { estimer, type ParametresEstimation, type TarifGrandFormat } from '../src/lib/grand-format/estimation';

const TARIF: TarifGrandFormat = {
  support: 'BANDEROLE',
  libelle: 'Banderole PVC',
  prixM2Fcfa: 5000,
  minimumPieceFcfa: 10000,
  supplementOeilletsMlFcfa: 200,
  supplementOurletsMlFcfa: 300,
  supplementFourreauxMlFcfa: null,
  fraisCreationFcfa: 15000,
  laizeMaxM: 3.2,
  statutPrix: 'VALIDE',
  actif: true,
};

const BASE: ParametresEstimation = {
  support: 'BANDEROLE',
  largeurM: 3,
  hauteurM: 1,
  quantite: 1,
  finition: 'SANS',
  delai: 'STANDARD',
  prestation: 'FICHIER_PRET',
};

const souple = { finitionsApplicables: true };

describe('estimation grand format — jamais de prix non validé', () => {
  it('refuse toute estimation sans tarif, ou avec un tarif TEST / PROVISOIRE / inactif', () => {
    expect(estimer(null, BASE, souple)).toMatchObject({ disponible: false, raison: 'TARIF_NON_VALIDE' });
    for (const statutPrix of ['TEST', 'PROVISOIRE'] as const) {
      expect(estimer({ ...TARIF, statutPrix }, BASE, souple)).toMatchObject({ disponible: false, raison: 'TARIF_NON_VALIDE' });
    }
    expect(estimer({ ...TARIF, actif: false }, BASE, souple)).toMatchObject({ disponible: false, raison: 'TARIF_NON_VALIDE' });
    expect(estimer({ ...TARIF, prixM2Fcfa: null }, BASE, souple)).toMatchObject({ disponible: false });
    expect(estimer({ ...TARIF, prixM2Fcfa: 0 }, BASE, souple)).toMatchObject({ disponible: false });
  });

  it('refuse un tarif d’un autre support', () => {
    expect(estimer({ ...TARIF, support: 'BACHE' }, BASE, souple)).toMatchObject({ disponible: false, raison: 'TARIF_NON_VALIDE' });
  });

  it('oriente vers le devis : accompagnement, urgence, support libre', () => {
    expect(estimer(TARIF, { ...BASE, prestation: 'ACCOMPAGNEMENT' }, souple)).toMatchObject({ raison: 'ACCOMPAGNEMENT' });
    expect(estimer(TARIF, { ...BASE, delai: 'EXPRESS' }, souple)).toMatchObject({ raison: 'EXPRESS' });
    expect(estimer(TARIF, { ...BASE, support: 'AUTRE' }, souple)).toMatchObject({ raison: 'SUPPORT_SUR_DEVIS' });
  });

  it('oriente vers le devis quand la finition ou la création n’ont pas de prix', () => {
    expect(estimer(TARIF, { ...BASE, finition: 'FOURREAUX' }, souple)).toMatchObject({ raison: 'FINITION_SUR_DEVIS' });
    expect(estimer(TARIF, { ...BASE, finition: 'AUTRE' }, souple)).toMatchObject({ raison: 'FINITION_SUR_DEVIS' });
    expect(estimer({ ...TARIF, supplementOurletsMlFcfa: null }, { ...BASE, finition: 'OURLETS_OEILLETS' }, souple)).toMatchObject({
      raison: 'FINITION_SUR_DEVIS',
    });
    expect(estimer({ ...TARIF, fraisCreationFcfa: null }, { ...BASE, prestation: 'CREATION' }, souple)).toMatchObject({
      raison: 'CREATION_SUR_DEVIS',
    });
  });

  it('refuse un format dont la plus petite dimension dépasse la laize', () => {
    expect(estimer(TARIF, { ...BASE, largeurM: 4, hauteurM: 3.5 }, souple)).toMatchObject({ raison: 'HORS_GABARIT' });
    // Une banderole très longue mais étroite tient dans la laize.
    expect(estimer(TARIF, { ...BASE, largeurM: 12, hauteurM: 1 }, souple).disponible).toBe(true);
  });
});

describe('estimation grand format — calcul', () => {
  it('surface × prix au m², arrondi à la centaine supérieure', () => {
    // 3 m² × 5 000 = 15 000
    expect(estimer(TARIF, BASE, souple)).toMatchObject({
      disponible: true,
      montantFcfa: 15000,
      prixPieceFcfa: 15000,
      impressionFcfa: 15000,
      creationFcfa: 0,
      surfacePieceM2: 3,
      minimumApplique: false,
    });
    // 1,15 × 0,85 = 0,9775 m² × 4 999 = 4 886,52… → 4 900 (plancher non atteint ici : minimum retiré)
    const r = estimer({ ...TARIF, prixM2Fcfa: 4999, minimumPieceFcfa: null }, { ...BASE, largeurM: 1.15, hauteurM: 0.85 }, souple);
    expect(r).toMatchObject({ disponible: true, prixPieceFcfa: 4900, surfacePieceM2: 0.9775 });
  });

  it('n’est pas piégé par l’arithmétique flottante', () => {
    // 1,1 × 3 = 3,3000000000000003 en flottant : on doit obtenir exactement 3,3 m² × 1 000 = 3 300.
    const r = estimer({ ...TARIF, prixM2Fcfa: 1000, minimumPieceFcfa: null }, { ...BASE, largeurM: 1.1, hauteurM: 3 }, souple);
    expect(r).toMatchObject({ disponible: true, prixPieceFcfa: 3300, surfacePieceM2: 3.3 });
  });

  it('ajoute la finition au mètre linéaire de périmètre', () => {
    // 3 × 1 m : périmètre 8 m. Œillets 200/ml → 1 600 ; ourlets 300/ml → 2 400 ; les deux → 4 000.
    expect(estimer(TARIF, { ...BASE, finition: 'OEILLETS' }, souple)).toMatchObject({ prixPieceFcfa: 16600 });
    expect(estimer(TARIF, { ...BASE, finition: 'OURLETS' }, souple)).toMatchObject({ prixPieceFcfa: 17400 });
    expect(estimer(TARIF, { ...BASE, finition: 'OURLETS_OEILLETS' }, souple)).toMatchObject({ prixPieceFcfa: 19000 });
  });

  it('ignore la finition sur un support rigide ou monté (roll-up, panneau…)', () => {
    const rollUp = { ...TARIF, support: 'ROLL_UP' as const, minimumPieceFcfa: null };
    const r = estimer(rollUp, { ...BASE, support: 'ROLL_UP', largeurM: 0.85, hauteurM: 2, finition: 'OEILLETS' }, { finitionsApplicables: false });
    expect(r).toMatchObject({ disponible: true, prixPieceFcfa: 8500 });
  });

  it('applique le minimum par pièce et le signale', () => {
    // 1 × 0,5 m = 0,5 m² × 5 000 = 2 500 < minimum 10 000
    const r = estimer(TARIF, { ...BASE, largeurM: 1, hauteurM: 0.5, quantite: 3 }, souple);
    expect(r).toMatchObject({ disponible: true, prixPieceFcfa: 10000, impressionFcfa: 30000, montantFcfa: 30000, minimumApplique: true });
  });

  it('multiplie par la quantité et ajoute la création une seule fois', () => {
    const r = estimer(TARIF, { ...BASE, quantite: 4, prestation: 'CREATION', finition: 'OEILLETS' }, souple);
    expect(r).toMatchObject({
      disponible: true,
      prixPieceFcfa: 16600,
      impressionFcfa: 66400,
      creationFcfa: 15000,
      montantFcfa: 81400,
      surfaceTotaleM2: 12,
    });
  });
});

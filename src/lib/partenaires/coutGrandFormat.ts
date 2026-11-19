/**
 * Coût d'impression grand format à partir des tarifs négociés VALIDÉS d'un imprimeur
 * (docs/elembo-partners.md §4.8). Pur, testé par `partenairesCoutGrandFormat.test.ts`.
 *
 * Règles :
 *  - seuls les tarifs « au m² » validés et en vigueur à la date du jour comptent ;
 *  - un tarif rattaché à une capacité du même support (BANDEROLE, BACHE…) l'emporte sur un tarif
 *    général (sans capacité) ; un tarif rattaché à une capacité d'un AUTRE support est ignoré ;
 *  - à défaut, l'ancien prix au m² de la fiche est proposé, signalé « non validé ».
 */

import { prixPourQuantite, type Palier } from './paliers';

export type TarifImpression = {
  id: string;
  nom: string;
  mode_calcul: string;
  prix_fcfa: number | null;
  conditions: string | null;
  /** Prestation de la capacité rattachée (null : tarif général). */
  prestation: string | null;
  valide_du: string | null;
  valide_jusquau: string | null;
  paliers: Palier[];
};

export function enVigueur(t: Pick<TarifImpression, 'valide_du' | 'valide_jusquau'>, aujourdhui: string): boolean {
  return (t.valide_du === null || t.valide_du <= aujourdhui) && (t.valide_jusquau === null || t.valide_jusquau >= aujourdhui);
}

export function tarifImpression(tarifs: readonly TarifImpression[], support: string, aujourdhui: string): TarifImpression | null {
  const utilisables = tarifs.filter((t) => t.mode_calcul === 'AU_M2' && enVigueur(t, aujourdhui));
  return utilisables.find((t) => t.prestation === support) ?? utilisables.find((t) => t.prestation === null) ?? null;
}

export type CoutImpression =
  | { type: 'MONTANT'; montantFcfa: number; prixUnitaireFcfa: number; source: 'TARIF_VALIDE' | 'ANCIEN_PRIX' }
  | { type: 'NEGOCIATION' }
  | { type: 'INDISPONIBLE' };

const arrondiCent = (n: number) => Math.ceil(n / 100) * 100;

/**
 * Coût pour une surface totale (m²). Les paliers s'appliquent à la surface arrondie au m²
 * supérieur ; le montant est arrondi à la centaine supérieure (comme le calcul existant).
 */
export function coutImpression(
  tarif: TarifImpression | null,
  surfaceM2: number,
  ancienPrixM2: number | null | undefined,
): CoutImpression {
  if (!(surfaceM2 > 0)) return { type: 'INDISPONIBLE' };
  if (tarif) {
    const prix = prixPourQuantite(tarif.prix_fcfa, tarif.paliers, Math.ceil(surfaceM2));
    if (prix.type === 'PRIX') {
      return { type: 'MONTANT', montantFcfa: arrondiCent(prix.prixUnitaireFcfa * surfaceM2), prixUnitaireFcfa: prix.prixUnitaireFcfa, source: 'TARIF_VALIDE' };
    }
    if (prix.type === 'NEGOCIATION') return { type: 'NEGOCIATION' };
  }
  if (typeof ancienPrixM2 === 'number' && ancienPrixM2 > 0) {
    return { type: 'MONTANT', montantFcfa: arrondiCent(ancienPrixM2 * surfaceM2), prixUnitaireFcfa: ancienPrixM2, source: 'ANCIEN_PRIX' };
  }
  return { type: 'INDISPONIBLE' };
}

/**
 * Supports et dimensions maximales d'un imprimeur, déduits de ses capacités grand format
 * VALIDÉES et actives. Sans capacité grand format, les valeurs saisies sur l'ancienne fiche restent.
 */
export function profilGrandFormat(
  capacites: readonly { prestation: string; largeur_max_mm: number | null; longueur_max_mm: number | null }[],
  supportsConnus: readonly string[],
  ancien: { types_impression: string[]; largeur_max_m: number | null; longueur_max_m: number | null },
): { types_impression: string[]; largeur_max_m: number | null; longueur_max_m: number | null } {
  if (!capacites.length) return ancien;
  const max = (valeurs: (number | null)[]) => {
    const v = valeurs.filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) / 1000 : null;
  };
  return {
    types_impression: [...new Set(capacites.map((c) => c.prestation).filter((p) => supportsConnus.includes(p)))],
    largeur_max_m: max(capacites.map((c) => c.largeur_max_mm)),
    longueur_max_m: max(capacites.map((c) => c.longueur_max_mm)),
  };
}

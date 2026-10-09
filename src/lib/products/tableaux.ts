// Tableaux (impression canvas) — formats, prix et contrôle de qualité.
//
// Ce module est la référence du BARÈME côté navigateur. Le service de paiement en tient une
// copie (`momo-service/src/catalogue.ts`) : `tests/coherenceCatalogues.test.ts` compare les
// deux et échoue à la moindre divergence, comme pour les T-shirts.
//
// ⚠️ BARÈME PROVISOIRE — À ARBITRER PAR L'EXPLOITANT.
// Les trois tarifs ci-dessous sont des valeurs de travail calculées sur une logique de coût
// (surface imprimée + montage + préparation), pas un prix de marché relevé au Congo. Ils sont
// regroupés ici pour être corrigés en un seul endroit : corriger TARIFS, puis répercuter la
// même valeur dans `momo-service/src/catalogue.ts`. Les prix affichés sont recalculés, jamais
// écrits en dur.

import { formatsTableaux, paliersTableaux, tarifsTableaux } from '../tarifs/grille';
import type { TarifsTableau } from '../tarifs/grille';
import type { Zone } from './studio';

/**
 * Tarifs du barème — lus dans la SOURCE UNIQUE des prix (`tarifs/grille.json`, section
 * `tableaux.tarifs`). Le service de paiement lit le même fichier à son démarrage : il n'existe
 * pas de seconde copie à tenir à jour, donc pas de dérive possible entre le prix affiché et le
 * prix encaissé.
 */
export const TARIFS: TarifsTableau = tarifsTableaux();

export type TableauFormatId = '20x30' | '30x40' | '40x60' | '50x70' | '60x90';
export type TableauSupport = 'chassis' | 'toile-seule';
export type TableauBord = 'galerie' | 'encadrement';
export type TableauOrientation = 'portrait' | 'paysage';

export type TableauFormat = {
  id: TableauFormatId;
  label: string;
  /** Dimensions du format FINI, en centimètres, en orientation portrait. */
  largeurCm: number;
  hauteurCm: number;
};

export const FORMATS: readonly TableauFormat[] = formatsTableaux().map((f) => ({
  id: f.id as TableauFormatId,
  label: f.libelle,
  largeurCm: f.largeurCm,
  hauteurCm: f.hauteurCm,
}));

export function formatParId(id: string): TableauFormat | undefined {
  return FORMATS.find((f) => f.id === id);
}

/* ------------------------------------------------------------------ quantités ------ */

export type Palier = {
  /** Quantité minimale du palier. */
  aPartirDe: number;
  /** Remise appliquée au sous-total, en pourcentage. */
  remisePct: number;
};

/** Paliers de quantité : décroissance simple et lisible (source : `tarifs/grille.json`). */
export const PALIERS: readonly Palier[] = paliersTableaux();

export function palierPour(quantite: number): Palier {
  const q = Math.max(1, Math.floor(quantite));
  let retenu = PALIERS[0];
  for (const p of PALIERS) if (q >= p.aPartirDe) retenu = p;
  return retenu;
}

/* ---------------------------------------------------------------------- prix ------ */

/**
 * Surface réellement facturée, en cm².
 *  - tableau sur châssis : le format fini PLUS le débord de toile de chaque côté ;
 *  - toile seule : la surface finie exacte (l'encadrement est fait par le client).
 */
export function surfaceFacturableCm2(format: TableauFormat, support: TableauSupport): number {
  const debord = support === 'chassis' ? TARIFS.debordChassisCm : 0;
  return (format.largeurCm + 2 * debord) * (format.hauteurCm + 2 * debord);
}

/** Arrondit au multiple supérieur — un prix public ne descend jamais sous son coût calculé. */
function arrondirSuperieur(montant: number, pas: number = TARIFS.arrondiFcfa): number {
  return Math.ceil(montant / pas) * pas;
}

/** Prix public d'UN tableau (avant remise de quantité). */
export function prixUnitaireFcfa(format: TableauFormat, support: TableauSupport): number {
  const surfaceM2 = surfaceFacturableCm2(format, support) / 10_000;
  const toile = surfaceM2 * TARIFS.impressionToileFcfaParM2;
  const chassis =
    support === 'chassis' ? (format.largeurCm * format.hauteurCm) / 10_000 * TARIFS.chassisFcfaParM2 : 0;
  return arrondirSuperieur(toile + chassis + TARIFS.forfaitPreparationFcfa);
}

export type DevisTableau = {
  formatId: TableauFormatId;
  support: TableauSupport;
  quantite: number;
  /** Prix public unitaire hors remise. */
  prixUnitaireFcfa: number;
  remisePct: number;
  /** Sous-total après remise de quantité (hors livraison). */
  sousTotalFcfa: number;
  delaiJours: number;
};

/** Devis d'une ligne de tableaux : prix unitaire, remise de palier, sous-total. */
export function devisTableau(params: {
  formatId: string;
  support: TableauSupport;
  quantite: number;
}): DevisTableau {
  const format = formatParId(params.formatId);
  if (!format) throw new RangeError(`format de tableau inconnu : « ${params.formatId} »`);
  const quantite = Math.max(1, Math.floor(params.quantite));
  const prixUnitaire = prixUnitaireFcfa(format, params.support);
  const { remisePct } = palierPour(quantite);
  const sousTotal = arrondirSuperieur(prixUnitaire * quantite * (1 - remisePct / 100));
  return {
    formatId: format.id,
    support: params.support,
    quantite,
    prixUnitaireFcfa: prixUnitaire,
    remisePct,
    sousTotalFcfa: sousTotal,
    delaiJours: delaiTableau(quantite, params.support),
  };
}

/**
 * Délai de production d'un tableau. Un tableau monté demande l'impression PUIS le montage ;
 * une toile seule part plus vite. Engagement global : jamais plus de 3 jours.
 */
export function delaiTableau(quantite: number, support: TableauSupport): number {
  const q = Math.max(1, Math.floor(quantite));
  if (support === 'toile-seule') return q <= 2 ? 1 : 2;
  return q <= 2 ? 2 : 3;
}

/* ------------------------------------------------------- qualité de la photo ------ */

/**
 * Densité d'une photo imprimée PLEIN FORMAT, en dpi.
 * Estimation prudente : on suppose que la photo couvre toute la zone (le pire cas), et on
 * retient la direction la plus faible — c'est elle qui décide de la netteté perçue.
 */
export function dpiPourFormat(pixelsL: number, pixelsH: number, format: TableauFormat): number {
  const dpiL = pixelsL / (format.largeurCm / 2.54);
  const dpiH = pixelsH / (format.hauteurCm / 2.54);
  return Math.min(dpiL, dpiH);
}

export type AvisFormat = {
  format: TableauFormat;
  dpi: number;
  /** Le format tient-il la densité minimale demandée ? */
  acceptable: boolean;
};

/** Densité obtenue par cette photo sur CHAQUE format du catalogue. */
export function avisParFormat(pixelsL: number, pixelsH: number, dpiMin = 150): AvisFormat[] {
  return FORMATS.map((format) => {
    const dpi = dpiPourFormat(pixelsL, pixelsH, format);
    return { format, dpi, acceptable: dpi >= dpiMin };
  });
}

export type ConseilFormat = {
  /** Le plus grand format que cette photo peut porter sans devenir floue. */
  recommande: TableauFormat;
  dpi: number;
  /** true si même le plus petit format descend sous le seuil (photo vraiment trop petite). */
  tropPetite: boolean;
  message: string;
};

/**
 * « Votre photo convient jusqu'à … » — le conseil affiché au client.
 * On retient le plus grand format dont la densité reste au-dessus du seuil ; si aucun ne
 * passe, on renvoie le plus petit en signalant que la photo est trop faible pour le tirage.
 */
export function conseilFormat(pixelsL: number, pixelsH: number, dpiMin = 150): ConseilFormat {
  const avis = avisParFormat(pixelsL, pixelsH, dpiMin);
  const acceptables = avis.filter((a) => a.acceptable);
  if (acceptables.length) {
    const meilleur = acceptables[acceptables.length - 1];
    return {
      recommande: meilleur.format,
      dpi: meilleur.dpi,
      tropPetite: false,
      message: `Votre photo convient jusqu'au format ${meilleur.format.label} (${Math.round(meilleur.dpi)} dpi). Au-delà, le tirage paraîtra flou.`,
    };
  }
  const plusPetit = avis[0];
  return {
    recommande: plusPetit.format,
    dpi: plusPetit.dpi,
    tropPetite: true,
    message: `Cette photo est trop petite pour un tirage : même au format ${plusPetit.format.label} elle ne donne que ${Math.round(plusPetit.dpi)} dpi. Choisissez une photo plus grande, ou réduisez le format.`,
  };
}

/* ------------------------------------------------------ cadrage dans le mockup ----- */

/**
 * Rectangle d'affichage disponible dans la photo d'ambiance (fractions de l'image) : la zone
 * où un tableau peut être « accroché ». Sert à placer le cadre au bon ratio selon le format.
 */
export const CADRE_AFFICHAGE: Zone = { x: 0.26, y: 0.14, w: 0.48, h: 0.5 };

/**
 * Zone d'impression dans le mockup pour un format donné : le plus grand rectangle au ratio du
 * format qui tient dans le cadre d'affichage, centré. C'est ce qui garantit qu'un 30 × 40 et un
 * 60 × 90 se voient immédiatement différents à l'écran, sans jamais déformer le visuel.
 */
export function zonePourFormat(
  format: TableauFormat,
  orientation: TableauOrientation = 'portrait',
  cadre: Zone = CADRE_AFFICHAGE,
): Zone {
  const largeurFmt = orientation === 'portrait' ? format.largeurCm : format.hauteurCm;
  const hauteurFmt = orientation === 'portrait' ? format.hauteurCm : format.largeurCm;
  const ratio = largeurFmt / hauteurFmt;
  const ratioCadre = cadre.w / cadre.h;

  let w: number;
  let h: number;
  if (ratio >= ratioCadre) {
    w = cadre.w;
    h = cadre.w / ratio;
  } else {
    h = cadre.h;
    w = cadre.h * ratio;
  }
  return {
    x: cadre.x + (cadre.w - w) / 2,
    y: cadre.y + (cadre.h - h) / 2,
    w,
    h,
  };
}

/** Taille physique de la zone, orientation comprise (le paysage échange largeur et hauteur). */
export function zoneCmPourFormat(
  format: TableauFormat,
  orientation: TableauOrientation = 'portrait',
): { w: number; h: number } {
  return orientation === 'portrait'
    ? { w: format.largeurCm, h: format.hauteurCm }
    : { w: format.hauteurCm, h: format.largeurCm };
}

/** Libellé court d'un support, pour l'interface et les fiches de production. */
export function libelleSupport(support: TableauSupport): string {
  return support === 'chassis' ? 'Toile montée sur châssis' : 'Toile seule (roulée)';
}

/** Libellé court du bord imprimé. */
export function libelleBord(bord: TableauBord): string {
  return bord === 'galerie' ? 'Bord galerie (l’image continue sur les côtés)' : 'Bord encadrement (côtés unis)';
}

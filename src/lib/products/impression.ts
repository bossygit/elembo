// Fichier d'IMPRESSION d'un tableau — géométrie pure, testable sans navigateur.
//
// Deux surfaces différentes, et c'est la source d'erreur la plus coûteuse en impression sur toile :
//
//   • le format FINI  — ce que le client voit accroché (ex. 40 × 60 cm) ;
//   • la surface IMPRIMÉE — ce que le prestataire doit imprimer : pour une toile montée sur
//     châssis, il faut de la matière en plus pour envelopper le châssis et l'agrafer (le
//     « débord »), soit 4 cm de chaque côté.
//
// Un fichier au format fini ne permet PAS de monter un châssis : la toile manquerait de 8 cm
// dans chaque direction. Ce module calcule donc, à partir de la commande (format, support,
// bord), la taille exacte du fichier à produire et la place du visuel dedans :
//
//   • bord GALERIE      : le visuel couvre toute la surface imprimée — l'image continue sur les
//                         côtés du châssis.
//   • bord ENCADREMENT  : le visuel occupe la face (format fini), les débords restent unis
//                         (blanc), comme sur un tableau classique.
//
// TOILE SEULE : pas de débord, le fichier est exactement le format commandé (le client fait
// encadrer).

import { TARIFS, type TableauFormat, type TableauSupport } from './tableaux';

export type ModeBord = 'galerie' | 'encadrement';

export const DPI_IMPRESSION = 150;
const CM_PAR_POUCE = 2.54;

/** Dimensions de la surface à imprimer, débords compris. */
export function dimensionsImprimeesCm(
  format: TableauFormat,
  support: TableauSupport,
  debordCm: number = TARIFS.debordChassisCm,
): { w: number; h: number } {
  const d = support === 'chassis' ? debordCm : 0;
  return { w: format.largeurCm + 2 * d, h: format.hauteurCm + 2 * d };
}

/** Taille du fichier en pixels, pour une densité donnée (150 dpi par défaut sur toile). */
export function tailleFichierPx(
  dimensionsCm: { w: number; h: number },
  dpi: number = DPI_IMPRESSION,
): { w: number; h: number } {
  return {
    w: Math.round((dimensionsCm.w / CM_PAR_POUCE) * dpi),
    h: Math.round((dimensionsCm.h / CM_PAR_POUCE) * dpi),
  };
}

/**
 * Place du visuel dans le fichier, en pixels.
 *  - `galerie`     : tout le fichier (le visuel se prolonge sur les débords) ;
 *  - `encadrement` : la face seule, centrée, les débords restant unis ;
 *  - `toile-seule` : tout le fichier (il n'y a pas de débord).
 * `dpi` doit être celui utilisé pour la taille du fichier (cohérence des unités).
 */
export function rectVisuelPx(params: {
  format: TableauFormat;
  support: TableauSupport;
  bord: ModeBord;
  dpi?: number;
  debordCm?: number;
}): { x: number; y: number; w: number; h: number } {
  const dpi = params.dpi ?? DPI_IMPRESSION;
  const debord = params.support === 'chassis' ? (params.debordCm ?? TARIFS.debordChassisCm) : 0;
  const total = dimensionsImprimeesCm(params.format, params.support, debord);
  const fichier = tailleFichierPx(total, dpi);
  if (params.support === 'chassis' && params.bord === 'encadrement') {
    const dp = Math.round((debord / CM_PAR_POUCE) * dpi);
    return { x: dp, y: dp, w: fichier.w - 2 * dp, h: fichier.h - 2 * dp };
  }
  return { x: 0, y: 0, w: fichier.w, h: fichier.h };
}

export type FicheFichierImpression = {
  /** Nom du fichier de production (jamais celui de l'aperçu). */
  fichier: string;
  largeurCm: number;
  hauteurCm: number;
  largeurPx: number;
  hauteurPx: number;
  dpi: number;
  support: TableauSupport;
  bord: ModeBord;
  /** Rappel lisible pour l'atelier. */
  consigne: string;
};

/**
 * Description complète du fichier à produire pour une ligne de commande.
 * `numero` sert à numéroter les lignes quand une commande contient plusieurs tableaux.
 */
export function ficheFichierImpression(params: {
  commande: string;
  numero?: number;
  format: TableauFormat;
  support: TableauSupport;
  bord: ModeBord;
  dpi?: number;
}): FicheFichierImpression {
  const dpi = params.dpi ?? DPI_IMPRESSION;
  const cm = dimensionsImprimeesCm(params.format, params.support);
  const px = tailleFichierPx(cm, dpi);
  const suffixe = params.numero && params.numero > 1 ? `-${params.numero}` : '';
  const fichier = `${params.commande}-IMPRESSION-${params.format.id}-${params.support}${suffixe}.png`;

  let consigne: string;
  if (params.support === 'toile-seule') {
    consigne = `Toile SEULE (non montée) au format fini ${params.format.label} : imprimer tel quel, rouler, ne pas monter sur châssis.`;
  } else if (params.bord === 'galerie') {
    consigne = `Toile MONTÉE sur châssis ${params.format.label} : imprimer la surface complète (${cm.w} × ${cm.h} cm) puis envelopper — le visuel doit continuer sur les côtés (bord galerie).`;
  } else {
    consigne = `Toile MONTÉE sur châssis ${params.format.label} : le visuel occupe la face centrale (${params.format.label}) ; les ${TARIFS.debordChassisCm} cm de débord tout autour restent unis (blanc), ils servent à envelopper et agrafer.`;
  }

  return {
    fichier,
    largeurCm: cm.w,
    hauteurCm: cm.h,
    largeurPx: px.w,
    hauteurPx: px.h,
    dpi,
    support: params.support,
    bord: params.bord,
    consigne,
  };
}

/** Fiche lisible (texte) qui accompagne les fichiers — pour WhatsApp ou e-mail à l'atelier. */
export function ficheTexte(fiches: FicheFichierImpression[], entete: string[]): string {
  const lignes = [...entete, ''];
  fiches.forEach((f, i) => {
    lignes.push(`${i + 1}. ${f.fichier}`);
    lignes.push(`   Format fini     : ${f.largeurCm - (f.support === 'chassis' ? 2 * TARIFS.debordChassisCm : 0)} × ${f.hauteurCm - (f.support === 'chassis' ? 2 * TARIFS.debordChassisCm : 0)} cm`);
    lignes.push(`   Surface imprimée: ${f.largeurCm} × ${f.hauteurCm} cm (${f.largeurPx} × ${f.hauteurPx} px à ${f.dpi} dpi)`);
    lignes.push(`   ${f.consigne}`);
    lignes.push('');
  });
  lignes.push('Rappel : le fichier ci-dessus est le fichier de PRODUCTION (visuel seul, 150 dpi).');
  lignes.push('Ne jamais imprimer depuis l’aperçu de la boutique (il contient le décor de la pièce).');
  return lignes.join('\n');
}

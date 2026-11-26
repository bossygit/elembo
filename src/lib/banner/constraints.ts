/**
 * Banner Studio — contraintes physiques, zones et alertes (audit §4.5, §7.3).
 *
 * Un profil d'impression décrit ce que l'imprimeur peut réellement faire. Les profils publics
 * ci-dessous sont des valeurs **prudentes, à valider** (« on n'invente pas une capacité
 * d'imprimeur ») ; le profil validé d'un partenaire, issu de ses capacités Elembo Partners, les
 * remplacera au lot 6. Seules les alertes `critique` bloquent la génération du PDF.
 */

import { chevaucheCercle, chevaucheRect, estDans, retrait, traverseLigne, type Cercle, type Rect } from './geometry';
import { DIMENSION_MAX_MM, DIMENSION_MIN_MM } from './formats';
import type { ContraintesDocument, DocumentBanner, Element, FinitionStudio, SupportStudio } from './model';
import { dpiEffectif, dpiFond, niveauQualite, seuils } from './quality';

/* ---------------------------------------------------------------- profils -- */

export type StatutProfil = 'BROUILLON' | 'A_VALIDER' | 'VALIDE' | 'ARCHIVE';

export type ProfilImpression = {
  id: string | null;
  nom: string;
  support: SupportStudio;
  estPublic: boolean;
  statut: StatutProfil;
  version: number;
  laizeMaxMm: number | null;
  longueurMaxMm: number | null;
  margeSecuriteMm: number;
  fondPerduMm: number;
  ourletMm: number;
  oeillets: { diametreMm: number; espacementMm: number; margeMm: number };
  /** Bandes réservées : appliquées avec la finition « Fourreaux », ou toujours pour un support rigide (baguettes, pied). */
  fourreauHautMm: number;
  fourreauBasMm: number;
  dpiMin: number;
  dpiRecommande: number;
  pageMaxMm: number;
  modeGrandFormat: 'PANNEAUX' | 'PAGE_UNIQUE_USERUNIT';
};

const publicProfil = (support: SupportStudio, nom: string, p: Partial<ProfilImpression>): ProfilImpression => ({
  id: null,
  nom,
  support,
  estPublic: true,
  statut: 'A_VALIDER',
  version: 1,
  laizeMaxMm: null,
  longueurMaxMm: null,
  margeSecuriteMm: 50,
  fondPerduMm: 0,
  ourletMm: 50,
  oeillets: { diametreMm: 20, espacementMm: 500, margeMm: 30 },
  fourreauHautMm: 60,
  fourreauBasMm: 60,
  dpiMin: 72,
  dpiRecommande: 150,
  pageMaxMm: 5080,
  modeGrandFormat: 'PANNEAUX',
  ...p,
});

/** Profils publics de secours, un par support (seed du §6.1) : jamais déclarés « validés » ici. */
export const PROFILS_PUBLICS: Record<SupportStudio, ProfilImpression> = {
  BANDEROLE: publicProfil('BANDEROLE', 'Banderole — profil public', {}),
  BACHE: publicProfil('BACHE', 'Bâche de façade — profil public', {}),
  // Le pied du roll-up masque le bas du visuel ; le kakémono a deux baguettes.
  ROLL_UP: publicProfil('ROLL_UP', 'Roll-up — profil public', { ourletMm: 0, fourreauHautMm: 0, fourreauBasMm: 100, margeSecuriteMm: 30 }),
  KAKEMONO: publicProfil('KAKEMONO', 'Kakémono — profil public', { ourletMm: 0, fourreauHautMm: 30, fourreauBasMm: 30, margeSecuriteMm: 30 }),
  X_BANNER: publicProfil('X_BANNER', 'X-banner — profil public', { ourletMm: 0, fourreauHautMm: 0, fourreauBasMm: 0, margeSecuriteMm: 30 }),
  PANNEAU: publicProfil('PANNEAU', 'Panneau rigide — profil public', { ourletMm: 0, fourreauHautMm: 0, fourreauBasMm: 0, margeSecuriteMm: 20, dpiRecommande: 200 }),
};

const RIGIDES: SupportStudio[] = ['ROLL_UP', 'KAKEMONO', 'X_BANNER', 'PANNEAU'];

/** Contraintes effectives d'un document, selon le profil, le support et la finition. */
export function resoudreContraintes(profil: ProfilImpression, finition: FinitionStudio): ContraintesDocument {
  const rigide = RIGIDES.includes(profil.support);
  const ourlet = !rigide && (finition === 'OURLETS' || finition === 'OURLETS_OEILLETS');
  const oeillets = !rigide && (finition === 'OEILLETS' || finition === 'OURLETS_OEILLETS');
  const fourreaux = rigide || finition === 'FOURREAUX';
  return {
    margeSecuriteMm: profil.margeSecuriteMm,
    ourletMm: ourlet ? profil.ourletMm : 0,
    fondPerduMm: profil.fondPerduMm,
    laizeMaxMm: profil.laizeMaxMm,
    longueurMaxMm: profil.longueurMaxMm,
    oeillets: { actifs: oeillets, ...profil.oeillets },
    fourreaux: { hautMm: fourreaux ? profil.fourreauHautMm : 0, basMm: fourreaux ? profil.fourreauBasMm : 0 },
    dpiMin: profil.dpiMin,
    dpiRecommande: profil.dpiRecommande,
    pageMaxMm: profil.pageMaxMm,
    modeGrandFormat: profil.modeGrandFormat,
  };
}

/* ----------------------------------------------------------------- zones -- */

/** Centres des œillets : un à chaque coin, puis régulièrement espacés (≤ espacement) sur chaque côté. */
export function positionsOeillets(largeurMm: number, hauteurMm: number, o: { espacementMm: number; margeMm: number }) {
  const m = o.margeMm;
  const pts: { x: number; y: number }[] = [];
  const cote = (x0: number, y0: number, x1: number, y1: number) => {
    const long = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(long / o.espacementMm - 1e-9));
    // Le dernier point de chaque côté est le premier du suivant : on ne le répète pas.
    for (let i = 0; i < n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
  };
  cote(m, m, largeurMm - m, m);
  cote(largeurMm - m, m, largeurMm - m, hauteurMm - m);
  cote(largeurMm - m, hauteurMm - m, m, hauteurMm - m);
  cote(m, hauteurMm - m, m, m);
  return pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}

export const RECOUVREMENT_PANNEAUX_MM = 20;

/** Découpe du grand côté en panneaux de pages PDF, avec recouvrement (§7.3). */
export function panneaux(longueurMm: number, pageMaxMm: number, recouvrementMm = RECOUVREMENT_PANNEAUX_MM) {
  if (longueurMm <= pageMaxMm) return [{ debutMm: 0, longueurMm }];
  const max = pageMaxMm - 80; // marge sous le plafond PDF (5 000 mm pour 5 080)
  const n = Math.ceil((longueurMm - recouvrementMm) / (max - recouvrementMm));
  const l = (longueurMm + (n - 1) * recouvrementMm) / n;
  return Array.from({ length: n }, (_, i) => ({ debutMm: i * (l - recouvrementMm), longueurMm: l }));
}

/** Pages d'un document : une seule, ou des panneaux sur le grand côté. Commun à l'éditeur et au PDF. */
export function decoupePages(doc: DocumentBanner): { axe: 'x' | 'y'; panneaux: { debutMm: number; longueurMm: number }[]; tientEnPage: boolean } {
  const { largeurMm: L, hauteurMm: H } = doc.dimensions;
  const { pageMaxMm, fondPerduMm, modeGrandFormat } = doc.contraintes;
  const grand = Math.max(L, H);
  const enPanneaux = modeGrandFormat === 'PANNEAUX';
  return {
    axe: L >= H ? 'x' : 'y',
    // Le fond perdu prend sa place sur la page.
    panneaux: enPanneaux ? panneaux(grand, pageMaxMm - 2 * fondPerduMm) : [{ debutMm: 0, longueurMm: grand }],
    tientEnPage: !enPanneaux || Math.min(L, H) + 2 * fondPerduMm <= pageMaxMm,
  };
}

export type Zones = {
  surface: Rect;
  zoneSure: Rect;
  fondPerdu: Rect;
  ourlets: Rect[];
  fourreaux: Rect[];
  oeillets: Cercle[];
  /** Bandes de recouvrement entre panneaux, sur l'axe du grand côté. */
  plis: { axe: 'x' | 'y'; debutMm: number; finMm: number }[];
};

export function zones(doc: DocumentBanner): Zones {
  const { largeurMm: L, hauteurMm: H } = doc.dimensions;
  const c = doc.contraintes;
  const surface: Rect = { x: 0, y: 0, largeur: L, hauteur: H };
  const o = c.ourletMm;
  const ourlets: Rect[] = o > 0 ? [
    { x: 0, y: 0, largeur: L, hauteur: o },
    { x: 0, y: H - o, largeur: L, hauteur: o },
    { x: 0, y: 0, largeur: o, hauteur: H },
    { x: L - o, y: 0, largeur: o, hauteur: H },
  ] : [];
  const fourreaux: Rect[] = [];
  if (c.fourreaux.hautMm > 0) fourreaux.push({ x: 0, y: 0, largeur: L, hauteur: c.fourreaux.hautMm });
  if (c.fourreaux.basMm > 0) fourreaux.push({ x: 0, y: H - c.fourreaux.basMm, largeur: L, hauteur: c.fourreaux.basMm });
  const oeillets = c.oeillets.actifs
    ? positionsOeillets(L, H, c.oeillets).map((p) => ({ ...p, rayon: c.oeillets.diametreMm / 2 + c.oeillets.margeMm }))
    : [];
  const { axe, panneaux: decoupe } = decoupePages(doc);
  const plis = decoupe.slice(1).map((p, i) => ({ axe, debutMm: p.debutMm, finMm: decoupe[i].debutMm + decoupe[i].longueurMm }));
  // Fourreaux et ourlets s'ajoutent à la marge de sécurité.
  const inset = c.margeSecuriteMm + o;
  const sure = retrait(surface, inset);
  const haut = Math.max(0, c.fourreaux.hautMm + c.margeSecuriteMm - inset);
  const bas = Math.max(0, c.fourreaux.basMm + c.margeSecuriteMm - inset);
  return {
    surface,
    zoneSure: { x: sure.x, y: sure.y + haut, largeur: sure.largeur, hauteur: Math.max(0, sure.hauteur - haut - bas) },
    fondPerdu: { x: -c.fondPerduMm, y: -c.fondPerduMm, largeur: L + 2 * c.fondPerduMm, hauteur: H + 2 * c.fondPerduMm },
    ourlets,
    fourreaux,
    oeillets,
    plis,
  };
}

/* ---------------------------------------------------------------- alertes -- */

export type Severite = 'critique' | 'avertissement' | 'info';
export type CodeAlerte =
  | 'HORS_FORMAT' | 'ZONE_SECURITE' | 'OURLET' | 'OEILLET' | 'FOURREAU'
  | 'IMAGE_MANQUANTE' | 'IMAGE_DPI_INSUFFISANT' | 'IMAGE_DPI_FAIBLE'
  | 'POLICE_GLYPHES' | 'POLICE_INDISPONIBLE' | 'PLIURE_PANNEAU' | 'PLACEHOLDER'
  | 'TEXTE_EXEMPLE'
  | 'PROFIL_A_VALIDER' | 'FOND_PERDU_NON_COUVERT' | 'FORMAT_SUR_DEVIS' | 'HORS_LAIZE' | 'HORS_LONGUEUR';

export type Alerte = { code: CodeAlerte; severite: Severite; elementId: string | null; message: string };

/** Plafond du libre-service (décision 2 du §10) : au-delà, devis manuel. */
export const PLAFOND_LIBRE_SERVICE = { pages: 12, surfaceM2: 100, longueurMm: 20_000 } as const;

const ORDRE_SEVERITE: Record<Severite, number> = { critique: 0, avertissement: 1, info: 2 };

export type ContexteEvaluation = {
  /** Statut du profil utilisé : tout autre que VALIDE signale des contraintes à confirmer. */
  statutProfil?: StatutProfil;
  /** Assets réellement disponibles (IndexedDB côté client, bucket côté serveur). */
  assetsDisponibles?: ReadonlySet<string>;
  /** Polices dont le fichier est présent (côté serveur). */
  policesDisponibles?: ReadonlySet<string>;
  /** Textes d'un modèle restés à leur exemple (nom, date, lieu). */
  textesExemple?: ReadonlySet<string>;
  /** Caractères absents de la police (côté serveur, avec fontkit). */
  glyphesManquants?: (policeId: string, texte: string) => string[];
};

/** Un texte se reconnaît à ce qu'il dit, pas au nom de son calque. */
const libelle = (e: Element) => {
  if (e.type !== 'texte') return `« ${e.nom} »`;
  const c = e.texte.contenu.replace(/\s+/g, ' ').trim();
  return `« ${c.length > 28 ? `${c.slice(0, 27).trimEnd()}…` : c || 'Texte'} »`;
};

/** Format : plafond du libre-service, laize (petit côté) et longueur (grand côté). */
export function alertesFormat(doc: DocumentBanner): Alerte[] {
  const { largeurMm: L, hauteurMm: H } = doc.dimensions;
  const c = doc.contraintes;
  const a: Alerte[] = [];
  const decoupe = decoupePages(doc);
  const pages = decoupe.panneaux.length;
  if (pages > PLAFOND_LIBRE_SERVICE.pages || (L * H) / 1e6 > PLAFOND_LIBRE_SERVICE.surfaceM2 || Math.max(L, H) > PLAFOND_LIBRE_SERVICE.longueurMm) {
    a.push({ code: 'FORMAT_SUR_DEVIS', severite: 'critique', elementId: null, message: 'Ce format dépasse le libre-service (12 pages, 100 m², 20 m) : il sera chiffré sur devis.' });
  }
  if (!decoupe.tientEnPage) {
    a.push({ code: 'FORMAT_SUR_DEVIS', severite: 'critique', elementId: null, message: 'Les deux côtés dépassent 5 m : ce format sera étudié sur devis.' });
  }
  if (c.laizeMaxMm && Math.min(L, H) > c.laizeMaxMm) {
    a.push({ code: 'HORS_LAIZE', severite: 'critique', elementId: null, message: `Les deux côtés dépassent la laize de l’imprimeur (${c.laizeMaxMm / 1000} m) : un assemblage ou un devis est nécessaire.` });
  }
  if (c.longueurMaxMm && Math.max(L, H) > c.longueurMaxMm) {
    a.push({ code: 'HORS_LONGUEUR', severite: 'critique', elementId: null, message: `Le grand côté dépasse la longueur maximale de l’imprimeur (${c.longueurMaxMm / 1000} m).` });
  }
  if (Math.min(L, H) < DIMENSION_MIN_MM || Math.max(L, H) > DIMENSION_MAX_MM) {
    a.push({ code: 'FORMAT_SUR_DEVIS', severite: 'critique', elementId: null, message: 'Dimensions hors des bornes commerciales (0,2 à 50 m).' });
  }
  return a;
}

/** Préflight complet : même calcul côté client (en direct) et côté serveur (enregistré). */
export function evaluer(doc: DocumentBanner, ctx: ContexteEvaluation = {}): Alerte[] {
  const z = zones(doc);
  const alertes: Alerte[] = [...alertesFormat(doc)];
  const assets = new Map(doc.assets.map((a) => [a.id, a]));
  const disponible = (id: string) => assets.has(id) && (!ctx.assetsDisponibles || ctx.assetsDisponibles.has(id));

  if (ctx.statutProfil && ctx.statutProfil !== 'VALIDE') {
    alertes.push({ code: 'PROFIL_A_VALIDER', severite: 'info', elementId: null, message: 'Contraintes d’impression à confirmer par l’imprimeur.' });
  }
  if (doc.fond.type === 'image') {
    const asset = assets.get(doc.fond.assetId);
    // Une image d'exemple n'existe nulle part : elle est à remplacer, pas « introuvable ».
    if (asset?.placeholder) alertes.push({ code: 'PLACEHOLDER', severite: 'critique', elementId: null, message: 'L’image de fond du modèle doit être remplacée.' });
    else if (!disponible(doc.fond.assetId)) alertes.push({ code: 'IMAGE_MANQUANTE', severite: 'critique', elementId: null, message: 'L’image de fond est introuvable.' });
    if (asset && !asset.placeholder && disponible(asset.id)) {
      const dpi = dpiFond(doc, asset);
      const niveau = niveauQualite(dpi, seuils(doc.qualite.distanceLectureM, doc.contraintes));
      if (niveau === 'INSUFFISANTE') alertes.push({ code: 'IMAGE_DPI_INSUFFISANT', severite: 'avertissement', elementId: null, message: `L’image de fond sera floue (${dpi} dpi).` });
      else if (niveau === 'FAIBLE') alertes.push({ code: 'IMAGE_DPI_FAIBLE', severite: 'info', elementId: null, message: `L’image de fond est juste en définition (${dpi} dpi).` });
    }
    if (doc.contraintes.fondPerduMm > 0 && doc.fond.ajustement === 'contain') {
      alertes.push({ code: 'FOND_PERDU_NON_COUVERT', severite: 'info', elementId: null, message: 'L’image de fond n’atteint pas le bord du fond perdu.' });
    }
  }

  for (const e of doc.elements) {
    if (!e.visible) continue;
    const texte = e.type === 'texte';
    const dansFondPerdu = !texte && doc.contraintes.fondPerduMm > 0 && estDans(e, z.fondPerdu);
    if (!estDans(e, z.surface) && !dansFondPerdu) {
      alertes.push({ code: 'HORS_FORMAT', severite: 'critique', elementId: e.id, message: `${libelle(e)} sort du format : la partie qui dépasse sera coupée.` });
    } else if (!estDans(e, z.zoneSure)) {
      alertes.push({ code: 'ZONE_SECURITE', severite: texte ? 'avertissement' : 'info', elementId: e.id, message: `${libelle(e)} déborde de la zone de sécurité.` });
    }
    if (texte && z.ourlets.some((r) => chevaucheRect(e, r))) {
      alertes.push({ code: 'OURLET', severite: 'avertissement', elementId: e.id, message: `${libelle(e)} touche un ourlet : il sera replié.` });
    }
    if (e.type !== 'forme' && z.oeillets.some((c) => chevaucheCercle(e, c))) {
      alertes.push({ code: 'OEILLET', severite: 'avertissement', elementId: e.id, message: `${libelle(e)} passe sous un œillet.` });
    }
    if (e.type !== 'forme' && z.fourreaux.some((r) => chevaucheRect(e, r))) {
      alertes.push({ code: 'FOURREAU', severite: 'avertissement', elementId: e.id, message: `${libelle(e)} est dans une bande réservée (fourreau, baguette ou pied).` });
    }
    if (texte && z.plis.some((p) => traverseLigne(e, p.axe, p.debutMm) || traverseLigne(e, p.axe, p.finMm))) {
      alertes.push({ code: 'PLIURE_PANNEAU', severite: 'avertissement', elementId: e.id, message: `${libelle(e)} est à cheval sur une jonction de panneaux.` });
    }
    if (e.type === 'image') {
      const asset = assets.get(e.image.assetId);
      if (asset?.placeholder) {
        alertes.push({ code: 'PLACEHOLDER', severite: 'critique', elementId: e.id, message: `${libelle(e)} est une image d’exemple : remplacez-la ou retirez-la.` });
        continue;
      }
      if (!asset || !disponible(asset.id)) {
        alertes.push({ code: 'IMAGE_MANQUANTE', severite: 'critique', elementId: e.id, message: `L’image de ${libelle(e)} est introuvable.` });
        continue;
      }
      const dpi = dpiEffectif(e, asset);
      const niveau = niveauQualite(dpi, seuils(doc.qualite.distanceLectureM, doc.contraintes));
      if (niveau === 'INSUFFISANTE') alertes.push({ code: 'IMAGE_DPI_INSUFFISANT', severite: 'avertissement', elementId: e.id, message: `${libelle(e)} sera floue (${dpi} dpi).` });
      else if (niveau === 'FAIBLE') alertes.push({ code: 'IMAGE_DPI_FAIBLE', severite: 'info', elementId: e.id, message: `${libelle(e)} est juste en définition (${dpi} dpi).` });
    }
    if (e.type === 'texte') {
      if (ctx.textesExemple?.has(e.id)) {
        alertes.push({ code: 'TEXTE_EXEMPLE', severite: 'avertissement', elementId: e.id, message: `${libelle(e)} est un texte d’exemple du modèle : mettez le vôtre.` });
      }
      if (ctx.policesDisponibles && !ctx.policesDisponibles.has(e.texte.policeId)) {
        alertes.push({ code: 'POLICE_INDISPONIBLE', severite: 'critique', elementId: e.id, message: `La police de ${libelle(e)} est indisponible.` });
      } else if (ctx.glyphesManquants) {
        const manquants = ctx.glyphesManquants(e.texte.policeId, e.texte.contenu);
        if (manquants.length) alertes.push({ code: 'POLICE_GLYPHES', severite: 'critique', elementId: e.id, message: `La police de ${libelle(e)} ne contient pas : ${manquants.join(' ')}` });
      }
    }
  }
  return alertes
    .map((a, i) => ({ a, i }))
    .sort((p, q) => ORDRE_SEVERITE[p.a.severite] - ORDRE_SEVERITE[q.a.severite] || p.i - q.i)
    .map((p) => p.a);
}

/** Le PDF ne peut être généré que sans alerte critique. */
export const bloquant = (alertes: readonly Alerte[]) => alertes.some((a) => a.severite === 'critique');

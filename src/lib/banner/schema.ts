/**
 * Banner Studio — validation stricte d'un document (audit §4.3, §4.6, §4.8).
 *
 * Un document vient du navigateur, d'un fichier importé ou d'un modèle : on ne lui fait pas
 * confiance. La validation refuse les clés inconnues, borne chaque valeur, vérifie les références
 * d'images et l'unicité des identifiants, et renvoie des erreurs lisibles avec leur chemin.
 * `lireDocument` ne lève jamais : un JSON corrompu donne une erreur, pas une exception.
 */

import { CATEGORIES } from './categories';
import { DIMENSION_MAX_MM, DIMENSION_MIN_MM } from './formats';
import { migrer, SCHEMA_DOCUMENT, VERSION_DOCUMENT, type DocumentBanner } from './model';

export type ErreurValidation = { chemin: string; message: string };
export type ResultatValidation = { ok: true; document: DocumentBanner } | { ok: false; erreurs: ErreurValidation[] };

export const BORNES = {
  elementsMax: 200,
  assetsMax: 50,
  nomMax: 120,
  texteMax: 1000,
  lignesMax: 20,
  pixelsMax: 20_000,
  margeMaxMm: 1000,
} as const;

const SUPPORTS = ['BANDEROLE', 'BACHE', 'ROLL_UP', 'KAKEMONO', 'X_BANNER', 'PANNEAU'];
const FINITIONS = ['SANS', 'OEILLETS', 'OURLETS', 'OURLETS_OEILLETS', 'FOURREAUX'];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const POLICE = /^[a-z0-9-]{2,40}$/;
const COULEUR = /^#[0-9A-Fa-f]{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// Caractères de contrôle interdits dans un texte, hors retour à la ligne.
const CONTROLE = /[\u0000-\u0009\u000B-\u001F\u007F]/;

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet => typeof v === 'object' && v !== null && !Array.isArray(v);

class Verificateur {
  erreurs: ErreurValidation[] = [];
  err(chemin: string, message: string) {
    this.erreurs.push({ chemin, message });
    return false;
  }
  objet(v: unknown, chemin: string, cles: string[], optionnelles: string[] = []): v is Objet {
    if (!estObjet(v)) return this.err(chemin, 'doit être un objet');
    for (const k of Object.keys(v)) if (!cles.includes(k) && !optionnelles.includes(k)) this.err(`${chemin}.${k}`, 'clé inconnue');
    for (const k of cles) if (!(k in v)) this.err(`${chemin}.${k}`, 'obligatoire');
    return true;
  }
  nombre(v: unknown, chemin: string, min: number, max: number, entier = false): boolean {
    if (typeof v !== 'number' || !Number.isFinite(v)) return this.err(chemin, 'doit être un nombre');
    if (entier && !Number.isInteger(v)) return this.err(chemin, 'doit être un entier');
    if (v < min || v > max) return this.err(chemin, `doit être entre ${min} et ${max}`);
    return true;
  }
  chaine(v: unknown, chemin: string, motif?: RegExp, max: number = BORNES.nomMax): boolean {
    if (typeof v !== 'string') return this.err(chemin, 'doit être une chaîne');
    if (v.length === 0 || v.length > max) return this.err(chemin, `longueur entre 1 et ${max}`);
    if (motif && !motif.test(v)) return this.err(chemin, 'format invalide');
    return true;
  }
  booleen(v: unknown, chemin: string) {
    return typeof v === 'boolean' || this.err(chemin, 'doit être un booléen');
  }
  parmi(v: unknown, chemin: string, valeurs: readonly unknown[]) {
    return valeurs.includes(v) || this.err(chemin, `valeur attendue : ${valeurs.join(', ')}`);
  }
  couleur(v: unknown, chemin: string, nullable = false) {
    if (nullable && v === null) return true;
    return (typeof v === 'string' && COULEUR.test(v)) || this.err(chemin, 'couleur #RRGGBB attendue');
  }
  date(v: unknown, chemin: string) {
    return (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))) || this.err(chemin, 'date ISO attendue');
  }
}

/** Valide un objet déjà à la version courante. */
export function validerDocument(v: unknown): ResultatValidation {
  const c = new Verificateur();
  const racine = 'document';
  if (!c.objet(v, racine, ['schema', 'version', 'id', 'nom', 'creeLe', 'modifieLe', 'support', 'categorie', 'modeleId', 'dimensions', 'finition', 'profil', 'contraintes', 'fond', 'assets', 'elements', 'qualite', 'meta'])) {
    return { ok: false, erreurs: c.erreurs };
  }
  c.parmi(v.schema, `${racine}.schema`, [SCHEMA_DOCUMENT]);
  c.parmi(v.version, `${racine}.version`, [VERSION_DOCUMENT]);
  c.chaine(v.id, `${racine}.id`, ID);
  c.chaine(v.nom, `${racine}.nom`);
  c.date(v.creeLe, `${racine}.creeLe`);
  c.date(v.modifieLe, `${racine}.modifieLe`);
  c.parmi(v.support, `${racine}.support`, SUPPORTS);
  c.parmi(v.finition, `${racine}.finition`, FINITIONS);
  if (v.categorie !== null) c.parmi(v.categorie, `${racine}.categorie`, CATEGORIES.map((x) => x.id));
  if (v.modeleId !== null) c.chaine(v.modeleId, `${racine}.modeleId`, ID);

  let L = 0;
  let H = 0;
  if (c.objet(v.dimensions, `${racine}.dimensions`, ['largeurMm', 'hauteurMm'])) {
    if (c.nombre(v.dimensions.largeurMm, `${racine}.dimensions.largeurMm`, DIMENSION_MIN_MM, DIMENSION_MAX_MM)) L = v.dimensions.largeurMm as number;
    if (c.nombre(v.dimensions.hauteurMm, `${racine}.dimensions.hauteurMm`, DIMENSION_MIN_MM, DIMENSION_MAX_MM)) H = v.dimensions.hauteurMm as number;
  }
  if (v.profil !== null && c.objet(v.profil, `${racine}.profil`, ['id', 'version'])) {
    c.chaine(v.profil.id, `${racine}.profil.id`, ID);
    c.nombre(v.profil.version, `${racine}.profil.version`, 1, 1_000_000, true);
  }

  const k = `${racine}.contraintes`;
  if (c.objet(v.contraintes, k, ['margeSecuriteMm', 'ourletMm', 'fondPerduMm', 'laizeMaxMm', 'longueurMaxMm', 'oeillets', 'fourreaux', 'dpiMin', 'dpiRecommande', 'pageMaxMm', 'modeGrandFormat'])) {
    const ct = v.contraintes;
    for (const champ of ['margeSecuriteMm', 'ourletMm', 'fondPerduMm'] as const) c.nombre(ct[champ], `${k}.${champ}`, 0, BORNES.margeMaxMm);
    for (const champ of ['laizeMaxMm', 'longueurMaxMm'] as const) if (ct[champ] !== null) c.nombre(ct[champ], `${k}.${champ}`, 1, DIMENSION_MAX_MM);
    if (c.objet(ct.oeillets, `${k}.oeillets`, ['actifs', 'diametreMm', 'espacementMm', 'margeMm'])) {
      c.booleen(ct.oeillets.actifs, `${k}.oeillets.actifs`);
      c.nombre(ct.oeillets.diametreMm, `${k}.oeillets.diametreMm`, 1, 200);
      c.nombre(ct.oeillets.espacementMm, `${k}.oeillets.espacementMm`, 50, 5000);
      c.nombre(ct.oeillets.margeMm, `${k}.oeillets.margeMm`, 0, 500);
    }
    if (c.objet(ct.fourreaux, `${k}.fourreaux`, ['hautMm', 'basMm'])) {
      c.nombre(ct.fourreaux.hautMm, `${k}.fourreaux.hautMm`, 0, BORNES.margeMaxMm);
      c.nombre(ct.fourreaux.basMm, `${k}.fourreaux.basMm`, 0, BORNES.margeMaxMm);
    }
    c.nombre(ct.dpiMin, `${k}.dpiMin`, 30, 600, true);
    c.nombre(ct.dpiRecommande, `${k}.dpiRecommande`, 30, 600, true);
    c.nombre(ct.pageMaxMm, `${k}.pageMaxMm`, 500, 5080);
    c.parmi(ct.modeGrandFormat, `${k}.modeGrandFormat`, ['PANNEAUX', 'PAGE_UNIQUE_USERUNIT']);
  }

  // Assets : identifiants uniques, dimensions bornées.
  const assetIds = new Set<string>();
  if (!Array.isArray(v.assets)) c.err(`${racine}.assets`, 'doit être une liste');
  else {
    if (v.assets.length > BORNES.assetsMax) c.err(`${racine}.assets`, `au plus ${BORNES.assetsMax} images`);
    v.assets.forEach((a, i) => {
      const p = `${racine}.assets[${i}]`;
      if (!c.objet(a, p, ['id', 'nom', 'mime', 'largeurPx', 'hauteurPx'], ['sha256', 'placeholder'])) return;
      if (c.chaine(a.id, `${p}.id`, ID)) {
        if (assetIds.has(a.id as string)) c.err(`${p}.id`, 'identifiant en double');
        assetIds.add(a.id as string);
      }
      c.chaine(a.nom, `${p}.nom`, undefined, 200);
      c.parmi(a.mime, `${p}.mime`, ['image/jpeg', 'image/png']);
      c.nombre(a.largeurPx, `${p}.largeurPx`, 1, BORNES.pixelsMax, true);
      c.nombre(a.hauteurPx, `${p}.hauteurPx`, 1, BORNES.pixelsMax, true);
      if ('sha256' in a && !(typeof a.sha256 === 'string' && SHA256.test(a.sha256))) c.err(`${p}.sha256`, 'empreinte SHA-256 hexadécimale attendue');
      if ('placeholder' in a) c.booleen(a.placeholder, `${p}.placeholder`);
    });
  }

  const f = `${racine}.fond`;
  if (estObjet(v.fond) && v.fond.type === 'image') {
    if (c.objet(v.fond, f, ['type', 'assetId', 'ajustement', 'couleur'])) {
      if (!assetIds.has(v.fond.assetId as string)) c.err(`${f}.assetId`, 'image inconnue');
      c.parmi(v.fond.ajustement, `${f}.ajustement`, ['cover', 'contain']);
      c.couleur(v.fond.couleur, `${f}.couleur`);
    }
  } else if (c.objet(v.fond, f, ['type', 'couleur'])) {
    c.parmi(v.fond.type, `${f}.type`, ['couleur', 'image']);
    c.couleur(v.fond.couleur, `${f}.couleur`);
  }

  // Éléments : position bornée autour du format (un élément peut déborder, pas partir à l'infini).
  const ids = new Set<string>();
  const etendue = Math.max(L, H, DIMENSION_MIN_MM) * 2;
  if (!Array.isArray(v.elements)) c.err(`${racine}.elements`, 'doit être une liste');
  else {
    if (v.elements.length > BORNES.elementsMax) c.err(`${racine}.elements`, `au plus ${BORNES.elementsMax} éléments`);
    v.elements.forEach((e, i) => {
      const p = `${racine}.elements[${i}]`;
      const type = estObjet(e) ? e.type : undefined;
      const propre = type === 'texte' ? 'texte' : type === 'image' ? 'image' : type === 'forme' ? 'forme' : null;
      if (!propre) {
        c.err(`${p}.type`, 'valeur attendue : texte, image, forme');
        return;
      }
      if (!c.objet(e, p, ['id', 'type', 'nom', 'xMm', 'yMm', 'largeurMm', 'hauteurMm', 'rotationDeg', 'opacite', 'verrouille', 'visible', propre])) return;
      if (c.chaine(e.id, `${p}.id`, ID)) {
        if (ids.has(e.id as string)) c.err(`${p}.id`, 'identifiant en double');
        ids.add(e.id as string);
      }
      c.chaine(e.nom, `${p}.nom`);
      c.nombre(e.xMm, `${p}.xMm`, -etendue, etendue);
      c.nombre(e.yMm, `${p}.yMm`, -etendue, etendue);
      c.nombre(e.largeurMm, `${p}.largeurMm`, 0.1, etendue);
      c.nombre(e.hauteurMm, `${p}.hauteurMm`, 0.1, etendue);
      c.nombre(e.rotationDeg, `${p}.rotationDeg`, -360, 360);
      c.nombre(e.opacite, `${p}.opacite`, 0, 1);
      c.booleen(e.verrouille, `${p}.verrouille`);
      c.booleen(e.visible, `${p}.visible`);

      if (propre === 'texte' && c.objet(e.texte, `${p}.texte`, ['contenu', 'policeId', 'corpsMm', 'couleur', 'alignement', 'graisse', 'italique', 'interlettrageEm', 'interligne'])) {
        const t = e.texte;
        if (c.chaine(t.contenu, `${p}.texte.contenu`, undefined, BORNES.texteMax)) {
          if (CONTROLE.test(t.contenu as string)) c.err(`${p}.texte.contenu`, 'caractère de contrôle interdit');
          if ((t.contenu as string).split('\n').length > BORNES.lignesMax) c.err(`${p}.texte.contenu`, `au plus ${BORNES.lignesMax} lignes`);
        }
        c.chaine(t.policeId, `${p}.texte.policeId`, POLICE);
        c.nombre(t.corpsMm, `${p}.texte.corpsMm`, 1, 5000);
        c.couleur(t.couleur, `${p}.texte.couleur`);
        c.parmi(t.alignement, `${p}.texte.alignement`, ['left', 'center', 'right']);
        c.parmi(t.graisse, `${p}.texte.graisse`, [400, 700]);
        c.booleen(t.italique, `${p}.texte.italique`);
        c.nombre(t.interlettrageEm, `${p}.texte.interlettrageEm`, -0.2, 1);
        c.nombre(t.interligne, `${p}.texte.interligne`, 0.5, 3);
      }
      if (propre === 'image' && c.objet(e.image, `${p}.image`, ['assetId', 'recadrage', 'ajustement'])) {
        const im = e.image;
        if (!assetIds.has(im.assetId as string)) c.err(`${p}.image.assetId`, 'image inconnue');
        c.parmi(im.ajustement, `${p}.image.ajustement`, ['cover', 'contain']);
        if (c.objet(im.recadrage, `${p}.image.recadrage`, ['x', 'y', 'l', 'h'])) {
          const r = im.recadrage;
          const ok = [c.nombre(r.x, `${p}.image.recadrage.x`, 0, 1), c.nombre(r.y, `${p}.image.recadrage.y`, 0, 1), c.nombre(r.l, `${p}.image.recadrage.l`, 0.001, 1), c.nombre(r.h, `${p}.image.recadrage.h`, 0.001, 1)].every(Boolean);
          if (ok && ((r.x as number) + (r.l as number) > 1 + 1e-9 || (r.y as number) + (r.h as number) > 1 + 1e-9)) c.err(`${p}.image.recadrage`, 'le recadrage sort de l’image');
        }
      }
      if (propre === 'forme' && c.objet(e.forme, `${p}.forme`, ['nature', 'fond', 'contour', 'epaisseurMm', 'rayonMm'])) {
        const fo = e.forme;
        c.parmi(fo.nature, `${p}.forme.nature`, ['rect', 'ellipse', 'ligne']);
        c.couleur(fo.fond, `${p}.forme.fond`, true);
        c.couleur(fo.contour, `${p}.forme.contour`, true);
        c.nombre(fo.epaisseurMm, `${p}.forme.epaisseurMm`, 0, 500);
        c.nombre(fo.rayonMm, `${p}.forme.rayonMm`, 0, 5000);
        if (fo.fond === null && fo.contour === null) c.err(`${p}.forme`, 'une forme doit avoir un fond ou un contour');
      }
    });
  }

  if (c.objet(v.qualite, `${racine}.qualite`, ['distanceLectureM'])) c.parmi(v.qualite.distanceLectureM, `${racine}.qualite.distanceLectureM`, [1, 3, 10]);
  if (c.objet(v.meta, `${racine}.meta`, ['versionRendu', 'createur'])) {
    c.nombre(v.meta.versionRendu, `${racine}.meta.versionRendu`, 1, 1000, true);
    c.parmi(v.meta.createur, `${racine}.meta.createur`, ['client', 'staff', 'modele']);
  }
  return c.erreurs.length ? { ok: false, erreurs: c.erreurs } : { ok: true, document: v as unknown as DocumentBanner };
}

export type ResultatLecture =
  | { ok: true; document: DocumentBanner; migre: boolean }
  | { ok: false; erreur: 'JSON_INVALIDE' | 'SCHEMA_INCONNU' | 'VERSION_INCONNUE' | 'VERSION_FUTURE' | 'DOCUMENT_INVALIDE'; erreurs?: ErreurValidation[] };

/** Lecture tolérante (fichier importé, IndexedDB, modèle) : migration puis validation, jamais d'exception. */
export function lireDocument(entree: unknown): ResultatLecture {
  let brut: unknown = entree;
  if (typeof entree === 'string') {
    try {
      brut = JSON.parse(entree);
    } catch {
      return { ok: false, erreur: 'JSON_INVALIDE' };
    }
  }
  if (!estObjet(brut)) return { ok: false, erreur: 'JSON_INVALIDE' };
  const m = migrer(brut);
  if (!m.ok) return { ok: false, erreur: m.erreur };
  const v = validerDocument(m.brut);
  return v.ok ? { ok: true, document: v.document, migre: m.migre } : { ok: false, erreur: 'DOCUMENT_INVALIDE', erreurs: v.erreurs };
}

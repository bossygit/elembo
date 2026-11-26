/**
 * Banner Studio — modèle de document (version 1).
 *
 * Le document est la seule source de vérité : l'éditeur Konva, l'aperçu et le PDF serveur n'en
 * sont que des projections. Conventions (audit §4.3) :
 * - tout est en **millimètres**, origine en haut à gauche de la surface finie, y vers le bas ;
 * - `xMm`/`yMm` = **centre** de l'élément ; `largeurMm`/`hauteurMm` = cadre non pivoté ;
 *   la rotation (degrés, sens horaire à l'écran) s'applique autour du centre ;
 * - l'ordre de `elements` est l'ordre d'empilement (le premier est au fond) ;
 * - les textes ont des lignes **explicites** (`\n`) : pas de retour à la ligne automatique ;
 * - les images sont **référencées** par `assetId`, jamais embarquées.
 *
 * Module pur : ni React, ni Supabase, ni prix.
 */

import type { FinitionId, SupportId } from '@/lib/grand-format/catalogue';

import type { CategorieId } from './categories';
import { decoration } from './formes';

export const SCHEMA_DOCUMENT = 'elembo.banner';
export const VERSION_DOCUMENT = 1;

/** Supports éditables dans le Studio (« Autre support » passe par le devis manuel). */
export type SupportStudio = Exclude<SupportId, 'AUTRE'>;
/** Finitions éditables dans le Studio (« Autre » passe par le devis manuel). */
export type FinitionStudio = Exclude<FinitionId, 'AUTRE'>;

export type DistanceLecture = 1 | 3 | 10;
export type Alignement = 'left' | 'center' | 'right';
export type Ajustement = 'cover' | 'contain';
/** Décorations dessinées par un chemin original (`formes.ts`), à l'échelle toujours uniforme. */
export const NATURES_DECORATION = ['etoile', 'eclat', 'coeur', 'croix', 'anneaux', 'ruban', 'vague', 'coin', 'triangle', 'fleche'] as const;
export type Decoration = (typeof NATURES_DECORATION)[number];
export type NatureForme = 'rect' | 'ellipse' | 'ligne' | Decoration;

/** Snapshot des contraintes vues par le client (le serveur re-résout le profil au rendu). */
export type ContraintesDocument = {
  margeSecuriteMm: number;
  ourletMm: number;
  fondPerduMm: number;
  laizeMaxMm: number | null;
  longueurMaxMm: number | null;
  oeillets: { actifs: boolean; diametreMm: number; espacementMm: number; margeMm: number };
  fourreaux: { hautMm: number; basMm: number };
  dpiMin: number;
  dpiRecommande: number;
  pageMaxMm: number;
  modeGrandFormat: 'PANNEAUX' | 'PAGE_UNIQUE_USERUNIT';
};

export type Fond =
  | { type: 'couleur'; couleur: string }
  | { type: 'image'; assetId: string; ajustement: Ajustement; couleur: string };

export type Asset = {
  id: string;
  nom: string;
  mime: 'image/jpeg' | 'image/png';
  largeurPx: number;
  hauteurPx: number;
  sha256?: string;
  /** Image d'exemple d'un modèle, à remplacer par le client avant la demande. */
  placeholder?: boolean;
};

/** Recadrage en fractions de l'image source : `x + l ≤ 1`, `y + h ≤ 1`. */
export type Recadrage = { x: number; y: number; l: number; h: number };

type ElementBase = {
  id: string;
  nom: string;
  xMm: number;
  yMm: number;
  largeurMm: number;
  hauteurMm: number;
  rotationDeg: number;
  opacite: number;
  verrouille: boolean;
  visible: boolean;
};

export type StyleTexte = {
  contenu: string;
  policeId: string;
  corpsMm: number;
  couleur: string;
  alignement: Alignement;
  graisse: 400 | 700;
  italique: boolean;
  interlettrageEm: number;
  interligne: number;
};

export type ElementTexte = ElementBase & { type: 'texte'; texte: StyleTexte };
export type ElementImage = ElementBase & {
  type: 'image';
  image: { assetId: string; recadrage: Recadrage; ajustement: Ajustement };
};
export type ElementForme = ElementBase & {
  type: 'forme';
  forme: { nature: NatureForme; fond: string | null; contour: string | null; epaisseurMm: number; rayonMm: number };
};
export type Element = ElementTexte | ElementImage | ElementForme;
export type TypeElement = Element['type'];

export type DocumentBanner = {
  schema: typeof SCHEMA_DOCUMENT;
  version: typeof VERSION_DOCUMENT;
  id: string;
  nom: string;
  creeLe: string;
  modifieLe: string;
  support: SupportStudio;
  categorie: CategorieId | null;
  modeleId: string | null;
  dimensions: { largeurMm: number; hauteurMm: number };
  finition: FinitionStudio;
  profil: { id: string; version: number } | null;
  contraintes: ContraintesDocument;
  fond: Fond;
  assets: Asset[];
  elements: Element[];
  qualite: { distanceLectureM: DistanceLecture };
  meta: { versionRendu: number; createur: 'client' | 'staff' | 'modele' };
};

/* ------------------------------------------------------------ fabriques -- */

export type Fabrique = { id?: () => string; maintenant?: () => Date };

const idParDefaut = () => globalThis.crypto.randomUUID();

/** Contraintes neutres : remplacées par `resoudreContraintes` dès qu'un profil est connu. */
export const CONTRAINTES_NEUTRES: ContraintesDocument = {
  margeSecuriteMm: 50,
  ourletMm: 0,
  fondPerduMm: 0,
  laizeMaxMm: null,
  longueurMaxMm: null,
  oeillets: { actifs: false, diametreMm: 20, espacementMm: 500, margeMm: 30 },
  fourreaux: { hautMm: 0, basMm: 0 },
  dpiMin: 72,
  dpiRecommande: 150,
  pageMaxMm: 5080,
  modeGrandFormat: 'PANNEAUX',
};

export function creerDocument(
  options: {
    support: SupportStudio;
    largeurMm: number;
    hauteurMm: number;
    finition?: FinitionStudio;
    nom?: string;
    categorie?: CategorieId | null;
    contraintes?: ContraintesDocument;
  },
  { id = idParDefaut, maintenant = () => new Date() }: Fabrique = {},
): DocumentBanner {
  const date = maintenant().toISOString();
  return {
    schema: SCHEMA_DOCUMENT,
    version: VERSION_DOCUMENT,
    id: id(),
    nom: options.nom ?? 'Ma banderole',
    creeLe: date,
    modifieLe: date,
    support: options.support,
    categorie: options.categorie ?? null,
    modeleId: null,
    dimensions: { largeurMm: options.largeurMm, hauteurMm: options.hauteurMm },
    finition: options.finition ?? 'SANS',
    profil: null,
    contraintes: structuredClone(options.contraintes ?? CONTRAINTES_NEUTRES),
    fond: { type: 'couleur', couleur: '#FFFFFF' },
    assets: [],
    elements: [],
    qualite: { distanceLectureM: 3 },
    meta: { versionRendu: 1, createur: 'client' },
  };
}

const base = (doc: DocumentBanner, nom: string, largeurMm: number, hauteurMm: number, id: () => string): ElementBase => ({
  id: id(),
  nom,
  xMm: doc.dimensions.largeurMm / 2,
  yMm: doc.dimensions.hauteurMm / 2,
  largeurMm,
  hauteurMm,
  rotationDeg: 0,
  opacite: 1,
  verrouille: false,
  visible: true,
});

/** Un texte centré, dont le corps suit la hauteur de la banderole. */
export function creerTexte(doc: DocumentBanner, contenu = 'Votre texte', { id = idParDefaut }: Fabrique = {}): ElementTexte {
  const corpsMm = Math.round(doc.dimensions.hauteurMm * 0.12);
  const lignes = contenu.split('\n').length;
  return {
    ...base(doc, 'Texte', doc.dimensions.largeurMm * 0.6, corpsMm * 1.2 * lignes, id),
    type: 'texte',
    texte: {
      contenu,
      policeId: 'montserrat',
      corpsMm,
      couleur: '#18181A',
      alignement: 'center',
      graisse: 700,
      italique: false,
      interlettrageEm: 0,
      interligne: 1.2,
    },
  };
}

/** Une image entière (`contain`), dimensionnée à 60 % de la hauteur de la banderole. */
export function creerImage(doc: DocumentBanner, asset: Asset, { id = idParDefaut }: Fabrique = {}): ElementImage {
  const hauteurMm = doc.dimensions.hauteurMm * 0.6;
  const largeurMm = (hauteurMm * asset.largeurPx) / asset.hauteurPx;
  return {
    ...base(doc, asset.nom, largeurMm, hauteurMm, id),
    type: 'image',
    image: { assetId: asset.id, recadrage: { x: 0, y: 0, l: 1, h: 1 }, ajustement: 'contain' },
  };
}

export function creerForme(doc: DocumentBanner, nature: NatureForme = 'rect', { id = idParDefaut }: Fabrique = {}): ElementForme {
  const d = decoration(nature);
  // Une décoration allongée tient aussi dans un format portrait.
  const cote = Math.round(Math.min(doc.dimensions.hauteurMm * 0.3, d ? (doc.dimensions.largeurMm * 0.6 * d.hauteur) / d.largeur : Infinity));
  const [largeurMm, hauteurMm] = d ? [Math.round((cote * d.largeur) / d.hauteur), cote] : nature === 'ligne' ? [cote * 3, 5] : [cote, cote];
  return {
    ...base(doc, d?.nom ?? (nature === 'ligne' ? 'Filet' : nature === 'ellipse' ? 'Ellipse' : 'Rectangle'), largeurMm, hauteurMm, id),
    type: 'forme',
    forme: { nature, fond: nature === 'ligne' ? '#18181A' : '#E87A2E', contour: null, epaisseurMm: 0, rayonMm: 0 },
  };
}

/* ---------------------------------------------------- versions, lecture -- */

/**
 * Migrations successives : `MIGRATIONS[n]` transforme un document de version `n` en `n + 1`.
 * Aucune pour l'instant ; la mécanique est testée avec des migrations injectées.
 */
export type Migration = (brut: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

export type ResultatMigration =
  | { ok: true; brut: Record<string, unknown>; migre: boolean }
  | { ok: false; erreur: 'SCHEMA_INCONNU' | 'VERSION_INCONNUE' | 'VERSION_FUTURE' };

/** Amène un objet brut à la version courante, sans le valider (voir `schema.ts`). */
export function migrer(
  brut: Record<string, unknown>,
  { migrations = MIGRATIONS, versionCourante = VERSION_DOCUMENT }: { migrations?: Record<number, Migration>; versionCourante?: number } = {},
): ResultatMigration {
  if (brut.schema !== SCHEMA_DOCUMENT) return { ok: false, erreur: 'SCHEMA_INCONNU' };
  let version = brut.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, erreur: 'VERSION_INCONNUE' };
  // Un document plus récent que le moteur : lecture seule côté interface, jamais de rendu.
  if (version > versionCourante) return { ok: false, erreur: 'VERSION_FUTURE' };
  let courant = brut;
  while (version < versionCourante) {
    const etape = migrations[version];
    if (!etape) return { ok: false, erreur: 'VERSION_INCONNUE' };
    courant = { ...etape(courant), version: version + 1 };
    version += 1;
  }
  return { ok: true, brut: courant, migre: courant !== brut };
}

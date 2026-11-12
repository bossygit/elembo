// Types du configurateur 3D — une seule source de vérité, partagée par le Canvas 2D
// (éditeur) et par Three.js (rendu), conformément à l'architecture visée.
//
// Un design n'est plus « un visuel » mais une LISTE D'ÉLÉMENTS indépendants (image ou
// texte), chacun avec sa position, son échelle, sa rotation et sa face. Le Canvas 2D les
// compose dans l'ordre des calques ; Three.js ne reçoit qu'une texture finale.

/**
 * Zone d'impression du vêtement. Le nom historique `Side` est conservé (il est utilisé
 * partout) ; un T-shirt Elembo en expose cinq, un produit plus simple seulement avant/dos.
 */
export type Side = 'front' | 'back' | 'left-sleeve' | 'right-sleeve' | 'collar';

/** Ordre d'affichage et de production des zones. */
export const SIDES: Side[] = ['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'];

export const SIDE_LABELS: Record<Side, string> = {
  front: 'Face avant',
  back: 'Face arrière',
  'left-sleeve': 'Manche gauche',
  'right-sleeve': 'Manche droite',
  collar: 'Intérieur du col',
};

/** Libellé court (navigation, pastilles). */
export const SIDE_SHORT: Record<Side, string> = {
  front: 'Avant',
  back: 'Dos',
  'left-sleeve': 'Manche G.',
  'right-sleeve': 'Manche D.',
  collar: 'Col',
};

/** Nom du fichier de production d'une zone (sans la référence de commande). */
export const SIDE_FILE: Record<Side, string> = {
  front: 'front.png',
  back: 'back.png',
  'left-sleeve': 'left-sleeve.png',
  'right-sleeve': 'right-sleeve.png',
  collar: 'collar.png',
};

export function isSide(value: unknown): value is Side {
  return typeof value === 'string' && (SIDES as string[]).includes(value);
}

/** Propriétés communes à tout élément posé sur le vêtement. */
export type ElementBase = {
  id: string;
  /**
   * Centre de l'élément, en fraction de la zone d'impression
   * (0 = bord gauche/haut de la zone, 0,5 = centre, 1 = bord droit/bas).
   */
  x: number;
  y: number;
  /** Échelle relative (1 = taille par défaut de l'élément). */
  scale: number;
  /** Rotation, en degrés. */
  rotation: number;
  /** Face du vêtement qui porte l'élément. */
  side: Side;
  /** Ordre d'empilement : un `z` plus grand est dessiné au-dessus. */
  z: number;
  /** Masqué (l'élément reste dans la liste et la configuration). */
  visible: boolean;
};

/**
 * Image déposée par l'utilisateur. `src` est un object URL de session, jamais persisté ;
 * `assetId` désigne le fichier d'origine conservé sur l'appareil (IndexedDB), ce qui
 * permet de retrouver le projet après un rechargement ou depuis le panier.
 */
export type ImageElement = ElementBase & {
  type: 'image';
  src: string;
  assetId?: string;
  name: string;
  /** Dimensions natives, en pixels — servent au « contain » dans la zone. */
  width: number;
  height: number;
};

export type TextAlign = 'left' | 'center' | 'right';

/** Bloc de texte composé dans le canvas. */
export type TextElement = ElementBase & {
  type: 'text';
  content: string;
  /** Identifiant de police (voir src/lib/fonts.ts) — stable, indépendant du libellé. */
  fontId: string;
  /** Taille de police en pixels de l'espace de composition de référence (largeur 1024). */
  fontSize: number;
  color: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  /** Interlettrage, en cadratins (em). */
  letterSpacing: number;
  /** Hauteur de ligne, multiple de la taille de police. */
  lineHeight: number;
  align: TextAlign;
};

export type DesignElement = ImageElement | TextElement;

export const TEXT_LIMITS = {
  contentMax: 240,
  fontSizeMin: 12,
  fontSizeMax: 420,
  letterSpacingMin: -0.1,
  letterSpacingMax: 0.6,
  lineHeightMin: 0.8,
  lineHeightMax: 2.4,
} as const;

export const ELEMENT_LIMITS = {
  scaleMin: 0.1,
  scaleMax: 3,
  rotationMin: -180,
  rotationMax: 180,
  /** Marge de sécurité (fraction de la zone) : un élément ne colle jamais au bord. */
  margin: 0.015,
  /** Déplacement au clavier (fraction de la zone par pression). */
  nudge: 0.01,
} as const;

/**
 * Bornes de l'ancien modèle « un visuel + une transformation » (studio 2D), conservées
 * telles quelles pour ne rien changer à l'existant : les éléments du configurateur 3D
 * utilisent ELEMENT_LIMITS, plus larges (une poignée de redimensionnement va jusqu'à 3×).
 */
export const TRANSFORM_LIMITS = {
  scaleMin: 0.2,
  scaleMax: 2,
  rotationMin: -180,
  rotationMax: 180,
} as const;

/** Transformation du visuel (ancien modèle, studio 2D) : x, y en fraction de la zone. */
export type DesignTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

/** Visuel utilisateur de l'ancien modèle — remplacé par ImageElement. */
export type DesignAsset = {
  originalUrl: string;
  name: string;
  width: number;
  height: number;
};

/**
 * Palette proposée pour la couleur du texte. Le sélecteur libre permet n'importe
 * quelle couleur ; ces valeurs couvrent les cas courants en impression textile.
 */
export const TEXT_COLORS = [
  '#FFFFFF',
  '#000000',
  '#1A1A1A',
  '#C62828',
  '#E85F00',
  '#F2C300',
  '#2E7D32',
  '#1565C0',
  '#6A1B9A',
  '#EC407A',
] as const;

/** Ancienne forme (v1) : un seul visuel + une transformation. Lue, jamais écrite. */
export type LegacyDesign = {
  imageUrl: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

/** Élément texte tel qu'il est persisté (voir SerializedElement). */
export type SerializedTextElement = TextElement & { fontFamily?: string };

/**
 * Configuration sérialisable. Les images ne sont pas embarquées (object URL de session) :
 * seule leur mise en page l'est, avec leur nom et leurs dimensions natives.
 */
export type SerializedElement =
  | (Omit<ImageElement, 'src'> & { src?: string })
  | SerializedTextElement;

export type ConfiguratorConfig = {
  /** 2 : avant/arrière ; 3 : zones multiples, procédé de production, fichiers d'origine. */
  version: 2 | 3;
  productId: string;
  color: string;
  side: Side;
  /** Procédé de production choisi (voir production/profils.json). */
  profileId?: string;
  /** Ordre = calques, du dessous au dessus. */
  elements: SerializedElement[];
};

/**
 * Univers, collections et kits d'événement — l'offre organisée par INTENTION (offrir,
 * s'exprimer, célébrer, se souvenir) plutôt que par technique d'impression.
 *
 * Données statiques : les produits sont référencés par leur `id` dans `PRODUITS_VITRINE`,
 * jamais dupliqués. Les prix restent ceux de `tarifs/grille.json`.
 *
 * RÈGLE LANGUES : aucune expression en lingala ou en kituba n'est publiée sans validation par
 * un locuteur natif. Un texte `aValider: true` est un emplacement réservé : il n'est JAMAIS
 * affiché au public (voir `textesPublics`). `tests/univers.test.ts` liste ceux qui restent.
 */

import { PRODUITS_VITRINE, type Gamme, type ProduitVitrine } from './catalogue';

export type UniversId = 'cadeaux' | 'identite' | 'evenements' | 'quotidien' | 'memoire';

export type Registre = 'Culture urbaine' | 'Patrimoine culturel' | 'Créativité contemporaine' | 'Vie sociale';

export type Langue = 'français' | 'lingala' | 'kituba';

export type TexteCollection = {
  texte: string;
  langue: Langue;
  /** Traduction française, affichée sous le texte original. */
  traduction?: string;
  /** `true` = emplacement réservé, à remplacer par un texte validé. Jamais affiché. */
  aValider: boolean;
};

export type Collection = {
  id: string;
  titre: string;
  univers: UniversId;
  registre: Registre;
  langues: Langue[];
  description: string;
  supports: string[];
  textes: TexteCollection[];
};

export type KitEvenement = {
  id: string;
  titre: string;
  description: string;
  contenu: string[];
  gamme: Gamme;
};

export type Univers = {
  id: UniversId;
  numero: string;
  titre: string;
  accroche: string;
  description: string;
  occasions: string[];
  exemple: string;
  image: { src: string; alt: string };
  /** Ids de `PRODUITS_VITRINE`. */
  produits: string[];
  /** Ids de `COLLECTIONS`. */
  collections: string[];
  /** Clé du message WhatsApp pré-rempli. */
  messageWhatsApp: 'cadeau' | 'evenement' | 'general';
  ctaWhatsApp: string;
};

export const REGISTRES: { titre: Registre; description: string }[] = [
  { titre: 'Culture urbaine', description: 'Expressions, musique, humour, streetwear.' },
  { titre: 'Patrimoine culturel', description: 'Traditions, symboles, artisanat, histoire.' },
  { titre: 'Créativité contemporaine', description: 'Illustration, design, photographie, typographie.' },
  { titre: 'Vie sociale', description: 'Famille, amitié, amour, réussite, célébration.' },
];

export const UNIVERS: Univers[] = [
  {
    id: 'cadeaux',
    numero: '01',
    titre: 'Cadeaux & émotions',
    accroche: 'Offrez une attention qui parle d’elle-même.',
    description:
      'Une photo, un prénom, quelques mots dans la langue de la famille : l’objet devient un souvenir. Pour dire merci, je t’aime ou bravo.',
    occasions: [
      'Anniversaires et fêtes',
      'Cadeaux pour couples',
      'Fête des mères et fête des pères',
      'Cadeaux avec photos et messages',
      'Remerciements et reconnaissance',
    ],
    exemple: 'Offrir à sa mère un mug avec sa photo et un message en lingala.',
    image: { src: '/mockups/cadre-salon.jpg', alt: 'Cadre photo personnalisé posé dans un salon' },
    produits: ['mug-personnalise', 'tshirt-basic', 'tableau-canvas', 'coffret-cadeau'],
    collections: ['pour-maman'],
    messageWhatsApp: 'cadeau',
    ctaWhatsApp: 'Préparer mon cadeau sur WhatsApp',
  },
  {
    id: 'identite',
    numero: '02',
    titre: 'Identité & culture',
    accroche: 'Portez ce qui vous ressemble.',
    description:
      'Nos expressions, nos villes, notre musique, notre humour. Des designs qui parlent aux Congolais, en français, en lingala et en kituba.',
    occasions: [
      'Expressions populaires congolaises',
      'Designs inspirés de Brazzaville, Pointe-Noire et d’autres villes',
      'Motifs inspirés du patrimoine',
      'Musique, danse et culture urbaine',
      'Collections en français, lingala et kituba',
    ],
    exemple: 'Une collection de t-shirts autour des expressions populaires de Brazzaville.',
    image: { src: '/mockups/tshirt-studio.jpg', alt: 'T-shirt blanc prêt à recevoir un design' },
    produits: ['tshirt-basic', 'tshirt-alt', 'tote-bag'],
    collections: ['expressions-brazzaville'],
    messageWhatsApp: 'general',
    ctaWhatsApp: 'Proposer mon idée sur WhatsApp',
  },
  {
    id: 'evenements',
    numero: '03',
    titre: 'Événements & célébrations',
    accroche: 'Vos grands moments, aux couleurs de la famille.',
    description:
      'Mariage, dot, baptême, retrouvailles : des t-shirts assortis, des souvenirs pour les invités et des objets qui gardent la date en mémoire.',
    occasions: [
      'Mariages et fiançailles',
      'Dot et cérémonies familiales',
      'Baptêmes et anniversaires',
      'Retrouvailles et réunions de famille',
      'Événements religieux et associatifs',
    ],
    exemple: 'Un kit de mariage avec des t-shirts, des mugs, des badges et des souvenirs personnalisés.',
    image: { src: '/mockups/textile-lot.jpg', alt: 'Pile de t-shirts pour un événement' },
    produits: ['textile-evenement', 'tshirt-alt', 'mug-personnalise', 'tote-bag'],
    collections: [],
    messageWhatsApp: 'evenement',
    ctaWhatsApp: 'Parler de mon événement sur WhatsApp',
  },
  {
    id: 'quotidien',
    numero: '04',
    titre: 'Vie quotidienne & aspirations',
    accroche: 'Célébrez chaque réussite.',
    description:
      'Un diplôme obtenu, une entreprise qui démarre, une passion pour le foot ou la rumba : des objets du quotidien qui racontent votre parcours.',
    occasions: [
      'Réussite scolaire et universitaire',
      'Produits pour étudiants',
      'Accessoires pour la maison',
      'Jeunes entrepreneurs',
      'Passionnés de sport et de musique',
    ],
    exemple: 'Une collection spéciale pour les diplômés des universités congolaises.',
    image: { src: '/mockups/tote-bag.jpg', alt: 'Tote bag en toile naturelle' },
    produits: ['tshirt-basic', 'mug-personnalise', 'tote-bag', 'tableau-canvas'],
    collections: ['diplomes'],
    messageWhatsApp: 'general',
    ctaWhatsApp: 'Demander conseil sur WhatsApp',
  },
  {
    id: 'memoire',
    numero: '05',
    titre: 'Mémoire & attachement au Congo',
    accroche: 'Le pays, toujours avec soi.',
    description:
      'Pour ceux qui vivent loin, ceux qui reviennent et ceux qui veulent transmettre : des souvenirs qui entretiennent le lien avec la famille et le pays.',
    occasions: [
      'Souvenirs de Brazzaville et du Congo',
      'Cadeaux pour la diaspora',
      'Références aux quartiers et aux villes',
      'Histoire et patrimoine',
      'Garder le lien avec la famille',
    ],
    exemple: 'La collection « Mon Congo, mon histoire » pour les Congolais vivant à l’étranger.',
    image: { src: '/mockups/tableau-interieur.jpg', alt: 'Tableau photo accroché dans un intérieur' },
    produits: ['tableau-canvas', 'tshirt-basic', 'mug-personnalise'],
    collections: ['mon-congo'],
    messageWhatsApp: 'cadeau',
    ctaWhatsApp: 'Envoyer un souvenir au pays',
  },
];

/**
 * Collections d'amorce. Les textes en lingala et en kituba sont des EMPLACEMENTS à remplacer
 * par des expressions validées — ils ne sont pas affichés tant que `aValider` est vrai.
 */
export const COLLECTIONS: Collection[] = [
  {
    id: 'expressions-brazzaville',
    titre: 'Expressions de Brazzaville',
    univers: 'identite',
    registre: 'Culture urbaine',
    langues: ['lingala', 'français'],
    description:
      'Les mots qu’on entend au marché, dans le bus et entre amis, portés fièrement sur un t-shirt.',
    supports: ['T-shirts', 'Tote bags'],
    textes: [
      { texte: '[Expression populaire de Brazzaville n° 1 — à valider]', langue: 'lingala', aValider: true },
      { texte: '[Expression populaire de Brazzaville n° 2 — à valider]', langue: 'lingala', aValider: true },
      { texte: '[Expression populaire de Brazzaville n° 3 — à valider]', langue: 'lingala', aValider: true },
    ],
  },
  {
    id: 'pour-maman',
    titre: 'Pour Maman',
    univers: 'cadeaux',
    registre: 'Vie sociale',
    langues: ['français', 'lingala'],
    description:
      'Pour la fête des mères, un anniversaire ou simplement pour dire merci : sa photo et un mot doux, en français ou en lingala.',
    supports: ['Mugs', 'Tableaux photo', 'T-shirts'],
    textes: [
      { texte: 'Merci pour tout, Maman.', langue: 'français', aValider: false },
      { texte: '[Message à Maman en lingala — à valider]', langue: 'lingala', aValider: true },
    ],
  },
  {
    id: 'diplomes',
    titre: 'Diplômés du Congo',
    univers: 'quotidien',
    registre: 'Vie sociale',
    langues: ['français'],
    description:
      'Pour la remise des diplômes : le nom de la promotion, l’université et l’année, sur un t-shirt ou un mug souvenir.',
    supports: ['T-shirts de promotion', 'Mugs', 'Tableaux photo'],
    textes: [
      { texte: 'Promotion 2026', langue: 'français', aValider: false },
      { texte: 'Diplômé·e et fier·e', langue: 'français', aValider: false },
    ],
  },
  {
    id: 'mon-congo',
    titre: 'Mon Congo, mon histoire',
    univers: 'memoire',
    registre: 'Patrimoine culturel',
    langues: ['français', 'lingala', 'kituba'],
    description:
      'Pour les Congolais de la diaspora et ceux qui veulent transmettre : les villes, les quartiers et les souvenirs du pays.',
    supports: ['Tableaux photo', 'T-shirts', 'Mugs'],
    textes: [
      { texte: 'Brazzaville, toujours dans mon cœur.', langue: 'français', aValider: false },
      { texte: '[Phrase sur Pointe-Noire en kituba — à valider]', langue: 'kituba', aValider: true },
      { texte: '[Phrase sur le pays en lingala — à valider]', langue: 'lingala', aValider: true },
    ],
  },
];

export const KITS_EVENEMENT: KitEvenement[] = [
  {
    id: 'mariage',
    titre: 'Mariage & fiançailles',
    description: 'Une tenue commune pour les proches et des souvenirs pour les invités.',
    contenu: [
      'T-shirts assortis pour la famille et les amis',
      'Mugs souvenirs aux prénoms des mariés',
      'Badges et tote bags pour les invités',
      'Tableau photo du couple',
    ],
    gamme: 'premium',
  },
  {
    id: 'dot',
    titre: 'Dot & cérémonies familiales',
    description: 'Les deux familles réunies, chacune à ses couleurs.',
    contenu: [
      'T-shirts aux couleurs de chaque famille',
      'Souvenirs personnalisés pour les invités',
      'Tableau photo de la cérémonie',
    ],
    gamme: 'premium',
  },
  {
    id: 'bapteme',
    titre: 'Baptême & anniversaire',
    description: 'Le prénom et la date, sur tout ce qui fait la fête.',
    contenu: [
      'T-shirts de la famille au prénom de l’enfant',
      'Mugs souvenirs pour les parrains et marraines',
      'Cadre photo du jour',
    ],
    gamme: 'personnalisee',
  },
  {
    id: 'retrouvailles',
    titre: 'Retrouvailles & réunions de famille',
    description: 'Une famille ou une promotion, enfin réunie sur la même photo.',
    contenu: [
      'T-shirts de la famille ou de la promotion',
      'Souvenirs avec la date et le lieu',
      'Tableau photo de groupe',
    ],
    gamme: 'personnalisee',
  },
  {
    id: 'eglise-association',
    titre: 'Événements religieux & associatifs',
    description: 'Chorales, groupes de prière, associations : une identité commune.',
    contenu: [
      'T-shirts de chorale, de groupe ou d’association',
      'Tote bags et badges pour les membres',
      'Programmes et affiches imprimés',
    ],
    gamme: 'personnalisee',
  },
];

export function universParId(id: string): Univers | undefined {
  return UNIVERS.find((u) => u.id === id);
}

export function produitsDeUnivers(univers: Univers): ProduitVitrine[] {
  return univers.produits
    .map((id) => PRODUITS_VITRINE.find((p) => p.id === id))
    .filter((p): p is ProduitVitrine => p !== undefined);
}

export function collectionsDeUnivers(univers: Univers): Collection[] {
  return univers.collections
    .map((id) => COLLECTIONS.find((c) => c.id === id))
    .filter((c): c is Collection => c !== undefined);
}

/** Seuls les textes validés sont montrés au public. */
export function textesPublics(collection: Collection): TexteCollection[] {
  return collection.textes.filter((t) => !t.aValider);
}

/** Nombre de textes qui attendent encore une validation linguistique. */
export function nombreTextesAValider(collection: Collection): number {
  return collection.textes.filter((t) => t.aValider).length;
}

/** Liste de travail pour l'équipe : tous les emplacements à remplacer. */
export function textesAValider(): { collection: string; langue: Langue; texte: string }[] {
  return COLLECTIONS.flatMap((c) =>
    c.textes.filter((t) => t.aValider).map((t) => ({ collection: c.id, langue: t.langue, texte: t.texte })),
  );
}

/**
 * Offre « Banderoles & supports grand format » — référentiel commercial.
 *
 * Une seule source pour la vitrine, le parcours de commande, la validation serveur et le
 * back-office. Ce fichier ne contient AUCUN prix : les montants viennent exclusivement de la
 * grille `tarifs_grand_format` (Supabase), et seulement lorsqu'elle est validée par Smart Vision.
 *
 * Les identifiants (`DEUIL`, `BANDEROLE`, `OEILLETS`…) sont aussi les valeurs autorisées par les
 * contraintes CHECK de la migration `20261113120000_grand_format.sql`. Le test
 * `grandFormatCatalogue.test.ts` vérifie l'alignement.
 */

export type UsageId = 'DEUIL' | 'EGLISE' | 'EVENEMENT' | 'PUBLICITE' | 'INSTITUTION' | 'AUTRE';
export type SupportId = 'BANDEROLE' | 'BACHE' | 'ROLL_UP' | 'KAKEMONO' | 'X_BANNER' | 'PANNEAU' | 'AUTRE';
export type FinitionId = 'SANS' | 'OEILLETS' | 'OURLETS' | 'OURLETS_OEILLETS' | 'FOURREAUX' | 'AUTRE';
export type DelaiId = 'STANDARD' | 'EXPRESS' | 'DATE';
export type PrestationId = 'FICHIER_PRET' | 'CREATION' | 'ACCOMPAGNEMENT';

/** Bornes de saisie. Une banderole hors de ces bornes reste possible, mais par devis manuel. */
export const LIMITES = {
  dimensionMinM: 0.2,
  dimensionMaxM: 50,
  quantiteMax: 1000,
  commentaireMax: 2000,
  precisionMax: 200,
} as const;

/* -------------------------------------------------------------- usages ---- */

export type Usage = {
  id: UsageId;
  slug: string;
  titre: string;
  accroche: string;
  description: string;
  occasions: string[];
  /** Support proposé par défaut quand le client arrive depuis cette catégorie. */
  supportDefaut: SupportId;
  /** Format le plus demandé, en mètres (proposé, jamais imposé). */
  formatConseille: { largeurM: number; hauteurM: number };
  conseil: string;
};

export const USAGES: Usage[] = [
  {
    id: 'DEUIL',
    slug: 'deuil',
    titre: 'Deuil & hommage',
    accroche: 'Honorer la mémoire d’un proche, avec dignité.',
    description:
      'Banderoles de veillée, de levée de corps, d’hommage au domicile ou de retrait de deuil. Nous traitons ces demandes en priorité, avec discrétion et le soin qu’elles méritent.',
    occasions: ['Veillée et domicile', 'Levée de corps', 'Hommage d’entreprise', 'Retrait de deuil'],
    supportDefaut: 'BANDEROLE',
    formatConseille: { largeurM: 3, hauteurM: 1 },
    conseil: 'Une photo nette du défunt, son nom complet, ses dates et la mention souhaitée suffisent : nous composons le reste.',
  },
  {
    id: 'EGLISE',
    slug: 'eglise',
    titre: 'Églises & ministères',
    accroche: 'Annoncer la croisade, rassembler les fidèles.',
    description:
      'Croisades, conventions, cultes spéciaux, campagnes d’évangélisation, concerts de louange. Des visuels lisibles de loin, pour la façade, la route ou l’estrade.',
    occasions: ['Croisade et évangélisation', 'Convention et séminaire', 'Culte d’action de grâce', 'Concert de louange'],
    supportDefaut: 'BANDEROLE',
    formatConseille: { largeurM: 5, hauteurM: 1 },
    conseil: 'Indiquez le thème, le verset, les orateurs, les dates et le lieu exacts — et le logo de l’assemblée si vous l’avez.',
  },
  {
    id: 'EVENEMENT',
    slug: 'evenements',
    titre: 'Événements & célébrations',
    accroche: 'Mariages, dots, anniversaires : marquer le jour.',
    description:
      'Mariages, dots, baptêmes, anniversaires, remises de diplômes, conférences. Une banderole d’accueil ou de fond de scène qui rend le moment mémorable — et beau en photo.',
    occasions: ['Mariage et dot', 'Anniversaire', 'Baptême et communion', 'Conférence et remise de diplômes'],
    supportDefaut: 'BANDEROLE',
    formatConseille: { largeurM: 3, hauteurM: 1.5 },
    conseil: 'Prénoms, date, lieu et deux ou trois photos : nous proposons une mise en page à votre image.',
  },
  {
    id: 'PUBLICITE',
    slug: 'publicite',
    titre: 'Publicité & commerce',
    accroche: 'Ouverture, promotion, inauguration : se faire voir.',
    description:
      'Ouvertures de boutique, promotions, inaugurations, devantures et stands. Des messages courts et contrastés, conçus pour être lus en passant.',
    occasions: ['Ouverture et inauguration', 'Promotion et soldes', 'Devanture et façade', 'Stand et salon'],
    supportDefaut: 'BANDEROLE',
    formatConseille: { largeurM: 4, hauteurM: 1 },
    conseil: 'Un message principal, une offre, un numéro de téléphone : moins il y a de texte, mieux la banderole travaille.',
  },
  {
    id: 'INSTITUTION',
    slug: 'institutions',
    titre: 'Institutions & associations',
    accroche: 'Sensibiliser, informer, mobiliser.',
    description:
      'Campagnes de sensibilisation, journées mondiales, santé publique, communication d’ONG, d’écoles et d’administrations. Des supports conformes à votre charte, livrés à temps.',
    occasions: ['Campagne de sensibilisation', 'Journée mondiale', 'Santé publique', 'École et administration'],
    supportDefaut: 'BANDEROLE',
    formatConseille: { largeurM: 4, hauteurM: 1 },
    conseil: 'Joignez votre charte graphique et les logos partenaires : nous respectons vos règles d’usage.',
  },
  {
    id: 'AUTRE',
    slug: 'autres-supports',
    titre: 'Autres supports grand format',
    accroche: 'Roll-up, kakémono, bâche, panneau.',
    description:
      'Roll-ups pour les salons, kakémonos, X-banners, bâches de façade et panneaux rigides. Produits avec nos imprimeurs partenaires selon leurs capacités.',
    occasions: ['Roll-up de salon', 'Kakémono', 'Bâche de façade', 'Panneau rigide'],
    supportDefaut: 'ROLL_UP',
    formatConseille: { largeurM: 0.85, hauteurM: 2 },
    conseil: 'Dites-nous où le support sera installé (intérieur, extérieur, durée) : nous conseillons la bonne matière.',
  },
];

/* ------------------------------------------------------------- supports ---- */

export type Support = {
  id: SupportId;
  nom: string;
  description: string;
  /** Les finitions (œillets, ourlets…) n'ont de sens que pour les supports souples. */
  finitionsApplicables: boolean;
  /** Format standard du marché, proposé dans le formulaire (le client peut le modifier). */
  formatStandard?: { largeurM: number; hauteurM: number };
};

export const SUPPORTS: Support[] = [
  { id: 'BANDEROLE', nom: 'Banderole', description: 'Bâche PVC souple, impression couleur, pour l’extérieur comme l’intérieur.', finitionsApplicables: true },
  { id: 'BACHE', nom: 'Bâche de façade', description: 'Grand visuel tendu sur un mur ou une structure.', finitionsApplicables: true },
  { id: 'ROLL_UP', nom: 'Roll-up', description: 'Visuel enroulable sur pied, avec sa housse de transport.', finitionsApplicables: false, formatStandard: { largeurM: 0.85, hauteurM: 2 } },
  { id: 'KAKEMONO', nom: 'Kakémono', description: 'Visuel vertical suspendu, baguettes haute et basse.', finitionsApplicables: false, formatStandard: { largeurM: 0.8, hauteurM: 1.8 } },
  { id: 'X_BANNER', nom: 'X-banner', description: 'Visuel léger sur structure en X, idéal pour l’intérieur.', finitionsApplicables: false, formatStandard: { largeurM: 0.6, hauteurM: 1.6 } },
  { id: 'PANNEAU', nom: 'Panneau rigide', description: 'Impression sur panneau (akylux, forex, dibond) pour une pose durable.', finitionsApplicables: false },
  { id: 'AUTRE', nom: 'Autre support', description: 'Décrivez-le : nous vérifions avec nos partenaires.', finitionsApplicables: false },
];

/* ------------------------------------------------------------ finitions ---- */

export const FINITIONS: { id: FinitionId; nom: string; description: string }[] = [
  { id: 'OEILLETS', nom: 'Œillets', description: 'Anneaux métalliques sur le pourtour, pour fixer avec des cordes ou des colliers.' },
  { id: 'OURLETS_OEILLETS', nom: 'Ourlets + œillets', description: 'Bords renforcés et œillets : le plus solide en extérieur et au vent.' },
  { id: 'OURLETS', nom: 'Ourlets', description: 'Bords repliés et soudés : une tenue nette, sans perforation.' },
  { id: 'FOURREAUX', nom: 'Fourreaux', description: 'Passages en haut et en bas pour glisser une perche ou un tube.' },
  { id: 'SANS', nom: 'Sans finition', description: 'Coupe franche au format, à fixer vous-même.' },
  { id: 'AUTRE', nom: 'Autre', description: 'Une finition particulière : précisez-la.' },
];

/* --------------------------------------------------------------- délais ---- */

export const DELAIS: { id: DelaiId; nom: string; description: string }[] = [
  { id: 'STANDARD', nom: 'Délai habituel', description: 'Le délai de production est confirmé dans votre devis.' },
  { id: 'DATE', nom: 'Pour une date précise', description: 'Indiquez la date de votre événement : nous la vérifions avec l’imprimeur.' },
  { id: 'EXPRESS', nom: 'Urgent (48 à 72 h)', description: 'Sous réserve de faisabilité ; un supplément peut s’appliquer.' },
];

/* ----------------------------------------------------------- prestations ---- */

export const PRESTATIONS: { id: PrestationId; nom: string; description: string; aide: string }[] = [
  {
    id: 'FICHIER_PRET',
    nom: 'J’ai mon fichier',
    description: 'Vous fournissez un visuel prêt à imprimer. Nous le contrôlons avant production.',
    aide: 'Idéalement un PDF ou une image haute résolution aux bonnes proportions.',
  },
  {
    id: 'CREATION',
    nom: 'Créez mon visuel',
    description: 'Notre studio conçoit la banderole à partir de vos textes, photos et logos.',
    aide: 'Vous validez une maquette avant toute impression.',
  },
  {
    id: 'ACCOMPAGNEMENT',
    nom: 'Conseillez-moi',
    description: 'Décrivez votre besoin : nous revenons vers vous avec une proposition adaptée.',
    aide: 'Support, format, quantité, finition : on vous aide à choisir.',
  },
];

/* --------------------------------------------------------------- outils ---- */

export const usageParId = (id: string) => USAGES.find((u) => u.id === id);
export const usageParSlug = (slug: string) => USAGES.find((u) => u.slug === slug);
export const supportParId = (id: string) => SUPPORTS.find((s) => s.id === id);
export const finitionParId = (id: string) => FINITIONS.find((f) => f.id === id);
export const delaiParId = (id: string) => DELAIS.find((d) => d.id === id);
export const prestationParId = (id: string) => PRESTATIONS.find((p) => p.id === id);

export function libelleUsage(id: string): string {
  return usageParId(id)?.titre ?? id;
}
export function libelleSupport(id: string): string {
  return supportParId(id)?.nom ?? id;
}
export function libelleFinition(id: string): string {
  return finitionParId(id)?.nom ?? id;
}
export function libelleDelai(id: string): string {
  return delaiParId(id)?.nom ?? id;
}
export function libellePrestation(id: string): string {
  return prestationParId(id)?.nom ?? id;
}

/** « 3 × 1,5 m » — format lisible, virgule décimale française. */
export function formatDimensions(largeurM: number, hauteurM: number): string {
  const f = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return `${f(largeurM)} × ${f(hauteurM)} m`;
}

/** Surface d'une pièce en m², calculée en centimètres entiers (exacte au cm² près). */
export function surfaceM2(largeurM: number, hauteurM: number): number {
  return (Math.round(largeurM * 100) * Math.round(hauteurM * 100)) / 10000;
}

export function formatSurface(m2: number): string {
  return `${m2.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m²`;
}

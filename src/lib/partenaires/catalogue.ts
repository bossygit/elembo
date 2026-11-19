/**
 * Elembo Partners — référentiel des machines, capacités, services et tarifs.
 *
 * Une seule source pour le portail partenaire, le back-office et la validation serveur. Les
 * identifiants sont aussi les valeurs autorisées par les contraintes CHECK de la migration
 * `20261116120000_elembo_partners.sql` ; `partenairesDomaine.test.ts` vérifie l'alignement.
 *
 * Les codes de machines et de prestations ne sont PAS figés en base (seul leur format l'est) :
 * on peut enrichir ces listes sans migration. Les prestations grand format reprennent les
 * identifiants de `SUPPORTS` (src/lib/grand-format/catalogue.ts) pour qu'une capacité se compare
 * directement à `demandes_grand_format.support`.
 */

export type Option<T extends string = string> = { id: T; nom: string };

/** Format commun à tous les codes libres (machines, prestations, finitions). */
export const FORMAT_CODE = /^[A-Z0-9_]{2,40}$/;

/* ---------------------------------------------------------------- familles -- */

export type FamilleId = 'GRAND_FORMAT' | 'IMPRESSION_NUMERIQUE' | 'TEXTILE' | 'SIGNALETIQUE_FINITION';

export const FAMILLES: Option<FamilleId>[] = [
  { id: 'GRAND_FORMAT', nom: 'Grand format' },
  { id: 'IMPRESSION_NUMERIQUE', nom: 'Impression numérique' },
  { id: 'TEXTILE', nom: 'Textile' },
  { id: 'SIGNALETIQUE_FINITION', nom: 'Signalétique et finition' },
];

/* ---------------------------------------------------------------- machines -- */

export const TYPES_MACHINE: Record<FamilleId, Option[]> = {
  GRAND_FORMAT: [
    { id: 'BACHE', nom: 'Imprimante bâche' },
    { id: 'VINYLE', nom: 'Imprimante vinyle' },
    { id: 'ECO_SOLVANT', nom: 'Imprimante éco-solvant' },
    { id: 'UV', nom: 'Imprimante UV' },
    { id: 'LATEX', nom: 'Imprimante latex' },
  ],
  IMPRESSION_NUMERIQUE: [
    { id: 'PRESSE_NUMERIQUE', nom: 'Presse numérique' },
    { id: 'LASER', nom: 'Imprimante laser' },
    { id: 'GRAND_VOLUME', nom: 'Imprimante grand volume' },
    { id: 'PHOTO', nom: 'Imprimante photo' },
  ],
  TEXTILE: [
    { id: 'DTF', nom: 'Machine DTF' },
    { id: 'SUBLIMATION', nom: 'Machine de sublimation' },
    { id: 'SERIGRAPHIE', nom: 'Machine de sérigraphie' },
    { id: 'FLEX_FLOCK', nom: 'Machine flex et flock' },
    { id: 'BRODERIE', nom: 'Machine de broderie' },
  ],
  SIGNALETIQUE_FINITION: [
    { id: 'PLOTTER_DECOUPE', nom: 'Plotter de découpe' },
    { id: 'GRAVURE', nom: 'Machine de gravure' },
    { id: 'PLASTIFIEUSE', nom: 'Plastifieuse' },
    { id: 'MASSICOT', nom: 'Massicot' },
    { id: 'RELIURE', nom: 'Machine de reliure' },
    { id: 'FACONNAGE', nom: 'Machine de façonnage' },
    { id: 'POSE_OEILLETS', nom: 'Équipement de pose d’œillets' },
  ],
};

export type EtatMachine = 'OPERATIONNELLE' | 'MAINTENANCE' | 'EN_PANNE' | 'HORS_SERVICE';

export const ETATS_MACHINE: Option<EtatMachine>[] = [
  { id: 'OPERATIONNELLE', nom: 'Opérationnelle' },
  { id: 'MAINTENANCE', nom: 'En maintenance' },
  { id: 'EN_PANNE', nom: 'En panne' },
  { id: 'HORS_SERVICE', nom: 'Hors service' },
];

/** Une machine en panne ou hors service ne compte pas dans la capacité disponible (CDC §5.4). */
export function machineProductive(etat: EtatMachine): boolean {
  return etat === 'OPERATIONNELLE';
}

export type UniteVitesse = 'M2_HEURE' | 'PIECES_HEURE' | 'PAGES_MINUTE' | 'ML_HEURE';

export const UNITES_VITESSE: Option<UniteVitesse>[] = [
  { id: 'M2_HEURE', nom: 'm²/heure' },
  { id: 'ML_HEURE', nom: 'mètres linéaires/heure' },
  { id: 'PIECES_HEURE', nom: 'pièces/heure' },
  { id: 'PAGES_MINUTE', nom: 'pages/minute' },
];

/* --------------------------------------------------------------- capacités -- */

export const PRESTATIONS: Record<FamilleId, Option[]> = {
  GRAND_FORMAT: [
    { id: 'BANDEROLE', nom: 'Banderoles' },
    { id: 'BACHE', nom: 'Bâches' },
    { id: 'KAKEMONO', nom: 'Kakémonos' },
    { id: 'ROLL_UP', nom: 'Roll-up' },
    { id: 'X_BANNER', nom: 'X-banner' },
    { id: 'PANNEAU', nom: 'Panneaux publicitaires' },
    { id: 'VINYLE_ADHESIF', nom: 'Vinyles adhésifs' },
  ],
  IMPRESSION_NUMERIQUE: [
    { id: 'FLYER', nom: 'Flyers' },
    { id: 'AFFICHE', nom: 'Affiches' },
    { id: 'CARTE_VISITE', nom: 'Cartes de visite' },
    { id: 'BROCHURE', nom: 'Brochures' },
    { id: 'DEPLIANT', nom: 'Dépliants' },
    { id: 'MENU', nom: 'Menus' },
    { id: 'DOCUMENT_ADMINISTRATIF', nom: 'Documents administratifs' },
  ],
  TEXTILE: [
    { id: 'DTF', nom: 'Impression DTF' },
    { id: 'SUBLIMATION', nom: 'Sublimation' },
    { id: 'SERIGRAPHIE', nom: 'Sérigraphie' },
    { id: 'FLEX', nom: 'Flex' },
    { id: 'BRODERIE', nom: 'Broderie' },
  ],
  SIGNALETIQUE_FINITION: [
    { id: 'DECOUPE', nom: 'Découpe' },
    { id: 'GRAVURE', nom: 'Gravure' },
    { id: 'PLASTIFICATION', nom: 'Plastification' },
    { id: 'OEILLETS', nom: 'Œillets' },
    { id: 'OURLETS', nom: 'Ourlets' },
    { id: 'FOURREAUX', nom: 'Fourreaux' },
    { id: 'RELIURE', nom: 'Reliure' },
    { id: 'MONTAGE', nom: 'Montage' },
    { id: 'INSTALLATION', nom: 'Installation' },
  ],
};

/** Finitions qu'une capacité peut proposer (tableau `finitions`). */
export const FINITIONS_PRODUCTION: Option[] = [
  { id: 'OEILLETS', nom: 'Œillets' },
  { id: 'OURLETS', nom: 'Ourlets' },
  { id: 'FOURREAUX', nom: 'Fourreaux' },
  { id: 'DECOUPE', nom: 'Découpe' },
  { id: 'DECOUPE_FORME', nom: 'Découpe à la forme' },
  { id: 'PLASTIFICATION', nom: 'Plastification' },
  { id: 'PELLICULAGE', nom: 'Pelliculage' },
  { id: 'RAINAGE_PLIAGE', nom: 'Rainage et pliage' },
  { id: 'RELIURE', nom: 'Reliure' },
  { id: 'CONTRECOLLAGE', nom: 'Contrecollage' },
  { id: 'BAGUETTES', nom: 'Baguettes' },
];

export type UniteCapacite = 'M2' | 'METRE_LINEAIRE' | 'PIECE' | 'IMPRESSION' | 'HEURE';

export const UNITES_CAPACITE: (Option<UniteCapacite> & { parJour: string })[] = [
  { id: 'M2', nom: 'm²', parJour: 'm²/jour' },
  { id: 'METRE_LINEAIRE', nom: 'mètres linéaires', parJour: 'ml/jour' },
  { id: 'PIECE', nom: 'pièces', parJour: 'pièces/jour' },
  { id: 'IMPRESSION', nom: 'impressions', parJour: 'impressions/jour' },
  { id: 'HEURE', nom: 'heures', parJour: 'heures/jour' },
];

/** Unité proposée par défaut à la création d'une capacité. */
export const UNITE_PAR_DEFAUT: Record<FamilleId, UniteCapacite> = {
  GRAND_FORMAT: 'M2',
  IMPRESSION_NUMERIQUE: 'IMPRESSION',
  TEXTILE: 'PIECE',
  SIGNALETIQUE_FINITION: 'PIECE',
};

/* ---------------------------------------------------------------- services -- */

export type CategorieService =
  | 'IMPRESSION'
  | 'IMPRESSION_FINITION'
  | 'CREATION_GRAPHIQUE'
  | 'DECOUPE_POSE'
  | 'LIVRAISON'
  | 'INSTALLATION'
  | 'MONTAGE'
  | 'FACONNAGE'
  | 'AUTRE';

export const CATEGORIES_SERVICE: Option<CategorieService>[] = [
  { id: 'IMPRESSION', nom: 'Impression seule' },
  { id: 'IMPRESSION_FINITION', nom: 'Impression avec finition' },
  { id: 'CREATION_GRAPHIQUE', nom: 'Création graphique' },
  { id: 'DECOUPE_POSE', nom: 'Découpe et pose' },
  { id: 'LIVRAISON', nom: 'Livraison' },
  { id: 'INSTALLATION', nom: 'Installation sur site' },
  { id: 'MONTAGE', nom: 'Montage de supports' },
  { id: 'FACONNAGE', nom: 'Façonnage' },
  { id: 'AUTRE', nom: 'Autre' },
];

/* ------------------------------------------------------------------ tarifs -- */

export type ModeCalcul = 'AU_M2' | 'AU_METRE_LINEAIRE' | 'A_LA_PIECE' | 'PAR_LOT' | 'FORFAIT' | 'A_L_HEURE';

export const MODES_CALCUL: (Option<ModeCalcul> & { unite: string })[] = [
  { id: 'AU_M2', nom: 'Au m²', unite: 'm²' },
  { id: 'AU_METRE_LINEAIRE', nom: 'Au mètre linéaire', unite: 'ml' },
  { id: 'A_LA_PIECE', nom: 'À la pièce', unite: 'pièce' },
  { id: 'PAR_LOT', nom: 'Par lot', unite: 'lot' },
  { id: 'FORFAIT', nom: 'Forfait', unite: 'forfait' },
  { id: 'A_L_HEURE', nom: 'À l’heure', unite: 'heure' },
];

export type NatureTarif = 'PRESTATION' | 'SUPPLEMENT_FINITION' | 'LIVRAISON' | 'INSTALLATION';

export const NATURES_TARIF: Option<NatureTarif>[] = [
  { id: 'PRESTATION', nom: 'Prestation' },
  { id: 'SUPPLEMENT_FINITION', nom: 'Supplément de finition' },
  { id: 'LIVRAISON', nom: 'Frais de livraison' },
  { id: 'INSTALLATION', nom: 'Frais d’installation' },
];

/* ---------------------------------------------------------- disponibilités -- */

export type StatutDisponibilite =
  | 'DISPONIBLE'
  | 'ACTIVITE_NORMALE'
  | 'CAPACITE_REDUITE'
  | 'SATURE'
  | 'MAINTENANCE'
  | 'INDISPONIBLE';

export const STATUTS_DISPONIBILITE: Option<StatutDisponibilite>[] = [
  { id: 'DISPONIBLE', nom: 'Disponible' },
  { id: 'ACTIVITE_NORMALE', nom: 'Activité normale' },
  { id: 'CAPACITE_REDUITE', nom: 'Capacité réduite' },
  { id: 'SATURE', nom: 'Saturé' },
  { id: 'MAINTENANCE', nom: 'Maintenance' },
  { id: 'INDISPONIBLE', nom: 'Indisponible' },
];

/* ---------------------------------------------------------------- fichiers -- */

export type TypeFichierPartenaire = 'LOGO' | 'ATELIER' | 'MACHINE' | 'DOCUMENT' | 'PORTFOLIO';

export const TYPES_FICHIER: Option<TypeFichierPartenaire>[] = [
  { id: 'LOGO', nom: 'Logo' },
  { id: 'ATELIER', nom: 'Photo de l’atelier' },
  { id: 'MACHINE', nom: 'Photo de machine' },
  { id: 'DOCUMENT', nom: 'Document' },
  { id: 'PORTFOLIO', nom: 'Réalisation' },
];

export const FICHIER_TYPES_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const FICHIER_TAILLE_MAX = 10 * 1024 * 1024;

/* ------------------------------------------------------------------ outils -- */

const index = <T extends string>(options: Option<T>[]) => new Map(options.map((o) => [o.id, o.nom]));
const NOMS_PRESTATIONS = new Map(Object.values(PRESTATIONS).flat().map((o) => [o.id, o.nom]));
const NOMS_MACHINES = new Map(Object.values(TYPES_MACHINE).flat().map((o) => [o.id, o.nom]));
const NOMS_FAMILLES = index(FAMILLES);

export const nomFamille = (id: string) => NOMS_FAMILLES.get(id as FamilleId) ?? id;
export const nomPrestation = (id: string) => NOMS_PRESTATIONS.get(id) ?? id;
export const nomTypeMachine = (id: string) => NOMS_MACHINES.get(id) ?? id;

export function estFamille(v: unknown): v is FamilleId {
  return typeof v === 'string' && FAMILLES.some((f) => f.id === v);
}

/** La prestation appartient-elle au catalogue de cette famille ? */
export function prestationDeFamille(famille: FamilleId, prestation: string): boolean {
  return PRESTATIONS[famille].some((p) => p.id === prestation);
}

export function typeMachineDeFamille(famille: FamilleId, type: string): boolean {
  return TYPES_MACHINE[famille].some((t) => t.id === type);
}

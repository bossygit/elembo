/**
 * Catalogue de la VITRINE — une vue commerciale, pas une seconde source de prix.
 *
 * Les montants viennent toujours de `tarifs/grille.json` (via `src/lib/tarifs/grille.ts`).
 * La règle qui compte : un prix `test` ou `provisoire` n'est **jamais** affiché comme un prix
 * public. On affiche « Prix sur demande » et on oriente vers le devis. C'est ce qui empêche un
 * tarif de travail de devenir, par omission, le prix de vente.
 *
 * Ajouter un produit à la vitrine = ajouter une entrée ici + ses visuels. Le configurateur
 * n'est pas modifié.
 */

import { CATALOG } from '../products/catalog';
import { FORMATS, prixUnitaireFcfa } from '../products/tableaux';
import {
  prixProduit,
  statutPrixProduit,
  statutPrixTableaux,
  type StatutPrix,
} from '../tarifs/grille';

export type FamilleId = 'textile' | 'tableaux' | 'impression' | 'services';

export type PrixVitrine = {
  /** `null` tant que le prix n'est pas validé commercialement. */
  montant: number | null;
  statut: StatutPrix;
  /** Libellé à afficher tel quel. */
  libelle: string;
  /** Explication courte, affichée sous le prix. */
  note: string;
};

export function formatFcfa(montant: number): string {
  return `${montant.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

export function prixVitrine(montant: number | null, statut: StatutPrix): PrixVitrine {
  if (montant == null) {
    return { montant: null, statut, libelle: 'Prix sur demande', note: 'Tarif à confirmer avec l’atelier.' };
  }
  if (statut !== 'valide') {
    return {
      montant: null,
      statut,
      libelle: 'Prix sur demande',
      note:
        statut === 'test'
          ? 'Tarif de test en cours de validation — non commercialisé.'
          : 'Tarif en cours de validation — devis gratuit.',
    };
  }
  return { montant, statut, libelle: formatFcfa(montant), note: 'Prix TTC, hors livraison.' };
}

/**
 * Le paiement en ligne n'est ouvert que pour un prix commercial validé.
 * `NEXT_PUBLIC_PAIEMENT_TEST=1` est une dérogation EXPLICITE pour les essais encadrés
 * (recette de paiement réel) ; elle ne doit jamais être posée en production publique.
 */
export function paiementEnLigneOuvert(statut: StatutPrix): boolean {
  return statut === 'valide' || process.env.NEXT_PUBLIC_PAIEMENT_TEST === '1';
}

export type FicheTextile = {
  variantes: string[];
  tailles: string[];
  couleurs: { nom: string; hex: string }[];
  faces: string[];
  zones: string[];
  technique: string;
  delai: string;
  minimum: string;
  configurable3D: boolean;
  produit3DId?: string;
  avertissement?: string;
};

export type ProduitVitrine = {
  id: string;
  nom: string;
  famille: FamilleId;
  surtitre: string;
  description: string;
  points: string[];
  image?: { src: string; alt: string };
  href: string;
  cta: string;
  prix: PrixVitrine;
  badge?: string;
  /** Fiche commerciale détaillée pour les produits textile. */
  fiche?: FicheTextile;
};

const tshirtRaglan = CATALOG.find((p) => p.id === 'tshirt-basic');
const tshirtColRond = CATALOG.find((p) => p.id === 'tshirt-alt');
const tableauPetit = FORMATS[0];

export const PRODUITS_VITRINE: ProduitVitrine[] = [
  {
    id: 'tshirt-basic',
    nom: 'T-shirt raglan personnalisé',
    famille: 'textile',
    surtitre: 'Textile',
    description:
      'Un coton épais, des couleurs franches, votre visuel en DTF pressé à chaud dans notre atelier de Brazzaville.',
    points: ['Tailles S à 3XL', '4 couleurs de base', 'Impression avant et arrière', 'Aperçu 3D avant commande'],
    image: { src: '/mockups/tshirt-studio.jpg', alt: 'T-shirt blanc personnalisable, photographié en studio' },
    href: '/textile/tshirt-basic',
    cta: 'Voir la fiche produit',
    prix: prixVitrine(tshirtRaglan ? prixProduit(tshirtRaglan.id) : null, statutPrixProduit('tshirt-basic')),
    fiche: {
      variantes: ['Coupe unisexe', 'Manches courtes raglan'],
      tailles: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
      couleurs: [
        { nom: 'Blanc', hex: '#FFFFFF' },
        { nom: 'Noir', hex: '#1A1A1A' },
        { nom: 'Rouge', hex: '#C62828' },
        { nom: 'Bleu', hex: '#1565C0' },
      ],
      faces: ['Avant', 'Arrière'],
      zones: ['Poitrine : 21 × 30 cm', 'Dos : 25 × 32,4 cm'],
      technique: 'DTF pressé à chaud',
      delai: '3 à 7 jours ouvrés selon la quantité',
      minimum: '1 pièce ; tarif dégressif à partir de 10 pièces',
      configurable3D: true,
      produit3DId: 'tshirt-basic',
    },
  },
  {
    id: 'tshirt-alt',
    nom: 'T-shirt col rond personnalisé',
    famille: 'textile',
    surtitre: 'Textile',
    description:
      'La coupe classique pour les équipes, les événements et les uniformes. Même qualité d’impression, autre silhouette.',
    points: ['Tailles S à 3XL', '4 couleurs de base', 'Idéal quantité et événement', 'Aperçu 3D avant commande'],
    image: { src: '/mockups/tshirt-cintre.jpg', alt: 'T-shirt col rond blanc sur cintre' },
    href: '/textile/tshirt-alt',
    cta: 'Voir la fiche produit',
    prix: prixVitrine(tshirtColRond ? prixProduit(tshirtColRond.id) : null, statutPrixProduit('tshirt-alt')),
    fiche: {
      variantes: ['Col rond', 'Coupe unisexe'],
      tailles: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
      couleurs: [
        { nom: 'Blanc', hex: '#FFFFFF' },
        { nom: 'Noir', hex: '#1A1A1A' },
        { nom: 'Rouge', hex: '#C62828' },
        { nom: 'Bleu', hex: '#1565C0' },
      ],
      faces: ['Avant', 'Arrière'],
      zones: ['Poitrine : 21 × 30 cm', 'Dos : 25 × 32,4 cm'],
      technique: 'DTF pressé à chaud',
      delai: '3 à 7 jours ouvrés selon la quantité',
      minimum: '1 pièce ; tarif dégressif à partir de 10 pièces',
      configurable3D: true,
      produit3DId: 'tshirt-alt',
    },
  },
  {
    id: 'polo-pique',
    nom: 'Polo piqué personnalisé',
    famille: 'textile',
    surtitre: 'Textile · Entreprise',
    description:
      'Un polo propre pour les équipes terrain, l’accueil et les événements professionnels. Broderie ou marquage textile selon le visuel et la quantité.',
    points: ['Col et boutons', 'Broderie ou DTF', 'Tailles S à 3XL', 'Devis pour les séries'],
    image: { src: '/mockups/polo-pique.jpg', alt: 'Polo piqué blanc à col et boutons, photo produit' },
    href: '/textile/polo-pique',
    cta: 'Voir la fiche produit',
    prix: prixVitrine(null, 'provisoire'),
    badge: 'Sur devis',
    fiche: {
      variantes: ['Manches courtes', 'Coupe homme / femme'],
      tailles: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
      couleurs: [
        { nom: 'Blanc', hex: '#FFFFFF' },
        { nom: 'Noir', hex: '#1A1A1A' },
        { nom: 'Bleu marine', hex: '#1B2A4A' },
        { nom: 'Gris', hex: '#9E9E9E' },
      ],
      faces: ['Poitrine', 'Dos'],
      zones: ['Poitrine : 9 × 9 cm (cœur)', 'Dos : 25 × 32 cm'],
      technique: 'Broderie pour les petits marquages, DTF pour les visuels détaillés',
      delai: '5 à 10 jours ouvrés selon la quantité',
      minimum: '10 pièces pour la broderie ; 1 pièce possible en DTF',
      configurable3D: false,
      avertissement:
        'Pas de modèle 3D fiable pour ce polo : la validation se fait sur une fiche technique et un BAT avant production.',
    },
  },
  {
    id: 'tote-bag',
    nom: 'Tote bag personnalisé',
    famille: 'textile',
    surtitre: 'Textile · Événement',
    description:
      'Un sac en toile à votre marque, pour un lancement, un séminaire ou une boutique. Une ou deux faces imprimées selon le visuel.',
    points: ['Toile coton', 'Anses renforcées', 'Impression 1 ou 2 faces', 'Petites et moyennes séries'],
    image: { src: '/mockups/tote-bag.jpg', alt: 'Tote bag en toile naturelle, photo d’illustration' },
    href: '/textile/tote-bag',
    cta: 'Voir la fiche produit',
    prix: prixVitrine(null, 'provisoire'),
    badge: 'Sur devis',
    fiche: {
      variantes: ['Toile naturelle', 'Toile colorée'],
      tailles: ['38 × 42 cm', '30 × 35 cm'],
      couleurs: [
        { nom: 'Naturel', hex: '#E8DCC8' },
        { nom: 'Noir', hex: '#1A1A1A' },
        { nom: 'Bleu marine', hex: '#1B2A4A' },
      ],
      faces: ['Face avant', 'Face arrière'],
      zones: ['Avant : 25 × 28 cm', 'Arrière : 25 × 28 cm'],
      technique: 'DTF pressé à chaud',
      delai: '5 à 10 jours ouvrés selon la quantité',
      minimum: '10 pièces',
      configurable3D: false,
      avertissement:
        'Pas de modèle 3D fiable pour ce sac : la validation se fait sur une fiche technique et un BAT avant production.',
    },
  },
  {
    id: 'textile-evenement',
    nom: 'Textile événementiel',
    famille: 'textile',
    surtitre: 'Textile · Événement',
    description:
      'T-shirts, polos ou tote bags d’un même événement, avec un visuel cohérent et des tailles réparties pour votre public.',
    points: ['Lot multi-produits', 'Répartition des tailles', 'Visuel unique ou décliné', 'Délai cadré avec la date'],
    image: { src: '/mockups/textile-lot.jpg', alt: 'Pile de t-shirts unis, photo d’illustration pour un lot événementiel' },
    href: '/textile/textile-evenement',
    cta: 'Voir la fiche produit',
    prix: prixVitrine(null, 'provisoire'),
    badge: 'Sur devis',
    fiche: {
      variantes: ['T-shirt', 'Polo', 'Tote bag', 'Lot mixte'],
      tailles: ['XS à 3XL selon les modèles'],
      couleurs: [
        { nom: 'Blanc', hex: '#FFFFFF' },
        { nom: 'Noir', hex: '#1A1A1A' },
        { nom: 'Bleu', hex: '#1565C0' },
        { nom: 'Rouge', hex: '#C62828' },
      ],
      faces: ['Avant', 'Arrière'],
      zones: ['Poitrine', 'Dos', 'Manche sur demande'],
      technique: 'DTF pressé à chaud',
      delai: 'À confirmer selon la date de l’événement et la quantité',
      minimum: '10 pièces par référence',
      configurable3D: false,
      avertissement:
        'Le lot événementiel est composé après validation de la répartition des tailles ; aucun modèle 3D n’est simulé.',
    },
  },
  {
    id: 'uniforme-personnalise',
    nom: 'Uniformes personnalisés',
    famille: 'textile',
    surtitre: 'Textile · Entreprise',
    description:
      'Une tenue cohérente pour une équipe : polo, t-shirt ou veste de travail, avec le logo et le nom de chaque collaborateur.',
    points: ['Logo + nom individuel', 'Réassort par taille', 'Validation BAT', 'Commande récurrente possible'],
    image: { src: '/mockups/textile-lot.jpg', alt: 'Pile de t-shirts unis, photo d’illustration pour des uniformes' },
    href: '/textile/uniforme-personnalise',
    cta: 'Voir la fiche produit',
    prix: prixVitrine(null, 'provisoire'),
    badge: 'Sur devis',
    fiche: {
      variantes: ['Polo', 'T-shirt', 'Veste de travail'],
      tailles: ['S à 3XL', 'Tailles spéciales sur demande'],
      couleurs: [
        { nom: 'Blanc', hex: '#FFFFFF' },
        { nom: 'Noir', hex: '#1A1A1A' },
        { nom: 'Bleu marine', hex: '#1B2A4A' },
        { nom: 'Gris', hex: '#9E9E9E' },
      ],
      faces: ['Poitrine', 'Dos', 'Manche'],
      zones: ['Cœur : 9 × 9 cm', 'Dos : 25 × 32 cm', 'Manche : 8 × 8 cm'],
      technique: 'Broderie ou DTF selon le support',
      delai: '7 à 15 jours ouvrés selon la quantité et les tailles',
      minimum: '10 pièces ; réassort possible',
      configurable3D: false,
      avertissement:
        'Pas de modèle 3D fiable pour les uniformes : chaque tenue est validée sur une fiche technique et un BAT.',
    },
  },
  {
    id: 'tableau-canvas',
    nom: 'Tableau canvas sur châssis',
    famille: 'tableaux',
    surtitre: 'Murs & décoration',
    description:
      'Votre photo ou votre création imprimée sur toile, montée sur châssis ou livrée roulée. Cinq formats, deux finitions de bord.',
    points: [
      '5 formats, de 20 × 30 à 60 × 90 cm',
      'Toile seule ou montée sur châssis',
      'Bord galerie ou encadrement',
      'Conseil de résolution avant impression',
    ],
    image: { src: '/mockups/tableau-interieur.jpg', alt: 'Tableau canvas accroché au-dessus d’un canapé' },
    href: '/tableau',
    cta: 'Configurer mon tableau',
    prix: prixVitrine(
      tableauPetit ? prixUnitaireFcfa(tableauPetit, 'toile-seule') : null,
      statutPrixTableaux(),
    ),
    badge: 'Format le plus demandé',
  },
  {
    id: 'impression-graphique',
    nom: 'Impression graphique',
    famille: 'impression',
    surtitre: 'Papeterie & supports',
    description:
      'Flyers, affiches, cartes de visite, menus, brochures. Imprimés en interne en A4/A3+ lorsque le support le permet, avec finitions suivies par nos partenaires.',
    points: ['A4 et A3+', 'Recto ou recto-verso', 'Papiers et finitions au choix', 'Fichier prêt à imprimer ou création graphique'],
    image: { src: '/mockups/cartes-impression.jpg', alt: 'Cartes et supports imprimés empilés' },
    href: '/impression',
    cta: 'Voir les supports',
    prix: prixVitrine(null, 'provisoire'),
    badge: 'Sur devis',
  },
];

export const FAMILLES: {
  id: FamilleId;
  numero: string;
  titre: string;
  description: string;
  points: string[];
  href: string;
  cta: string;
  image: { src: string; alt: string };
}[] = [
  {
    id: 'textile',
    numero: '01',
    titre: 'Textile personnalisé',
    description:
      'T-shirts, polos, tote bags et textiles événementiels. Vous composez, nous imprimons et nous pressons.',
    points: ['Particuliers', 'Équipes & associations', 'Uniformes d’entreprise'],
    href: '/personnalisation',
    cta: 'Personnaliser un textile',
    image: { src: '/mockups/tshirt-studio.jpg', alt: 'T-shirt blanc prêt à être personnalisé à l’atelier' },
  },
  {
    id: 'impression',
    numero: '02',
    titre: 'Impression graphique',
    description:
      'Flyers, affiches, cartes, menus, brochures et documents. Le support juste, au bon format, avec un contrôle du fichier.',
    points: ['A4 / A3+ en interne', 'Finitions via partenaires', 'Quantités et délais annoncés'],
    href: '/impression',
    cta: 'Découvrir l’impression',
    image: { src: '/mockups/cartes-impression.jpg', alt: 'Supports imprimés empilés, cartes et papeterie' },
  },
  {
    id: 'services',
    numero: '03',
    titre: 'Services créatifs',
    description:
      'Identité visuelle, supports publicitaires, communication événementielle et commandes récurrentes pour les organisations.',
    points: ['Entreprises', 'Restaurants & événements', 'Écoles & associations'],
    href: '/entreprises',
    cta: 'Parler de mon projet',
    image: { src: '/mockups/tableau-interieur.jpg', alt: 'Support mural personnalisé dans un espace professionnel' },
  },
];

export type SupportImpression = {
  id: string;
  nom: string;
  description: string;
  options: string[];
};

export const SUPPORTS_IMPRESSION: SupportImpression[] = [
  {
    id: 'flyers',
    nom: 'Flyers',
    description: 'Pour annoncer une offre, un événement ou un service. Petit format, grande diffusion.',
    options: ['A5 ou A4', 'Recto / recto-verso', 'Papier 135 à 300 g', 'Quantité à partir de 100'],
  },
  {
    id: 'affiches',
    nom: 'Affiches',
    description: 'Pour la vitrine, le mur ou l’événement. A3+ imprimé en interne lorsque le support le permet.',
    options: ['A3 / A3+', 'Papier mat ou satiné', 'Petites séries', 'Finition partenaire possible'],
  },
  {
    id: 'cartes-visite',
    nom: 'Cartes de visite',
    description: 'Une carte nette, lisible, qui donne envie de rappeler. Recto ou recto-verso.',
    options: ['85 × 55 mm', 'Papier 300 g', 'Recto / recto-verso', 'Quantité à partir de 100'],
  },
  {
    id: 'menus',
    nom: 'Menus de restaurant',
    description: 'Menus, cartes de saison et supports de table pour les restaurants et bars.',
    options: ['A4 / A5', 'Plié ou plat', 'Papier résistant', 'Finition plastifiée via partenaire'],
  },
  {
    id: 'invitations',
    nom: 'Invitations',
    description: 'Mariages, cérémonies, remises de diplômes : un support soigné pour un moment important.',
    options: ['Formats carrés ou A5', 'Papier épais', 'Recto / recto-verso', 'Petites et moyennes séries'],
  },
  {
    id: 'brochures',
    nom: 'Brochures',
    description: 'Présenter une activité, un programme ou un lieu en plusieurs pages agrafées ou collées.',
    options: ['8 à 32 pages', 'A4 / A5', 'Papier 170 à 300 g', 'Recto / recto-verso'],
  },
  {
    id: 'depliants',
    nom: 'Dépliants',
    description: 'Un document plié qui tient dans la main et se déploie au bon moment.',
    options: ['2, 3 ou 4 volets', 'A4 plié', 'Papier 170 à 300 g', 'Recto / recto-verso'],
  },
  {
    id: 'documents',
    nom: 'Documents personnalisés',
    description: 'Convocations, programmes, rapports, livrets et documents à votre charte.',
    options: ['A4 / A5', 'Noir ou couleur', 'Reliure via partenaire', 'Quantité libre'],
  },
];

export const SERVICES_ENTREPRISE = [
  {
    titre: 'Identité visuelle',
    description: 'Logo, couleurs, typographies et déclinaisons pour que votre marque soit reconnaissable partout.',
    exemples: ['Logo & charte', 'Cartes et papeterie', 'Déclinaisons réseaux'],
  },
  {
    titre: 'Supports de communication',
    description: 'Affiches, flyers, brochures, roll-up et supports de vente pensés pour votre public.',
    exemples: ['Campagnes', 'Vitrines', 'Événements'],
  },
  {
    titre: 'Textiles en quantité',
    description: 'Uniformes, t-shirts d’équipe, polos et textiles événementiels, avec aperçu avant production.',
    exemples: ['Équipes', 'Écoles', 'Séminaires'],
  },
  {
    titre: 'Création graphique',
    description: 'Un logo, une affiche, un menu ou une campagne : la conception est cadrée avant l’impression.',
    exemples: ['Logo', 'Affiches', 'Réseaux sociaux'],
  },
  {
    titre: 'Communication événementielle',
    description: 'Une identité cohérente du carton d’invitation à la signalétique sur place.',
    exemples: ['Mariages', 'Conférences', 'Lancements'],
  },
  {
    titre: 'Commandes récurrentes',
    description: 'Un rythme et un budget convenus à l’avance pour les consommables, les uniformes et les supports réguliers.',
    exemples: ['Restaurants', 'Écoles', 'Commerces'],
  },
];

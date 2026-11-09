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
    href: '/personnalisation',
    cta: 'Personnaliser en 3D',
    prix: prixVitrine(tshirtRaglan ? prixProduit(tshirtRaglan.id) : null, statutPrixProduit('tshirt-basic')),
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
    href: '/personnalisation',
    cta: 'Personnaliser en 3D',
    prix: prixVitrine(tshirtColRond ? prixProduit(tshirtColRond.id) : null, statutPrixProduit('tshirt-alt')),
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
    nom: 'Brochures & dépliants',
    description: 'Présenter une activité, un programme ou un lieu en plusieurs volets.',
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
    titre: 'Communication événementielle',
    description: 'Une identité cohérente du carton d’invitation à la signalétique sur place.',
    exemples: ['Mariages', 'Conférences', 'Lancements'],
  },
];

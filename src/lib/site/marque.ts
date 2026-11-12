/**
 * Source unique des textes de marque et des coordonnées d'assistance.
 *
 * Positionnement (novembre 2026) : Elembo est une plateforme congolaise de création, de
 * personnalisation et de commerce, pensée d'abord pour les particuliers. Les entreprises sont
 * un second segment. Toute formulation de marque réutilisée sur plusieurs pages vit ici.
 */

export const MARQUE = {
  nom: 'Elembo',
  signature: 'Nos histoires. Notre culture. Notre identité.',
  promesse: 'La créativité congolaise à portée de main.',
  accroche: 'Exprimez vos idées. Nous les matérialisons.',
  /** Titre par défaut des pages (balise <title>). */
  titre: 'Elembo — Nos histoires. Notre culture. Notre identité.',
  descriptionCourte:
    'La plateforme congolaise qui transforme vos idées, vos souvenirs et vos émotions en objets personnalisés.',
  description:
    'Elembo est une plateforme congolaise de création et de personnalisation : cadeaux, t-shirts, mugs, souvenirs et kits d’événement inspirés de notre culture. Prix en FCFA, paiement MTN MoMo, commande assistée sur WhatsApp, fabrication à Brazzaville.',
  editeur: 'Smart Vision Congo',
} as const;

export const EMAIL_CONTACT = 'store@smartvision.cg';

/**
 * Comptes sociaux officiels. Liste VIDE tant que les comptes ne sont pas communiqués :
 * le pied de page n'affiche la rubrique que si elle contient au moins une entrée.
 * Ne jamais y mettre une adresse supposée.
 */
export const RESEAUX: { nom: string; href: string }[] = [];

/** Numéro WhatsApp de l'assistance commerciale, au format international sans « + ». */
const WHATSAPP_NUMERO = '242064781414';

export const WHATSAPP = {
  numero: WHATSAPP_NUMERO,
  affichage: '+242 06 478 14 14',
} as const;

/** Lien `wa.me` avec un message pré-rempli (le texte est encodé pour l'URL). */
export function lienWhatsApp(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMERO}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Messages pré-remplis selon l'intention du client. */
export const MESSAGES_WHATSAPP = {
  general: 'Bonjour Elembo, j’aimerais être accompagné pour une commande personnalisée.',
  cadeau: 'Bonjour Elembo, je souhaite offrir un cadeau personnalisé. Pouvez-vous m’aider ?',
  evenement:
    'Bonjour Elembo, je prépare un événement (mariage, dot, baptême, anniversaire…) et j’aimerais un devis pour des articles personnalisés.',
  createur:
    'Bonjour Elembo, je suis créateur / créatrice et j’aimerais proposer mes designs sur la plateforme.',
  produit: (nom: string) => `Bonjour Elembo, je suis intéressé(e) par : ${nom}. Pouvez-vous me conseiller ?`,
  collection: (titre: string) =>
    `Bonjour Elembo, la collection « ${titre} » m’intéresse. Pouvez-vous me tenir informé(e) ?`,
  kit: (titre: string) => `Bonjour Elembo, j’aimerais un devis pour le kit « ${titre} ».`,
  commande: (reference: string) => `Bonjour Elembo, j’ai une question sur ma commande ${reference}.`,
} as const;

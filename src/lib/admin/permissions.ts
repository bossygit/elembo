/**
 * Matrice des droits du back-office.
 *
 * Une seule source de vérité, pure (sans dépendance serveur) : elle sert à la fois au contrôle
 * d'accès côté serveur (`exigerAcces`) et à l'affichage (menus, boutons). Masquer un bouton
 * n'est jamais une protection : chaque page et chaque action serveur revérifie la permission.
 *
 * Rôles (lus dans `app_metadata.role`, que l'utilisateur ne peut pas modifier) :
 *  - admin      : tout ;
 *  - commercial : devis, commandes, clients, catalogue (hors prix et coûts) ;
 *  - atelier    : vue atelier, dossiers de production, stock, statuts de fabrication ;
 *  - finance    : chiffre d'affaires, marges, coûts, prix, paiements, facturation.
 */

import type { RoleStaff } from '@/server/auth/roles';

export type { RoleStaff };

const TOUS = ['admin', 'commercial', 'atelier', 'finance'] as const satisfies readonly RoleStaff[];

export const MATRICE = {
  'tableau_de_bord.voir': TOUS,
  /** Chiffre d'affaires, ventes par catégorie, produits les plus vendus. */
  'ventes.voir': ['admin', 'commercial', 'finance'],
  /** Coûts de revient et marges (commandes, produits, devis, tableau de bord). */
  'marges.voir': ['admin', 'finance'],

  'commandes.voir': TOUS,
  /** Changer le statut — la liste des statuts cibles dépend du rôle (`statutsAutorises`). */
  'commandes.statut': TOUS,
  'commandes.notes': TOUS,
  /** Adresse, ville et date de livraison prévue. */
  'commandes.modifier': ['admin', 'commercial'],
  'commandes.paiement': ['admin', 'commercial', 'finance'],
  'commandes.couts': ['admin', 'finance'],
  'commandes.exporter': ['admin', 'commercial', 'finance'],
  /** Téléphone, email et adresse complète du client. L'atelier ne voit que le nom et la ville. */
  'clients.coordonnees': ['admin', 'commercial', 'finance'],
  /** Dossier de production : PNG haute résolution, fiches techniques, BAT. */
  'production.fichiers': ['admin', 'atelier'],

  'produits.voir': TOUS,
  'produits.modifier': ['admin', 'commercial'],
  /** Prix de vente, statut de prix et coût de production. */
  'produits.prix': ['admin', 'finance'],
  'stock.ajuster': ['admin', 'atelier'],

  'devis.voir': ['admin', 'commercial', 'finance'],
  'devis.traiter': ['admin', 'commercial'],
  'devis.valider_prix': ['admin', 'finance'],
  /** Révoquer les sessions de suivi ouvertes par le client. */
  'devis.sessions': ['admin'],

  /** Banderoles & grand format : demandes, chiffrage, proposition, imprimeur affecté, dates. */
  'grand_format.voir': ['admin', 'commercial', 'finance'],
  'grand_format.chiffrer': ['admin', 'commercial'],
  /** Coûts estimés et réels, marges, tarifs négociés des imprimeurs (confidentiels). */
  'grand_format.couts': ['admin', 'finance'],
  /** Grille de vente servant à l'estimation publique : saisie et validation. */
  'grand_format.tarifs': ['admin', 'finance'],

  'production.voir': ['admin', 'atelier', 'commercial'],
  'production.modifier': ['admin', 'atelier'],
  'partenaires.gerer': ['admin', 'atelier'],

  'clients.voir': ['admin', 'commercial', 'finance'],
  'clients.modifier': ['admin', 'commercial'],
  'clients.facturation': ['admin', 'commercial', 'finance'],

  'audit.voir': ['admin'],
} as const satisfies Record<string, readonly RoleStaff[]>;

export type Permission = keyof typeof MATRICE;

export function peut(role: RoleStaff | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (MATRICE[permission] as readonly RoleStaff[]).includes(role);
}

export function permissionsDu(role: RoleStaff): Permission[] {
  return (Object.keys(MATRICE) as Permission[]).filter((p) => peut(role, p));
}

export const LIBELLES_ROLES: Record<RoleStaff, string> = {
  admin: 'Administrateur',
  commercial: 'Commercial',
  atelier: 'Atelier',
  finance: 'Finance',
};

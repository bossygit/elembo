/**
 * Banner Studio — les 7 catégories de modèles et leur correspondance avec les 6 usages
 * commerciaux du catalogue grand format (audit §2.9, constat 14).
 *
 * Les catégories servent à la galerie de modèles ; l'usage reste la donnée commerciale du devis
 * (`demandes_grand_format.usage`). Un mariage ou un anniversaire est donc un usage `EVENEMENT`.
 */

import type { SupportStudio } from './model';

import type { UsageId } from '@/lib/grand-format/catalogue';

export type CategorieId = 'DEUIL' | 'EGLISE' | 'MARIAGE' | 'ANNIVERSAIRE' | 'PUBLICITE' | 'EVENEMENT_CONFERENCE' | 'INSTITUTION';

export type Categorie = {
  id: CategorieId;
  nom: string;
  usage: UsageId;
  supportDefaut: SupportStudio;
  /** Format proposé à l'ouverture d'un document vierge de cette catégorie (mm). */
  formatDefaut: { largeurMm: number; hauteurMm: number };
};

export const CATEGORIES: Categorie[] = [
  { id: 'DEUIL', nom: 'Deuil & hommage', usage: 'DEUIL', supportDefaut: 'BANDEROLE', formatDefaut: { largeurMm: 3000, hauteurMm: 1000 } },
  { id: 'EGLISE', nom: 'Églises & ministères', usage: 'EGLISE', supportDefaut: 'BANDEROLE', formatDefaut: { largeurMm: 4000, hauteurMm: 1000 } },
  { id: 'MARIAGE', nom: 'Mariages', usage: 'EVENEMENT', supportDefaut: 'BANDEROLE', formatDefaut: { largeurMm: 3000, hauteurMm: 1000 } },
  { id: 'ANNIVERSAIRE', nom: 'Anniversaires', usage: 'EVENEMENT', supportDefaut: 'BANDEROLE', formatDefaut: { largeurMm: 2000, hauteurMm: 1000 } },
  { id: 'PUBLICITE', nom: 'Publicité & commerce', usage: 'PUBLICITE', supportDefaut: 'BANDEROLE', formatDefaut: { largeurMm: 3000, hauteurMm: 1000 } },
  { id: 'EVENEMENT_CONFERENCE', nom: 'Événements & conférences', usage: 'EVENEMENT', supportDefaut: 'ROLL_UP', formatDefaut: { largeurMm: 850, hauteurMm: 2000 } },
  { id: 'INSTITUTION', nom: 'Institutions & associations', usage: 'INSTITUTION', supportDefaut: 'BANDEROLE', formatDefaut: { largeurMm: 4000, hauteurMm: 1000 } },
];

export const estCategorie = (v: unknown): v is CategorieId => typeof v === 'string' && CATEGORIES.some((c) => c.id === v);
export const categorieParId = (id: string) => CATEGORIES.find((c) => c.id === id);

/** Usage commercial à porter sur le devis pour un document de cette catégorie. */
export function usageDeCategorie(id: CategorieId): UsageId {
  return categorieParId(id)!.usage;
}

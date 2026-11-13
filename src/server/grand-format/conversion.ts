import { reporterCoutEstime } from '@/server/admin/devis';
import { demandeParDevis, initialiserTravaux } from '@/server/grand-format/repository';

/**
 * Report des coûts estimés sur une commande issue d'un devis.
 *
 *  - devis ordinaire : comportement inchangé (coût estimé réparti sur la ligne unique) ;
 *  - demande grand format : le chiffrage devient des tâches d'atelier (imprimeur affecté,
 *    création, livraison, autres), et la ligne reste à coût nul — sinon le coût serait compté
 *    deux fois. La base recalcule coût et marge de la commande à chaque tâche.
 */
export async function reporterCoutsApresConversion(
  devisId: string,
  commandeId: string,
): Promise<{ mode: 'grand_format'; taches: number } | { mode: 'devis'; coutUnitaire: number | null }> {
  const demande = await demandeParDevis(devisId);
  if (demande) return { mode: 'grand_format', taches: await initialiserTravaux(demande, commandeId) };
  return { mode: 'devis', coutUnitaire: await reporterCoutEstime(devisId, commandeId) };
}

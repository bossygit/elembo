import { reporterCoutEstime } from '@/server/admin/devis';
import { archiverVisuel } from '@/server/banner/finaliser';
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
  if (demande) {
    const taches = await initialiserTravaux(demande, commandeId);
    // Le visuel Banner Studio passe dans le stockage de production, conservé 24 mois. Un échec ne
    // bloque pas la commande : la carte du visuel le signale et permet de recommencer.
    await archiverVisuel(devisId, commandeId).catch((e) => console.error('visuel_archivage_echec', devisId, e instanceof Error ? e.message : e));
    return { mode: 'grand_format', taches };
  }
  return { mode: 'devis', coutUnitaire: await reporterCoutEstime(devisId, commandeId) };
}

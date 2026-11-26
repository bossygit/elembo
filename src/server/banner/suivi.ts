import { urlApercu, visuelCourant } from './repository';

/**
 * Ce que le client voit de son visuel Banner Studio : l'aperçu, l'état en mots simples, le PDF une
 * fois prêt, et s'il peut encore le modifier. Ni les alertes détaillées, ni le profil, ni l'imprimeur.
 */
export type VisuelClient = {
  version: number;
  etat: 'PRET' | 'VERIFICATION' | 'PREPARATION';
  apercuUrl: string | null;
  pdfFichierId: string | null;
  projetId: string | null;
  modifiable: boolean;
};

export async function visuelClient(devisId: string, statutDevis: string): Promise<VisuelClient | null> {
  const v = await visuelCourant(devisId);
  if (!v) return null;
  const projet = (v.projet ?? {}) as { id?: unknown };
  return {
    version: v.version,
    etat: v.statut === 'RENDU' ? 'PRET' : v.statut === 'A_REVOIR' ? 'VERIFICATION' : 'PREPARATION',
    apercuUrl: v.apercu_chemin ? await urlApercu(v.apercu_chemin) : null,
    pdfFichierId: v.statut === 'RENDU' ? v.fichier_production_id : null,
    projetId: typeof projet.id === 'string' ? projet.id : null,
    modifiable: ['NOUVEAU', 'EN_ANALYSE'].includes(statutDevis),
  };
}

import { specificationsLisibles, validerDemandeGrandFormat } from '@/lib/grand-format/validation';
import { traiterCreationDevis } from '@/server/devis/creation';
import { estimationServeur } from '@/server/grand-format/estimation';
import { creerDemandeGrandFormat } from '@/server/grand-format/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Demande de banderole / support grand format. C'est une demande de devis Elembo : mêmes
 * contrôles, même stockage privé des fichiers, même suivi client. L'estimation éventuelle est
 * recalculée ici (jamais reprise du navigateur) et conservée avec la demande.
 */
export async function POST(request: Request) {
  return traiterCreationDevis(request, (corps) => {
    const validation = validerDemandeGrandFormat(corps);
    if (!validation.ok) return { ok: false, erreurs: validation.erreurs };
    const { devis, parametres } = validation.valeur;
    return {
      ok: true,
      demande: devis,
      creer: async (options) => {
        const estimation = await estimationServeur(parametres);
        const demande = { ...devis, specifications: specificationsLisibles(parametres, estimation) };
        return creerDemandeGrandFormat(demande, parametres, estimation, options);
      },
    };
  });
}

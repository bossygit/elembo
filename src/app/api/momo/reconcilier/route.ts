import { executer } from '@/server/momo/http';
import {
  commandesSupabaseConfigurees,
  synchroniserPaiementMomo,
} from '@/server/commandes/momo';

// Réconciliation périodique des transactions restées PENDING (voir `reconcilier` dans le service).
//
// MTN n'accepte qu'une URL de callback enregistrée sur le compte : tant que le domaine du site ne
// l'est pas, aucun callback ne nous arrive — et c'est précisément ce qui avait fait échouer un
// paiement réel (`INVALID_CALLBACK_URL_HOST`). Sans ce balayage, un client qui approuve sur son
// téléphone puis ferme la page laisserait une commande encaissée mais jamais fabriquée.
//
// Déclenché par le cron Vercel (`vercel.json`), qui envoie `Authorization: Bearer $CRON_SECRET`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(demande: Request) {
  // Sans CRON_SECRET configuré, la route refuse : elle interroge MTN et écrit dans le journal,
  // elle ne doit pas être ouverte à qui connaît l'URL.
  const secret = (process.env.CRON_SECRET ?? '').trim();
  const entete = demande.headers.get('authorization') ?? '';
  if (!secret || entete !== `Bearer ${secret}`) {
    return Response.json({ erreur: 'Accès refusé.' }, { status: 401 });
  }

  const params = new URL(demande.url).searchParams;
  const ageMinutes = Number(params.get('ageMinutes') ?? '1');
  const limite = Number(params.get('limite') ?? '50');

  const reponse = await executer(demande, (service) => service.reconcilier({ ageMinutes, limite }));

  if (commandesSupabaseConfigurees() && reponse.ok) {
    try {
      const corps = (await reponse.clone().json()) as {
        resultats?: { referenceId?: string; commande?: string; statut?: string }[];
      };
      for (const resultat of corps.resultats ?? []) {
        if (
          resultat.referenceId &&
          resultat.commande &&
          resultat.statut &&
          ['PENDING', 'PAYE', 'ECHEC', 'ANOMALIE'].includes(resultat.statut)
        ) {
          await synchroniserPaiementMomo({
            referenceCommande: resultat.commande,
            referenceId: resultat.referenceId,
            statut: resultat.statut as 'PENDING' | 'PAYE' | 'ECHEC' | 'ANOMALIE',
          });
        }
      }
    } catch (erreur) {
      // La réconciliation MTN a réussi ; une erreur Supabase sera reprise au prochain passage.
      console.error('Synchronisation commande MTN Supabase (réconciliation) :', (erreur as Error).message);
    }
  }

  return reponse;
}

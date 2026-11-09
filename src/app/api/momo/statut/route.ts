import { executer, preflight } from '@/server/momo/http';
import {
  commandesSupabaseConfigurees,
  synchroniserDepuisCorpsMomo,
} from '@/server/commandes/momo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// MTN peut être lent : le défaut (10 s sur Hobby) coupe un requesttopay un peu lent.
export const maxDuration = 30;

/** Le navigateur sonde l'état d'un paiement : PENDING / PAYE / ECHEC / ANOMALIE. */
export async function GET(demande: Request) {
  const referenceId = new URL(demande.url).searchParams.get('referenceId') ?? '';
  const reponse = await executer(demande, (service) => service.statut(referenceId));

  if (commandesSupabaseConfigurees() && reponse.ok) {
    try {
      const corps = (await reponse.clone().json()) as Record<string, unknown>;
      await synchroniserDepuisCorpsMomo(corps);
    } catch (erreur) {
      // Le statut MTN reste la réponse principale. Une indisponibilité Supabase ne doit pas
      // faire croire au client que son paiement a échoué ; la prochaine interrogation reprend.
      console.error('Synchronisation commande MTN Supabase (statut) :', (erreur as Error).message);
    }
  }

  return reponse;
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

import { executer, lireJson, preflight } from '@/server/momo/http';
import {
  commandesSupabaseConfigurees,
  synchroniserDepuisCorpsMomo,
} from '@/server/commandes/momo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// MTN peut être lent : le défaut (10 s sur Hobby) coupe un requesttopay un peu lent.
export const maxDuration = 30;

/**
 * Notification MTN. On ne la croit jamais sur parole : le statut est revérifié par l'API et le
 * montant comparé avant de marquer PAYE. Réponse toujours 200, sinon MTN rejoue en boucle.
 */
async function traiter(demande: Request, reference: string | null) {
  const corps = await lireJson(demande);
  const reponse = await executer(demande, (service) => service.callback(corps, reference));

  if (commandesSupabaseConfigurees() && reponse.ok) {
    try {
      const resultat = (await reponse.clone().json()) as Record<string, unknown>;
      await synchroniserDepuisCorpsMomo(resultat);
    } catch (erreur) {
      // Le callback doit rester 200 même si Supabase est momentanément indisponible :
      // la réconciliation et le suivi de statut reprendront la synchronisation.
      console.error('Synchronisation commande MTN Supabase (callback) :', (erreur as Error).message);
    }
  }

  return reponse;
}

export async function POST(demande: Request) {
  return traiter(demande, null);
}

export async function PUT(demande: Request) {
  return traiter(demande, null);
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

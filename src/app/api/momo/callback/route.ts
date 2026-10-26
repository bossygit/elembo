import { executer, lireJson, preflight } from '@/server/momo/http';

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
  return executer(demande, (service) => service.callback(corps, reference));
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

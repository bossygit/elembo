import { executer, lireJson, preflight } from '@/server/momo/http';

// Une fonction serverless Node (pas Edge) : le service utilise `node:crypto` et le client MTN.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// MTN peut être lent : le défaut (10 s sur Hobby) coupe un requesttopay un peu lent.
export const maxDuration = 30;

/** Le navigateur annonce la commande ; le montant est recalculé côté serveur. */
export async function POST(demande: Request) {
  const corps = await lireJson(demande);
  return executer(demande, (service) => service.payer(corps));
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

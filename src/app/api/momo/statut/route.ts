import { executer, preflight } from '@/server/momo/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// MTN peut être lent : le défaut (10 s sur Hobby) coupe un requesttopay un peu lent.
export const maxDuration = 30;

/** Le navigateur sonde l'état d'un paiement : PENDING / PAYE / ECHEC / ANOMALIE. */
export async function GET(demande: Request) {
  const referenceId = new URL(demande.url).searchParams.get('referenceId') ?? '';
  return executer(demande, (service) => service.statut(referenceId));
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

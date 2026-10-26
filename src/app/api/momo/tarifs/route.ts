import { executer, preflight } from '@/server/momo/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tarifs réellement appliqués par ce processus : lecture seule, aucune commande, aucun appel MTN. */
export async function GET(demande: Request) {
  return executer(demande, (service) => service.tarifs());
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

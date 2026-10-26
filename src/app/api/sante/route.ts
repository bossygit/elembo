import { executer, preflight } from '@/server/momo/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** État du service : mode (mock/reel), environnement MTN, devise, type de stockage. */
export async function GET(demande: Request) {
  return executer(demande, (service) => service.sante());
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

import { traiterNotifications } from '@/server/devis/notifications';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorise(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const entete = request.headers.get('authorization') ?? '';
  return entete === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!autorise(request)) return jsonErreur('Non autorisé.', 401);
  try {
    const resultat = await traiterNotifications(50);
    return Response.json(resultat, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonErreur('Traitement indisponible.', 503);
  }
}

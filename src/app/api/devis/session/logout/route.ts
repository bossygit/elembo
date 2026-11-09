import { effacerCookiesSession, revoquerSessionCourante } from '@/server/devis/session';
import { jsonErreur, origineAutorisee } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!origineAutorisee(request)) return jsonErreur('Origine refusée.', 403);
  await revoquerSessionCourante(request);
  const reponse = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  effacerCookiesSession(reponse);
  return reponse;
}

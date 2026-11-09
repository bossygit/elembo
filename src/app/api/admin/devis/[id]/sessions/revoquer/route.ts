import { garderRoles } from '@/server/auth/api';
import { revoquerSessionsDevis } from '@/server/devis/repository';
import { lireJson } from '@/server/devis/http';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ id: string }> };

export async function POST(request: Request, contexte: Contexte) {
  const garde = await garderRoles(request, ['admin']);
  if (!garde.ok) return garde.reponse;

  const { id } = await contexte.params;
  let motif = 'revocation_admin';
  try {
    const corps = (await lireJson(request)) as { motif?: unknown };
    if (typeof corps.motif === 'string' && corps.motif.trim()) motif = corps.motif.trim().slice(0, 200);
  } catch {
    // Corps facultatif.
  }

  try {
    await revoquerSessionsDevis(id, motif);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonErreur('Révocation indisponible.', 503);
  }
}

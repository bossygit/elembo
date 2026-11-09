import { garderRoles } from '@/server/auth/api';
import { transitionnerDevis } from '@/server/devis/repository';
import { lireJson } from '@/server/devis/http';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ id: string }> };

export async function POST(request: Request, contexte: Contexte) {
  const garde = await garderRoles(request, ['admin', 'commercial']);
  if (!garde.ok) return garde.reponse;

  const { id } = await contexte.params;
  let corps: { decision?: unknown; note?: unknown };
  try {
    corps = (await lireJson(request)) as { decision?: unknown; note?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }

  const decision = corps.decision === 'ACCEPTE' || corps.decision === 'REFUSE' ? corps.decision : null;
  if (!decision) return jsonErreur('Décision invalide.', 422);
  const note = typeof corps.note === 'string' ? corps.note.trim().slice(0, 2000) : null;

  try {
    const devis = await transitionnerDevis(id, decision, null, note, garde.claims.sub ?? null, 'STAFF');
    return Response.json({ devis }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (erreur) {
    if (erreur instanceof Error && /Transition|prix|valide/i.test(erreur.message)) {
      return jsonErreur(erreur.message, 409);
    }
    return jsonErreur('Décision indisponible.', 503);
  }
}

import { csrfValide, devisDepuisSession, effacerCookiesSession } from '@/server/devis/session';
import { deciderDevisPublic } from '@/server/devis/repository';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ reference: string }> };

export async function POST(request: Request, contexte: Contexte) {
  const refus = verifierOrigine(request);
  if (refus) return refus;
  if (!csrfValide(request)) return jsonErreur('Jeton CSRF invalide.', 403);

  const { reference } = await contexte.params;
  const devisId = await devisDepuisSession(request, reference);
  if (!devisId) return jsonErreur('Devis introuvable.', 404);

  const limite = await limiterOuErreur(`devis:decision:${devisId}`, 10, 3600);
  if (limite) return limite;

  let corps: { decision?: unknown };
  try {
    corps = (await lireJson(request)) as { decision?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  const decision = corps.decision === 'ACCEPTE' || corps.decision === 'REFUSE' ? corps.decision : null;
  if (!decision) return jsonErreur('Décision invalide.', 422);

  try {
    const devis = await deciderDevisPublic(devisId, decision);
    const reponse = Response.json(
      { reference, statut: devis.statut },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    if (decision === 'REFUSE') effacerCookiesSession(reponse);
    return reponse;
  } catch (erreur) {
    if (erreur instanceof Error && /Transition|attente de décision/.test(erreur.message)) {
      return jsonErreur('Décision impossible pour ce devis.', 409);
    }
    return jsonErreur('Décision indisponible.', 503);
  }
}

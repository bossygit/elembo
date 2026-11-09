import { hashJeton } from '@/server/devis/jetons';
import { trouverDevisParReference } from '@/server/devis/repository';
import { ajouterCookiesSession, creerSession } from '@/server/devis/session';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { comparerSecret, ipDepuisRequete, jsonErreur, cledepuisValeur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const refus = verifierOrigine(request);
  if (refus) return refus;

  let corps: { reference?: unknown; token?: unknown };
  try {
    corps = (await lireJson(request)) as { reference?: unknown; token?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }

  const reference = typeof corps.reference === 'string' ? corps.reference.trim() : '';
  const token = typeof corps.token === 'string' ? corps.token.trim() : '';
  if (!reference || !token) return jsonErreur('Référence ou code invalide.', 401);

  const ip = ipDepuisRequete(request);
  const limiteIp = await limiterOuErreur(`devis:session:ip:${cledepuisValeur('ip', ip)}`, 10, 3600);
  if (limiteIp) return limiteIp;
  const limiteRef = await limiterOuErreur(
    `devis:session:ref:${cledepuisValeur('ref', reference)}`,
    5,
    3600,
  );
  if (limiteRef) return limiteRef;

  const devis = await trouverDevisParReference(reference);
  if (!devis || !devis.suivi_token_hash || !devis.suivi_token_expire_le) {
    return jsonErreur('Référence ou code invalide.', 401);
  }
  if (new Date(devis.suivi_token_expire_le).getTime() <= Date.now()) {
    return jsonErreur('Référence ou code invalide.', 401);
  }
  if (!comparerSecret(hashJeton(token), devis.suivi_token_hash)) {
    return jsonErreur('Référence ou code invalide.', 401);
  }

  const cookies = await creerSession(devis.id);
  const reponse = Response.json({ reference, ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  ajouterCookiesSession(reponse, cookies);
  return reponse;
}

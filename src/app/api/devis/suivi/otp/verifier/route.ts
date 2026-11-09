import { verifierOtp } from '@/server/devis/otp';
import { trouverDevisParReference } from '@/server/devis/repository';
import { ajouterCookiesSession, creerSession } from '@/server/devis/session';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { cledepuisValeur, ipDepuisRequete, jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const refus = verifierOrigine(request);
  if (refus) return refus;

  let corps: { reference?: unknown; code?: unknown };
  try {
    corps = (await lireJson(request)) as { reference?: unknown; code?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  const reference = typeof corps.reference === 'string' ? corps.reference.trim() : '';
  const code = typeof corps.code === 'string' ? corps.code.trim() : '';
  if (!reference || !/^\d{6}$/.test(code)) {
    return jsonErreur('Référence ou code invalide.', 401);
  }

  const ip = ipDepuisRequete(request);
  const limiteIp = await limiterOuErreur(`devis:otp-verif:ip:${cledepuisValeur('ip', ip)}`, 20, 3600);
  if (limiteIp) return limiteIp;
  const limiteRef = await limiterOuErreur(
    `devis:otp-verif:ref:${cledepuisValeur('ref', reference)}`,
    10,
    15 * 60,
  );
  if (limiteRef) return limiteRef;

  let valide = false;
  try {
    valide = await verifierOtp(reference, code);
  } catch {
    return jsonErreur('Service temporairement indisponible.', 503);
  }
  if (!valide) return jsonErreur('Référence ou code invalide.', 401);

  const devis = await trouverDevisParReference(reference);
  if (!devis) return jsonErreur('Référence ou code invalide.', 401);

  const cookies = await creerSession(devis.id);
  const reponse = Response.json({ ok: true, reference }, { headers: { 'Cache-Control': 'no-store' } });
  ajouterCookiesSession(reponse, cookies);
  return reponse;
}

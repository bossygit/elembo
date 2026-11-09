import { demanderOtp } from '@/server/devis/otp';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { cledepuisValeur, ipDepuisRequete, jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const refus = verifierOrigine(request);
  if (refus) return refus;

  let corps: { reference?: unknown };
  try {
    corps = (await lireJson(request)) as { reference?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  const reference = typeof corps.reference === 'string' ? corps.reference.trim() : '';
  if (!reference) return Response.json({ ok: true }, { status: 202 });

  const ip = ipDepuisRequete(request);
  const limiteIp = await limiterOuErreur(`devis:otp:ip:${cledepuisValeur('ip', ip)}`, 10, 3600);
  if (limiteIp) return limiteIp;
  const limiteRef = await limiterOuErreur(
    `devis:otp:ref:${cledepuisValeur('ref', reference)}`,
    3,
    15 * 60,
  );
  if (limiteRef) return limiteRef;

  try {
    await demanderOtp(reference);
  } catch {
    return jsonErreur('Service temporairement indisponible.', 503);
  }

  // Toujours 202, même si la référence est inconnue ou si aucun canal n'est configuré.
  return Response.json({ ok: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

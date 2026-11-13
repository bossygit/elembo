import { validerParametresEstimation } from '@/lib/grand-format/validation';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { estimationServeur } from '@/server/grand-format/estimation';
import { cledepuisValeur, ipDepuisRequete, jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Estimation indicative d'une banderole. Le navigateur décrit sa demande ; le montant est
 * calculé ici depuis la grille validée en base. Aucune donnée personnelle n'est reçue.
 */
export async function POST(request: Request) {
  const refus = verifierOrigine(request);
  if (refus) return refus;

  const limite = await limiterOuErreur(
    `grand-format:estimation:ip:${cledepuisValeur('ip', ipDepuisRequete(request))}`,
    120,
    3600,
  );
  if (limite) return limite;

  let corps: unknown;
  try {
    corps = await lireJson(request);
  } catch (erreur) {
    return erreur instanceof Error && erreur.message === 'CORPS_TROP_GRAND'
      ? jsonErreur('Corps de requête trop volumineux.', 413)
      : jsonErreur('Corps JSON invalide.', 400);
  }

  const parametres = validerParametresEstimation(corps);
  if (!parametres.ok) {
    return Response.json(
      { erreur: 'Paramètres invalides.', details: parametres.erreurs },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const estimation = await estimationServeur(parametres.valeur);
  return Response.json({ estimation }, { headers: { 'Cache-Control': 'no-store' } });
}

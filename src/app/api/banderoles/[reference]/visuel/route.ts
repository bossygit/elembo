import { ErreurFinalisation, finaliserVisuel } from '@/server/banner/finaliser';
import { limiterOuErreur, verifierOrigine } from '@/server/devis/http';
import { csrfValide, devisDepuisSession } from '@/server/devis/session';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Rendu d'un PDF grand format : quelques secondes, jusqu'à une minute avec huit grandes images. */
export const maxDuration = 120;

type Contexte = { params: Promise<{ reference: string }> };

/**
 * Rend le PDF de production du visuel Banner Studio joint à un devis. Idempotent : le même projet
 * n'est rendu qu'une fois. Aucun fichier n'est désigné par le navigateur : le serveur prend ceux du devis.
 */
export async function POST(request: Request, contexte: Contexte) {
  const refus = verifierOrigine(request);
  if (refus) return refus;
  if (!csrfValide(request)) return jsonErreur('Jeton CSRF invalide.', 403);

  const { reference } = await contexte.params;
  const devisId = await devisDepuisSession(request, reference);
  if (!devisId) return jsonErreur('Devis introuvable.', 404);

  const limite = await limiterOuErreur(`banderoles:visuel:${devisId}`, 10, 3600);
  if (limite) return limite;

  try {
    const r = await finaliserVisuel(devisId, reference);
    return Response.json(r, { status: r.etat === 'EN_COURS' ? 202 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ErreurFinalisation) return jsonErreur(e.message, e.statut);
    // Le détail reste dans les journaux et sur le visuel ; le client n'a rien à en faire.
    console.error('visuel_rendu_echec', reference, e instanceof Error ? e.message : e);
    return jsonErreur('Le fichier d’impression n’a pas pu être préparé. Notre équipe s’en occupe.', 500);
  }
}

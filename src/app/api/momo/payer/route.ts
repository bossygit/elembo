import { executer, lireJson, preflight } from '@/server/momo/http';
import { tarifsServeur } from '@/server/tarifs/base';
import type { Tarifs } from '@/lib/tarifs/tarifs';
import {
  ErreurCommandeDirecte,
  commandesSupabaseConfigurees,
  preparerCommandeDirecte,
  synchroniserPaiementMomo,
} from '@/server/commandes/momo';

// Une fonction serverless Node (pas Edge) : le service utilise `node:crypto` et le client MTN.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// MTN peut être lent : le défaut (10 s sur Hobby) coupe un requesttopay un peu lent.
export const maxDuration = 30;

function reponseErreur(erreur: unknown): Response {
  const message =
    erreur instanceof ErreurCommandeDirecte
      ? erreur.message
      : erreur instanceof Error
        ? erreur.message
        : 'Commande non enregistrée.';
  const statut = erreur instanceof ErreurCommandeDirecte ? erreur.statutHttp : 503;
  return Response.json(
    { erreur: message },
    { status: statut, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Le navigateur annonce la commande ; le montant est recalculé côté serveur.
 *
 * Quand Supabase est configuré, la commande commerciale est créée avant l'appel à MTN.
 * Le journal Redis reste la source de la transaction de paiement ; Supabase en conserve
 * la trace commerciale. Si Supabase est indisponible, on refuse le paiement plutôt que
 * d'encaisser une commande impossible à retrouver à l'atelier.
 */
export async function POST(demande: Request) {
  const corps = await lireJson(demande);

  // Une seule lecture des tarifs de l'admin pour toute la requête : la commande enregistrée et
  // le montant demandé à MTN reposent exactement sur les mêmes prix.
  let tarifs: Tarifs;
  try {
    tarifs = await tarifsServeur();
  } catch (erreur) {
    console.error('Tarifs illisibles (paiement) :', (erreur as Error).message);
    return Response.json(
      { erreur: 'Tarifs momentanément indisponibles : aucun paiement n’a été demandé. Réessayez dans un instant.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    await preparerCommandeDirecte(corps, tarifs);
  } catch (erreur) {
    return reponseErreur(erreur);
  }

  const reponse = await executer(demande, (service) => service.payer(corps, { tarifs }));

  if (commandesSupabaseConfigurees() && reponse.ok) {
    try {
      const donnees = (await reponse.clone().json()) as Record<string, unknown>;
      const commande = typeof (corps as { commande?: unknown })?.commande === 'string'
        ? (corps as { commande: string }).commande
        : '';
      const referenceId = typeof donnees.referenceId === 'string' ? donnees.referenceId : '';
      if (commande && referenceId) {
        await synchroniserPaiementMomo({
          referenceCommande: commande,
          referenceId,
          statut: 'PENDING',
          montantFcfa: typeof donnees.montantFcfa === 'number' ? donnees.montantFcfa : null,
          msisdn: typeof (corps as { telephone?: unknown })?.telephone === 'string'
            ? (corps as { telephone: string }).telephone
            : null,
        });
      }
    } catch (erreur) {
      // Le paiement est déjà parti chez MTN ; la synchronisation sera reprise par le suivi
      // de statut, le callback ou la réconciliation. On ne transforme pas un succès MTN en
      // erreur navigateur pour un incident Supabase transitoire.
      console.error('Synchronisation commande MTN Supabase (PENDING) :', (erreur as Error).message);
    }
  }

  return reponse;
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

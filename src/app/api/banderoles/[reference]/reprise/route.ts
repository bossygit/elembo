import { ErreurReprise, planifierReprise } from '@/server/banner/reprise';
import { ajouterFichierEnAttente } from '@/server/devis/repository';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { csrfValide, devisDepuisSession } from '@/server/devis/session';
import { jsonErreur } from '@/server/security/http';
import { creerUrlEnvoi } from '@/server/storage/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ reference: string }> };

/**
 * Reprise d'un visuel Banner Studio pour une demande existante : URL d'envoi signées pour la nouvelle
 * révision. Le client envoie ensuite les fichiers, les fait vérifier, puis demande le rendu, comme à
 * la création.
 */
export async function POST(request: Request, contexte: Contexte) {
  const refus = verifierOrigine(request);
  if (refus) return refus;
  if (!csrfValide(request)) return jsonErreur('Jeton CSRF invalide.', 403);
  const { reference } = await contexte.params;
  const devisId = await devisDepuisSession(request, reference);
  if (!devisId) return jsonErreur('Devis introuvable.', 404);
  const limite = await limiterOuErreur(`banderoles:reprise:${devisId}`, 10, 3600);
  if (limite) return limite;

  let corps: { fichiers?: unknown; format?: Record<string, unknown> };
  try {
    corps = (await lireJson(request)) as typeof corps;
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  try {
    const plan = await planifierReprise(devisId, { fichiers: corps?.fichiers, format: corps?.format as never });
    const uploads = [];
    for (const f of plan.aEnvoyer) {
      const url = await creerUrlEnvoi(devisId, f.nom);
      const ligne = await ajouterFichierEnAttente(devisId, f, url.chemin);
      uploads.push({ fichierId: ligne.id, nom: f.nom, nomOrigine: f.nomOrigine, signedUrl: url.signedUrl });
    }
    return Response.json({ reference, revision: plan.revision, uploads }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ErreurReprise) return jsonErreur(e.message, e.statut);
    console.error('reprise_echec', reference, e instanceof Error ? e.message : e);
    return jsonErreur('La modification n’a pas pu être préparée.', 500);
  }
}

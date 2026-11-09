import { devisDepuisSession } from '@/server/devis/session';
import { fichierDuDevis } from '@/server/devis/repository';
import { creerUrlTelechargement } from '@/server/storage/supabase';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ reference: string; fichierId: string }> };

export async function GET(request: Request, contexte: Contexte) {
  const { reference, fichierId } = await contexte.params;
  const devisId = await devisDepuisSession(request, reference);
  if (!devisId) return jsonErreur('Fichier introuvable.', 404);

  const fichier = await fichierDuDevis(devisId, fichierId);
  if (!fichier || !fichier.chemin.startsWith(`devis/${devisId}/`)) {
    return jsonErreur('Fichier introuvable.', 404);
  }
  if (!fichier.verifie || fichier.statut_analyse !== 'PROPRE') {
    return jsonErreur('Fichier non disponible au téléchargement.', 409);
  }

  const url = await creerUrlTelechargement(fichier.chemin, 300);
  return Response.json(
    { url, expiresIn: 300, nom: fichier.nom },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

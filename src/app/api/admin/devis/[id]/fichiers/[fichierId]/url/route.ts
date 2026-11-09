import { garderRoles } from '@/server/auth/api';
import { fichierDuDevis } from '@/server/devis/repository';
import { creerUrlTelechargement } from '@/server/storage/supabase';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ id: string; fichierId: string }> };

export async function GET(request: Request, contexte: Contexte) {
  const garde = await garderRoles(request, ['admin', 'commercial']);
  if (!garde.ok) return garde.reponse;

  const { id, fichierId } = await contexte.params;
  const fichier = await fichierDuDevis(id, fichierId);
  if (!fichier || !fichier.chemin.startsWith(`devis/${id}/`)) {
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

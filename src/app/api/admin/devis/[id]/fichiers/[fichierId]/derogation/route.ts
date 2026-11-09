import { garderRoles } from '@/server/auth/api';
import { compterDerogations, fichierDuDevis, journaliserDerogation } from '@/server/devis/repository';
import { lireJson } from '@/server/devis/http';
import { creerUrlTelechargement } from '@/server/storage/supabase';
import { cledepuisValeur, ipDepuisRequete, jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ id: string; fichierId: string }> };

export async function POST(request: Request, contexte: Contexte) {
  const garde = await garderRoles(request, ['admin']);
  if (!garde.ok) return garde.reponse;

  const { id, fichierId } = await contexte.params;
  let corps: { motif?: unknown };
  try {
    corps = (await lireJson(request)) as { motif?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  const motif = typeof corps.motif === 'string' ? corps.motif.trim() : '';
  if (motif.length < 20 || motif.length > 500) {
    return jsonErreur('Motif de dérogation requis (20 à 500 caractères).', 422);
  }

  const fichier = await fichierDuDevis(id, fichierId);
  if (!fichier || !fichier.chemin.startsWith(`devis/${id}/`)) {
    return jsonErreur('Fichier introuvable.', 404);
  }
  if (!fichier.verifie) return jsonErreur('Fichier non vérifié.', 409);
  if (fichier.statut_analyse === 'INFECTE' || fichier.statut_analyse === 'EN_ATTENTE' || fichier.statut_analyse === 'ERREUR') {
    return jsonErreur('Dérogation interdite pour ce statut.', 403);
  }
  if (fichier.statut_analyse !== 'NON_ANALYSE') {
    return jsonErreur('Ce fichier ne relève pas de la dérogation.', 409);
  }
  if (fichier.type_mime === 'application/zip' || fichier.nom.toLowerCase().endsWith('.zip')) {
    return jsonErreur('Les archives ZIP ne sont jamais téléchargeables sans analyse.', 403);
  }

  const acteur = garde.claims.sub ?? '';
  if (!acteur) return jsonErreur('Identité staff incomplète.', 403);

  try {
    const deja = await compterDerogations(acteur);
    if (deja >= 3) {
      return jsonErreur('Quota journalier de dérogations atteint.', 429);
    }

    const url = await creerUrlTelechargement(fichier.chemin, 60);
    await journaliserDerogation({
      acteur,
      acteurEmail: garde.claims.email,
      devisId: id,
      fichierId,
      motif,
      statutAnalyse: fichier.statut_analyse,
      ipHash: cledepuisValeur('ip', ipDepuisRequete(request)),
    });

    return Response.json(
      { url, expiresIn: 60, motif, avertissement: 'Fichier non analysé : dérogation tracée.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return jsonErreur('Dérogation indisponible.', 503);
  }
}

import { devisDepuisSession, csrfValide } from '@/server/devis/session';
import {
  devisParId,
  fichierDuDevis,
  marquerFichierVerifie,
  notifierFichiersRecus,
  supprimerFichier,
} from '@/server/devis/repository';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { supprimerObjet, verifierObjetStorage } from '@/server/storage/supabase';
import { jsonErreur } from '@/server/security/http';
import { traiterNotifications } from '@/server/devis/notifications';
import { after } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ reference: string }> };

export async function POST(request: Request, contexte: Contexte) {
  const refus = verifierOrigine(request);
  if (refus) return refus;
  if (!csrfValide(request)) return jsonErreur('Jeton CSRF invalide.', 403);

  const { reference } = await contexte.params;
  const devisId = await devisDepuisSession(request, reference);
  if (!devisId) return jsonErreur('Devis introuvable.', 404);
  const devis = await devisParId(devisId);
  if (!devis) return jsonErreur('Devis introuvable.', 404);

  const limite = await limiterOuErreur(`devis:fichiers:${devisId}`, 20, 3600);
  if (limite) return limite;

  let corps: { fichierIds?: unknown };
  try {
    corps = (await lireJson(request)) as { fichierIds?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  const ids = Array.isArray(corps.fichierIds)
    ? corps.fichierIds.filter((id): id is string => typeof id === 'string').slice(0, 5)
    : [];
  if (ids.length === 0) return jsonErreur('Aucun fichier à vérifier.', 422);

  let verifies = 0;
  for (const fichierId of ids) {
    const fichier = await fichierDuDevis(devisId, fichierId);
    if (!fichier || fichier.verifie) continue;
    if (!fichier.chemin.startsWith(`devis/${devisId}/`)) {
      return jsonErreur('Chemin de fichier invalide.', 422);
    }

    try {
      const verdict = await verifierObjetStorage({
        chemin: fichier.chemin,
        nom: fichier.nom,
        typeMime: fichier.type_mime,
        tailleAnnoncee: fichier.taille_octets,
      });
      if (!verdict.ok) {
        await supprimerObjet(fichier.chemin).catch(() => undefined);
        await supprimerFichier(fichier.id).catch(() => undefined);
        return jsonErreur(`Fichier refusé : ${verdict.raison}`, 422);
      }
      await marquerFichierVerifie(fichier.id, {
        tailleOctets: verdict.tailleOctets,
        typeMime: verdict.typeMime,
        checksum: verdict.checksum,
      });
      verifies += 1;
    } catch {
      return jsonErreur('Vérification du fichier indisponible.', 503);
    }
  }

  if (verifies > 0) {
    await notifierFichiersRecus(devisId, reference, verifies).catch(() => undefined);
    after(() => traiterNotifications(10).catch(() => undefined));
  }

  return Response.json(
    { reference, verifies, fichiers: ids },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

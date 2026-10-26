import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';

import {
  statutDepot,
  verifierAutorisation,
  verifierChemin,
  MAX_TAILLE_FICHIER,
  TYPES_ACCEPTES,
} from '@/server/dossiers/dossier';
import { journal } from '@/server/momo/instance';

// L'envoi passe directement du navigateur à l'archive : le corps de la requête ne traverse pas la
// fonction (limite Vercel de 4,5 Mo). Un visuel d'impression fait souvent 5 à 15 Mo.
//
// Variante « presigned » (et non le jeton client classique) : l'archive Vercel Blob est
// authentifiée par OIDC (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`), sans jeton statique à stocker.
// Le serveur ne fait qu'AUTORISER : court, borné par chemin, types et taille.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Contexte = { params: Promise<{ commande: string }> };

const VALIDITE_MS = 15 * 60 * 1000;

export async function POST(demande: Request, contexte: Contexte) {
  const { commande } = await contexte.params;
  const store = await journal();
  const corps = (await demande.json().catch(() => ({}))) as HandleUploadPresignedBody;

  try {
    const reponse = await handleUploadPresigned({
      body: corps,
      request: demande,
      getSignedToken: async (pathname, clientPayload) => {
        let referenceId = '';
        try {
          referenceId = String((JSON.parse(clientPayload ?? '{}') as { referenceId?: string }).referenceId ?? '');
        } catch {
          referenceId = '';
        }

        const transaction = referenceId ? await store.parReferenceId(referenceId) : undefined;
        const verdict = verifierAutorisation({ transaction, commande });
        if (!verdict.ok) throw new Error(verdict.motif);

        const motifChemin = verifierChemin(commande, pathname);
        if (motifChemin) throw new Error(motifChemin);

        // Un dossier déjà reçu n'est jamais réécrit : le premier dépôt fait foi.
        if (transaction?.fichiers?.length) {
          throw new Error(`Le dossier de la commande ${commande} a déjà été reçu : aucun nouvel envoi.`);
        }

        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: [...TYPES_ACCEPTES],
          maximumSizeInBytes: MAX_TAILLE_FICHIER,
          validUntil: Date.now() + VALIDITE_MS,
        });

        return {
          token,
          urlOptions: {
            access: 'private',
            allowedContentTypes: [...TYPES_ACCEPTES],
            maximumSizeInBytes: MAX_TAILLE_FICHIER,
            addRandomSuffix: true,
            allowOverwrite: false,
            validUntil: Date.now() + VALIDITE_MS,
          },
        };
      },
      // Aucun callback d'achèvement : l'enregistrement se fait par `POST /fichiers`, déclenché par
      // le client juste après l'envoi. Déterministe, et vérifiable sans dépendre d'un aller-retour.
    });

    return Response.json(reponse);
  } catch (erreur) {
    const message = (erreur as Error).message || 'Envoi refusé.';
    return Response.json({ erreur: message }, { status: statutDepot(message) });
  }
}

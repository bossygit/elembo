// Envoi du dossier de production au serveur, APRÈS un paiement confirmé.
//
// Pourquoi côté navigateur : le visuel est dessiné dans un canvas, il n'existe nulle part ailleurs.
// Pourquoi un envoi direct à l'archive (et non par notre API) : un PNG d'impression fait souvent
// 5 à 15 Mo, au-delà de la limite de 4,5 Mo d'une requête de fonction Vercel. `uploadPresigned()`
// obtient une URL signée auprès de `/api/commandes/<commande>/upload` (qui vérifie le paiement),
// puis pousse les octets directement vers l'archive privée. Notre API ne reçoit ensuite que les
// métadonnées.
//
// Règle absolue : si l'envoi échoue, l'utilisateur garde ses téléchargements locaux et on le lui
// dit — on ne prétend jamais que l'atelier a reçu un dossier qui n'est pas arrivé.

import { uploadPresigned as uploadVercel } from '@vercel/blob/client';

export type FichierAEnvoyer = { nom: string; blob: Blob };

export type ResultatEnvoi = {
  envoye: boolean;
  /** Nombre de fichiers réellement déposés puis enregistrés. */
  fichiers: number;
  /** L'atelier a-t-il été prévenu (Telegram) ? */
  notifie?: boolean;
  /** Motif lisible en cas d'échec ou de notification impossible. */
  motif?: string;
};

export type OptionsEnvoi = {
  commande: string;
  referenceId: string;
  fichiers: FichierAEnvoyer[];
  /** Injectables pour les tests. */
  uploadImpl?: typeof uploadVercel;
  fetchImpl?: typeof fetch;
};

/** Chemin d'archive d'un fichier — doit rester sous `dossiers/<commande>/` (vérifié côté serveur). */
export function cheminArchive(commande: string, nom: string): string {
  return `dossiers/${commande}/${nom}`;
}

export async function envoyerDossier(options: OptionsEnvoi): Promise<ResultatEnvoi> {
  const { commande, referenceId, fichiers } = options;
  const envoyeur = options.uploadImpl ?? uploadVercel;
  const appel = options.fetchImpl ?? fetch;

  if (!fichiers.length) return { envoye: false, fichiers: 0, motif: 'Aucun fichier à envoyer.' };

  const depots: { nom: string; chemin: string; taille: number; type: string }[] = [];
  try {
    for (const fichier of fichiers) {
      const resultat = await envoyeur(cheminArchive(commande, fichier.nom), fichier.blob, {
        access: 'private',
        handleUploadUrl: `/api/commandes/${encodeURIComponent(commande)}/upload`,
        clientPayload: JSON.stringify({ referenceId }),
        contentType: fichier.blob.type || undefined,
      });
      depots.push({
        nom: fichier.nom,
        chemin: resultat.pathname,
        taille: fichier.blob.size,
        type: fichier.blob.type,
      });
    }
  } catch (erreur) {
    return {
      envoye: false,
      fichiers: 0,
      motif: `Envoi interrompu : ${(erreur as Error).message}`,
    };
  }

  try {
    const reponse = await appel(`/api/commandes/${encodeURIComponent(commande)}/fichiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceId, fichiers: depots }),
    });
    const corps = (await reponse.json().catch(() => ({}))) as {
      erreur?: string;
      notifie?: boolean;
      motif?: string;
      fichiers?: unknown[];
    };
    if (!reponse.ok) {
      return {
        envoye: false,
        fichiers: 0,
        motif: corps.erreur ?? `Enregistrement refusé (HTTP ${reponse.status}).`,
      };
    }
    return {
      envoye: true,
      fichiers: corps.fichiers?.length ?? depots.length,
      notifie: corps.notifie ?? false,
      motif: corps.motif,
    };
  } catch (erreur) {
    // Les fichiers SONT dans l'archive mais ne sont pas rattachés à la commande : on le dit.
    return {
      envoye: false,
      fichiers: 0,
      motif: `Fichiers transférés mais non enregistrés : ${(erreur as Error).message}`,
    };
  }
}

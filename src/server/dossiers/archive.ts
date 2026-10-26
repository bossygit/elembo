/**
 * Archive des dossiers de production (Vercel Blob, accès privé).
 *
 * Pourquoi privé : un visuel de commande ne regarde que le client, l'atelier et l'exploitant.
 * Un stockage public serait devinable et indexable — un fichier d'impression livré à tout le
 * monde n'est pas un fichier de commande.
 *
 * Authentification : Vercel Blob 2.x accepte l'OIDC du projet (`BLOB_STORE_ID` +
 * `VERCEL_OIDC_TOKEN`), ce que l'intégration Vercel configure d'elle-même. Un
 * `BLOB_READ_WRITE_TOKEN` explicite fonctionne aussi (développement, autre hébergeur).
 */

export function archiveConfiguree(): boolean {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

// `ArrayBuffer` (et non `Uint8Array`) : c'est ce qu'attendent `Response` et `Blob` dans les types
// DOM stricts ; un `Uint8Array<ArrayBufferLike>` est refusé comme corps de réponse.
export type FichierArchive = { contenu: ArrayBuffer; type: string; taille: number };

/** Lit un fichier de l'archive privée. `null` s'il n'existe pas. */
export async function telechargerFichier(chemin: string): Promise<FichierArchive | null> {
  if (!archiveConfiguree()) return null;
  const { get } = await import('@vercel/blob');
  try {
    const resultat = await get(chemin, { access: 'private' });
    if (!resultat || resultat.statusCode !== 200) return null;
    const contenu = await new Response(resultat.stream).arrayBuffer();
    return {
      contenu,
      type: resultat.blob.contentType || 'application/octet-stream',
      taille: contenu.byteLength,
    };
  } catch {
    // Fichier absent ou archive injoignable : l'appelant décide (404 ou notification dégradée).
    return null;
  }
}

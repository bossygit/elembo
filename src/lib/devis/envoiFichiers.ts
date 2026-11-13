/**
 * Envoi des pièces d'un devis depuis le navigateur — partagé par le formulaire de devis et le
 * parcours banderoles.
 *
 * 1. chaque fichier est envoyé DIRECTEMENT au bucket privé `devis` avec l'URL signée remise par
 *    le serveur (il ne transite pas par une fonction Vercel, limitée à 4,5 Mo) ;
 * 2. le serveur vérifie ensuite les octets, la taille et le type de chaque objet
 *    (`POST /api/devis/[reference]/fichiers`) avant de les rattacher au devis.
 */

export type UploadSigne = { fichierId: string; nom: string; signedUrl: string };

export async function envoyerFichiersDevis(options: {
  reference: string;
  csrfToken: string;
  uploads: UploadSigne[];
  fichiers: File[];
  surProgression?: (envoyes: number, total: number) => void;
}): Promise<void> {
  const { reference, csrfToken, uploads, fichiers, surProgression } = options;
  let envoyes = 0;
  for (const upload of uploads) {
    const fichier = fichiers.find((f) => f.name === upload.nom);
    if (!fichier) continue;
    const envoi = await fetch(upload.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fichier.type || 'application/octet-stream', 'x-upsert': 'false' },
      body: fichier,
    });
    if (!envoi.ok) throw new Error(`Envoi impossible pour ${upload.nom}.`);
    envoyes += 1;
    surProgression?.(envoyes, uploads.length);
  }

  if (uploads.length === 0) return;
  const finalisation = await fetch(`/api/devis/${encodeURIComponent(reference)}/fichiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ fichierIds: uploads.map((u) => u.fichierId) }),
  });
  if (!finalisation.ok) {
    const corps = (await finalisation.json().catch(() => ({}))) as { erreur?: string };
    throw new Error(corps.erreur ?? 'Vérification des fichiers impossible.');
  }
}

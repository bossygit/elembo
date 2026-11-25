/**
 * Envoi des pièces d'un devis depuis le navigateur — partagé par le formulaire de devis et le
 * parcours banderoles.
 *
 * 1. chaque fichier est envoyé DIRECTEMENT au bucket privé `devis` avec l'URL signée remise par
 *    le serveur (il ne transite pas par une fonction Vercel, limitée à 4,5 Mo) ;
 * 2. le serveur vérifie ensuite les octets, la taille et le type de chaque objet
 *    (`POST /api/devis/[reference]/fichiers`) avant de les rattacher au devis.
 */

/** Réseau mobile instable : trois essais, espacés, avant d'abandonner un fichier. */
async function deposer(url: string, fichier: File): Promise<boolean> {
  for (let essai = 0; essai < 3; essai++) {
    if (essai) await new Promise((r) => setTimeout(r, essai * 1500));
    try {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': fichier.type || 'application/octet-stream', 'x-upsert': 'false' },
        body: fichier,
      });
      if (r.ok) return true;
      // L'objet existe déjà : un essai précédent était arrivé, seule sa réponse s'est perdue. Le
      // serveur contrôle de toute façon les octets avant de rattacher le fichier.
      if (essai && (r.status === 409 || (r.status === 400 && (await r.text()).includes('Duplicate')))) return true;
      if (r.status < 500 && r.status !== 429) return false;
    } catch {
      // coupure réseau : nouvel essai
    }
  }
  return false;
}

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
    if (!(await deposer(upload.signedUrl, fichier))) throw new Error(`Envoi impossible pour ${upload.nom}.`);
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

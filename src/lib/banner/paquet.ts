/**
 * Banner Studio — paquet remis au parcours de commande (audit §4.7) : le document JSON, les images
 * telles qu'elles seront imprimées, et l'aperçu. Noms déterministes : `studio-<assetId>.<ext>`.
 *
 * Aucun réseau ici : le formulaire de commande envoie ces fichiers avec le circuit existant.
 */

import type { DocumentBanner } from './model';
import { validerDocument } from './schema';

/** Limites d'une demande venant du Studio ; le serveur applique les mêmes. Le total laisse tenir le PDF dans 50 Mo. */
export const LIMITES_PAQUET = { fichiers: 10, octetsFichier: 25 * 1024 * 1024, octetsTotal: 45 * 1024 * 1024, octetsJson: 1024 * 1024 } as const;
export const NOM_PROJET = 'projet-banner.json';
export const NOM_APERCU = 'apercu-banner.jpg';
/** Révisions envoyées depuis le suivi (reprise) : `projet-banner-r2.json`, `apercu-banner-r2.jpg`… */
export const MOTIF_PROJET = /^projet-banner(?:-r([2-9]|1[0-9]))?\.json$/;
export const MOTIF_APERCU = /^apercu-banner(?:-r([2-9]|1[0-9]))?\.jpg$/;
export const REVISIONS_MAX = 19;
/** Numéro de révision d'un nom de projet ou d'aperçu (1 pour l'envoi d'origine), `null` sinon. */
export function revision(nom: string): number | null {
  const m = MOTIF_PROJET.exec(nom) ?? MOTIF_APERCU.exec(nom);
  return m ? Number(m[1] ?? 1) : null;
}
export const nomRevision = (nom: string, r: number) => (r <= 1 ? nom : nom.replace(/\.(json|jpg)$/, `-r${r}.$1`));
/** Identifiant de projet accepté dans une adresse. */
export const ID_PROJET = /^[A-Za-z0-9_-]{1,64}$/;

export const nomFichierAsset = (a: { id: string; mime: string }) => `studio-${a.id}.${a.mime === 'image/png' ? 'png' : 'jpg'}`;

export type Contenu = { document: DocumentBanner; apercu: Blob; images: Map<string, Blob> };
export type ResultatPaquet = { ok: true; fichiers: File[] } | { ok: false; erreur: string };

export function assemblerPaquet({ document, apercu, images }: Contenu): ResultatPaquet {
  const v = validerDocument(document);
  if (!v.ok) return { ok: false, erreur: 'Ce projet contient des données invalides : il ne peut pas être envoyé.' };
  if (document.dimensions.largeurMm % 10 || document.dimensions.hauteurMm % 10) return { ok: false, erreur: 'Le format doit être au centimètre : corrigez-le dans l’onglet Format.' };
  const exemple = document.assets.find((a) => a.placeholder);
  if (exemple) return { ok: false, erreur: 'Une image d’exemple du modèle n’a pas été remplacée.' };
  const manquante = document.assets.find((a) => !images.has(a.id));
  if (manquante) return { ok: false, erreur: `L’image « ${manquante.nom} » est introuvable sur cet appareil.` };
  if (document.assets.length + 2 > LIMITES_PAQUET.fichiers) {
    return { ok: false, erreur: `${document.assets.length} images : ${LIMITES_PAQUET.fichiers - 2} au maximum par demande. Retirez-en, ou écrivez-nous.` };
  }
  const json = new File([JSON.stringify(document)], NOM_PROJET, { type: 'application/json' });
  const fichiers = [
    json,
    new File([apercu], NOM_APERCU, { type: 'image/jpeg' }),
    ...document.assets.map((a) => new File([images.get(a.id)!], nomFichierAsset(a), { type: a.mime })),
  ];
  if (json.size > LIMITES_PAQUET.octetsJson) return { ok: false, erreur: 'Ce projet est trop volumineux pour être envoyé.' };
  if (fichiers.some((f) => f.size > LIMITES_PAQUET.octetsFichier)) return { ok: false, erreur: 'Une image dépasse 25 Mo.' };
  if (fichiers.reduce((s, f) => s + f.size, 0) > LIMITES_PAQUET.octetsTotal) return { ok: false, erreur: 'Les images dépassent 45 Mo au total : allégez-en une.' };
  return { ok: true, fichiers };
}

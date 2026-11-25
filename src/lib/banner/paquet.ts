/**
 * Banner Studio — paquet remis au parcours de commande (audit §4.7) : le document JSON, les images
 * telles qu'elles seront imprimées, et l'aperçu. Noms déterministes : `studio-<assetId>.<ext>`.
 *
 * Aucun réseau ici : le formulaire de commande envoie ces fichiers avec le circuit existant.
 */

import type { DocumentBanner } from './model';
import { validerDocument } from './schema';

/** Limites d'une demande venant du Studio ; le serveur applique les mêmes. */
export const LIMITES_PAQUET = { fichiers: 10, octetsFichier: 25 * 1024 * 1024, octetsTotal: 80 * 1024 * 1024, octetsJson: 1024 * 1024 } as const;
export const NOM_PROJET = 'projet-banner.json';
export const NOM_APERCU = 'apercu-banner.jpg';
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
  if (fichiers.reduce((s, f) => s + f.size, 0) > LIMITES_PAQUET.octetsTotal) return { ok: false, erreur: 'Les images dépassent 80 Mo au total : allégez-en une.' };
  return { ok: true, fichiers };
}

import { LIMITES_PAQUET, MOTIF_APERCU, MOTIF_PROJET, NOM_APERCU, NOM_PROJET, nomRevision, revision, REVISIONS_MAX } from '@/lib/banner/paquet';
import type { FichierAnnonce } from '@/lib/devis/types';
import { fichiersValides } from '@/lib/devis/validation';
import { LIMITES_FICHIERS_STUDIO } from '@/lib/grand-format/validation';
import { devisParId, fichiersDuDevis } from '@/server/devis/repository';

import { demandeDuDevis } from './repository';

/**
 * Reprise d'un visuel depuis le suivi (audit §4.6) : le client renvoie son projet modifié pour la
 * même demande, tant qu'elle n'est pas chiffrée. Le format, le support et la finition ne changent
 * pas : ils fixent le prix. Les images déjà reçues ne sont pas renvoyées.
 */

export class ErreurReprise extends Error {
  constructor(public statut: number, message: string) {
    super(message);
    this.name = 'ErreurReprise';
  }
}

export type FormatReprise = { largeurMm: number; hauteurMm: number; support: string; finition: string };
export type PlanReprise = { revision: number; aEnvoyer: (FichierAnnonce & { nomOrigine: string })[] };

export async function planifierReprise(devisId: string, brut: { fichiers?: unknown; format?: Partial<FormatReprise> }): Promise<PlanReprise> {
  const [devis, demande, existants] = await Promise.all([devisParId(devisId), demandeDuDevis(devisId), fichiersDuDevis(devisId)]);
  if (!devis || !demande) throw new ErreurReprise(404, 'Demande introuvable.');
  if (!['NOUVEAU', 'EN_ANALYSE'].includes(devis.statut)) throw new ErreurReprise(409, 'Le devis est déjà établi : le visuel ne peut plus être modifié en ligne. Écrivez-nous.');

  const f = brut.format ?? {};
  const mm = (m: number) => Math.round(Number(m) * 1000);
  if (f.largeurMm !== mm(demande.largeur_m) || f.hauteurMm !== mm(demande.hauteur_m) || f.support !== demande.support || f.finition !== demande.finition) {
    throw new ErreurReprise(409, 'Le format, le support ou la finition ont changé : faites une nouvelle demande, le prix en dépend.');
  }

  const lu = fichiersValides(brut.fichiers, LIMITES_FICHIERS_STUDIO);
  if (!lu.ok) throw new ErreurReprise(422, lu.erreur);
  const annonces = lu.valeur;
  const projet = annonces.filter((x) => x.typeMime === 'application/json');
  if (projet.length !== 1 || projet[0].nom !== NOM_PROJET || projet[0].tailleOctets > LIMITES_PAQUET.octetsJson) throw new ErreurReprise(422, 'Le projet du Studio est absent ou invalide.');
  if (!annonces.some((x) => x.nom === NOM_APERCU && x.typeMime === 'image/jpeg')) throw new ErreurReprise(422, 'L’aperçu du visuel est absent.');
  if (annonces.some((x) => x.typeMime !== 'application/json' && x.nom !== NOM_APERCU && !/^studio-[A-Za-z0-9_-]{1,64}\.(jpg|png)$/.test(x.nom))) {
    throw new ErreurReprise(422, 'Fichier inattendu dans le visuel.');
  }

  const precedente = Math.max(0, ...existants.map((x) => (MOTIF_PROJET.test(x.nom) ? revision(x.nom) ?? 0 : 0)));
  const r = precedente + 1;
  if (r > REVISIONS_MAX) throw new ErreurReprise(429, 'Trop de modifications pour cette demande : écrivez-nous.');
  // Une image déjà reçue et vérifiée n'est pas renvoyée ; une image en attente est renvoyée (nouveau nom de dépôt).
  const recues = new Set(existants.filter((x) => x.verifie).map((x) => x.nom));
  const aEnvoyer = annonces
    .filter((x) => MOTIF_PROJET.test(x.nom) || MOTIF_APERCU.test(x.nom) || !recues.has(x.nom))
    .map((x) => ({ ...x, nomOrigine: x.nom, nom: MOTIF_PROJET.test(x.nom) || MOTIF_APERCU.test(x.nom) ? nomRevision(x.nom, r) : x.nom }));
  if (aEnvoyer.some((x) => existants.some((e) => e.nom === x.nom && !e.verifie))) {
    throw new ErreurReprise(409, 'Un envoi précédent est en cours : réessayez dans un instant.');
  }
  const total = existants.filter((x) => x.verifie).reduce((s, x) => s + x.taille_octets, 0) + aEnvoyer.reduce((s, x) => s + x.tailleOctets, 0);
  if (total > LIMITES_PAQUET.octetsTotal * 3) throw new ErreurReprise(413, 'Trop de fichiers pour cette demande : écrivez-nous.');
  return { revision: r, aEnvoyer };
}

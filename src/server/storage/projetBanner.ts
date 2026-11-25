import { LIMITES_PAQUET, NOM_PROJET } from '@/lib/banner/paquet';
import { lireDocument } from '@/lib/banner/schema';

/**
 * Vérification d'un projet Banner Studio déposé avec un devis. Un JSON n'a pas de signature
 * binaire : on exige donc le nom, la taille, l'UTF-8 strict, la structure complète du document
 * et une version connue. Fonction pure.
 */
export function verifierProjetBanner(nom: string, octets: Uint8Array): { ok: true } | { ok: false; raison: string } {
  if (nom !== NOM_PROJET) return { ok: false, raison: 'nom ou extension refusé' };
  if (octets.byteLength === 0 || octets.byteLength > LIMITES_PAQUET.octetsJson) return { ok: false, raison: 'taille invalide' };
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) return { ok: false, raison: 'marque d’ordre des octets refusée' };
  let texte: string;
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return { ok: false, raison: 'texte illisible' };
  }
  const lecture = lireDocument(texte);
  if (!lecture.ok) return { ok: false, raison: 'projet du Studio invalide' };
  return lecture.document.assets.some((a) => a.placeholder) ? { ok: false, raison: 'image d’exemple non remplacée' } : { ok: true };
}

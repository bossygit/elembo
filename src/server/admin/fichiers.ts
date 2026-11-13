/**
 * Accès aux fichiers de production d'une commande (PNG haute résolution, fiches techniques,
 * BAT) depuis le back-office.
 *
 * Les fichiers vivent dans deux stockages privés :
 *  - Vercel Blob (`fournisseur = VERCEL_BLOB`) : dossiers envoyés par le configurateur après
 *    paiement, sous `dossiers/<référence>/` ;
 *  - Supabase Storage (`fournisseur = SUPABASE`) : pièces recopiées depuis un devis (bucket
 *    `devis`) ou déposées en production (bucket `production`).
 *
 * Le navigateur ne reçoit jamais d'URL permanente : on émet une URL signée valable 60 s,
 * après contrôle du rôle par l'appelant. Les PNG d'impression dépassent souvent la limite de
 * réponse d'une fonction Vercel (4,5 Mo) : la redirection vers une URL signée évite de faire
 * transiter les octets par notre serveur.
 */

import { supabaseAdmin } from '@/server/supabase/client';
import { archiveConfiguree, telechargerFichier } from '@/server/dossiers/archive';

export const DUREE_LIEN_SECONDES = 60;
/** Au-delà, une réponse de fonction Vercel échoue : pas de repli en flux. */
const TAILLE_MAX_FLUX = 4 * 1024 * 1024;

export type FichierCommandeLigne = {
  id: string;
  commande_id: string;
  nom: string;
  chemin: string;
  type_mime: string;
  taille_octets: number;
  type_fichier: string;
  fournisseur: 'SUPABASE' | 'VERCEL_BLOB';
  verifie: boolean;
};

export async function fichierCommande(fichierId: string): Promise<FichierCommandeLigne | null> {
  const { data, error } = await supabaseAdmin()
    .from('fichiers_commande')
    .select('id, commande_id, nom, chemin, type_mime, taille_octets, type_fichier, fournisseur, verifie')
    .eq('id', fichierId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FichierCommandeLigne | null) ?? null;
}

/** Chemin acceptable : relatif, sans remontée ni caractère de contrôle. */
export function cheminSur(chemin: string): boolean {
  return (
    typeof chemin === 'string' &&
    chemin.length > 0 &&
    chemin.length <= 512 &&
    !chemin.startsWith('/') &&
    !chemin.includes('..') &&
    !/[\u0000-\u001f\u007f\\]/.test(chemin)
  );
}

/** Bucket Supabase d'un fichier : les pièces de devis gardent leur chemin `devis/…`. */
export function bucketSupabase(chemin: string): 'devis' | 'production' {
  return chemin.startsWith('devis/') ? 'devis' : 'production';
}

export function nomTelechargement(nom: string): string {
  return nom.replace(/[^\w.\- ]/g, '_').slice(0, 160) || 'fichier';
}

export type Livraison =
  | { type: 'redirection'; url: string }
  | { type: 'flux'; contenu: ArrayBuffer; typeMime: string }
  | { type: 'indisponible'; raison: string };

export async function preparerTelechargement(fichier: FichierCommandeLigne): Promise<Livraison> {
  if (!cheminSur(fichier.chemin)) return { type: 'indisponible', raison: 'Chemin de fichier invalide.' };

  if (fichier.fournisseur === 'SUPABASE') {
    // Une pièce issue d'un devis n'est servie qu'après vérification de son contenu.
    if (fichier.chemin.startsWith('devis/') && !fichier.verifie) {
      return { type: 'indisponible', raison: 'Fichier non vérifié : téléchargement bloqué.' };
    }
    const { data, error } = await supabaseAdmin()
      .storage.from(bucketSupabase(fichier.chemin))
      .createSignedUrl(fichier.chemin, DUREE_LIEN_SECONDES, { download: nomTelechargement(fichier.nom) });
    if (error || !data?.signedUrl) return { type: 'indisponible', raison: 'Fichier absent du stockage.' };
    return { type: 'redirection', url: data.signedUrl };
  }

  if (!fichier.chemin.startsWith('dossiers/')) {
    return { type: 'indisponible', raison: 'Chemin d’archive inattendu.' };
  }
  if (!archiveConfiguree()) return { type: 'indisponible', raison: 'Archive de production non configurée.' };

  try {
    const { issueSignedToken, presignUrl } = await import('@vercel/blob');
    const validUntil = Date.now() + DUREE_LIEN_SECONDES * 1000;
    const jeton = await issueSignedToken({ pathname: fichier.chemin, operations: ['get'], validUntil });
    const { presignedUrl } = await presignUrl(jeton, {
      operation: 'get',
      pathname: fichier.chemin,
      access: 'private',
      validUntil,
      useCache: false,
    });
    return { type: 'redirection', url: presignedUrl };
  } catch {
    // Repli : lecture côté serveur, seulement si le fichier tient dans une réponse de fonction.
    if (Number(fichier.taille_octets) > TAILLE_MAX_FLUX) {
      return { type: 'indisponible', raison: 'Lien signé indisponible et fichier trop lourd pour un envoi direct.' };
    }
    const archive = await telechargerFichier(fichier.chemin);
    if (!archive) return { type: 'indisponible', raison: 'Fichier absent de l’archive.' };
    return { type: 'flux', contenu: archive.contenu, typeMime: archive.type };
  }
}

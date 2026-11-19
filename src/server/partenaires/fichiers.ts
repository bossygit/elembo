/**
 * Fichiers du dossier partenaire : bucket privé `partenaires`, service_role uniquement.
 *
 * Envoi en trois temps (comme les pièces de devis) :
 *  1. `preparerEnvoi` : contrôles (droit, type, taille, quota, machine de l'entreprise), puis URL
 *     d'envoi signée pour un chemin fabriqué ici ;
 *  2. le navigateur envoie le fichier directement au bucket (pas de limite de corps de requête) ;
 *  3. `confirmerEnvoi` : relit les octets (signature binaire, taille, cohérence du type) ; un
 *     fichier non conforme est supprimé du bucket ; sinon la ligne `partenaire_fichiers` est créée.
 *
 * Lecture : URL signées de courte durée, fabriquées pour des lignes lues sous RLS.
 */

import { randomUUID } from 'node:crypto';

import type { TypeFichierPartenaire } from '@/lib/partenaires/catalogue';
import { FICHIER_TAILLE_MAX } from '@/lib/partenaires/catalogue';
import type { SessionPartenaire } from '@/lib/partenaires/compte';
import {
  MIMES_PAR_TYPE,
  QUOTAS,
  cheminAutorise,
  cheminFichier,
  nomAffichable,
  type MimeFichier,
} from '@/lib/partenaires/fichiers';
import { journaliser } from '@/server/admin/audit';
import { creerClientAuthServeur } from '@/server/auth/session';
import { verifierFichier, type TypeFichierVerifie } from '@/server/storage/verification';
import { supabaseAdmin } from '@/server/supabase/client';
import { ErreurIntrouvable, ErreurMetier } from './ecriture';

export const BUCKET_PARTENAIRES = 'partenaires';

const VERIFIE: Record<MimeFichier, TypeFichierVerifie> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'application/pdf': 'PDF',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bucket() {
  return supabaseAdmin().storage.from(BUCKET_PARTENAIRES);
}

async function verifierMachine(session: SessionPartenaire, machineId: string | null) {
  if (!machineId || !UUID.test(machineId)) throw new ErreurMetier('Machine invalide.');
  const { data, error } = await supabaseAdmin()
    .from('partenaire_machines')
    .select('id')
    .eq('id', machineId)
    .eq('partenaire_id', session.partenaireId)
    .eq('archive', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErreurIntrouvable('Machine introuvable.');
}

async function nombreFichiers(session: SessionPartenaire, type: TypeFichierPartenaire, machineId: string | null) {
  let q = supabaseAdmin()
    .from('partenaire_fichiers')
    .select('id', { count: 'exact', head: true })
    .eq('partenaire_id', session.partenaireId)
    .eq('type_fichier', type);
  if (type === 'MACHINE' && machineId) q = q.eq('machine_id', machineId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type DemandeEnvoi = {
  type: TypeFichierPartenaire;
  machineId: string | null;
  mime: MimeFichier;
  taille: number;
};

export async function preparerEnvoi(session: SessionPartenaire, d: DemandeEnvoi): Promise<{ chemin: string; signedUrl: string }> {
  if (!MIMES_PAR_TYPE[d.type].includes(d.mime)) throw new ErreurMetier('Format non accepté : JPEG, PNG ou WebP (PDF pour les documents).');
  if (!Number.isSafeInteger(d.taille) || d.taille <= 0) throw new ErreurMetier('Fichier vide.');
  if (d.taille > FICHIER_TAILLE_MAX) throw new ErreurMetier('Fichier trop lourd (10 Mo au plus).');
  if (d.type === 'MACHINE') await verifierMachine(session, d.machineId);
  // Le logo remplace le précédent : pas de quota à vérifier.
  if (d.type !== 'LOGO' && (await nombreFichiers(session, d.type, d.machineId)) >= QUOTAS[d.type]) {
    throw new ErreurMetier(`Limite atteinte (${QUOTAS[d.type]} fichiers). Retirez-en un avant d’en ajouter.`);
  }

  const chemin = cheminFichier(session.partenaireId, d.type, randomUUID(), d.mime);
  const { data, error } = await bucket().createSignedUploadUrl(chemin, { upsert: false });
  if (error || !data) throw new Error(error?.message ?? 'URL d’envoi indisponible.');
  return { chemin, signedUrl: data.signedUrl };
}

export type Confirmation = DemandeEnvoi & { chemin: string; nom: string | null };

export async function confirmerEnvoi(session: SessionPartenaire, c: Confirmation): Promise<string> {
  if (!cheminAutorise(c.chemin, session.partenaireId, c.type)) throw new ErreurMetier('Envoi invalide.');
  if (c.type === 'MACHINE') await verifierMachine(session, c.machineId);

  const { data, error } = await bucket().download(c.chemin);
  if (error || !data) throw new ErreurMetier('Le fichier n’est pas arrivé. Recommencez l’envoi.');
  const octets = new Uint8Array(await data.arrayBuffer());
  const extension = c.chemin.split('.').pop() ?? '';
  const verdict = verifierFichier({
    nom: `fichier.${extension}`,
    tailleOctets: octets.byteLength,
    octets,
    typesAutorises: MIMES_PAR_TYPE[c.type].map((m) => VERIFIE[m]),
    tailleMax: FICHIER_TAILLE_MAX,
  });
  if (!verdict.ok) {
    await bucket().remove([c.chemin]);
    throw new ErreurMetier('Ce fichier n’est pas une image (ou un PDF) valide. Il a été refusé.');
  }

  const { data: ligne, error: e2 } = await supabaseAdmin()
    .from('partenaire_fichiers')
    .insert({
      partenaire_id: session.partenaireId,
      machine_id: c.type === 'MACHINE' ? c.machineId : null,
      type_fichier: c.type,
      chemin: c.chemin,
      nom_original: nomAffichable(c.nom),
      type_mime: verdict.mime,
      taille_octets: octets.byteLength,
      envoye_par: session.userId,
    })
    .select('id')
    .single();
  if (e2) {
    await bucket().remove([c.chemin]);
    if (e2.code === '23505') throw new ErreurMetier('Ce fichier est déjà enregistré.');
    throw new Error(e2.message);
  }

  // Un seul logo : l'ancien est retiré une fois le nouveau enregistré.
  if (c.type === 'LOGO') {
    const { data: anciens } = await supabaseAdmin()
      .from('partenaire_fichiers')
      .select('id, chemin')
      .eq('partenaire_id', session.partenaireId)
      .eq('type_fichier', 'LOGO')
      .neq('id', ligne.id);
    if (anciens?.length) {
      await bucket().remove(anciens.map((a) => a.chemin as string));
      await supabaseAdmin().from('partenaire_fichiers').delete().in('id', anciens.map((a) => a.id as string));
    }
  }

  await journaliser({
    staff: { id: session.userId, email: session.email },
    action: 'PARTENAIRE_FICHIER_AJOUTE',
    entite: 'partenaire',
    entiteId: session.partenaireId,
    apres: { id: ligne.id, type: c.type, machine_id: c.machineId, taille: octets.byteLength },
  });
  return ligne.id as string;
}

/** Retire un fichier de l'entreprise : objet du bucket puis ligne. Renvoie son type. */
export async function supprimerFichier(session: SessionPartenaire, id: string): Promise<{ type: TypeFichierPartenaire; machineId: string | null }> {
  if (!UUID.test(id)) throw new ErreurIntrouvable('Fichier introuvable.');
  const { data, error } = await supabaseAdmin()
    .from('partenaire_fichiers')
    .select('id, chemin, type_fichier, machine_id')
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErreurIntrouvable('Fichier introuvable.');
  const { error: e1 } = await bucket().remove([data.chemin as string]);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await supabaseAdmin().from('partenaire_fichiers').delete().eq('id', id).eq('partenaire_id', session.partenaireId);
  if (e2) throw new Error(e2.message);
  await journaliser({
    staff: { id: session.userId, email: session.email },
    action: 'PARTENAIRE_FICHIER_RETIRE',
    entite: 'partenaire',
    entiteId: session.partenaireId,
    avant: { id, type: data.type_fichier, machine_id: data.machine_id },
  });
  return { type: data.type_fichier as TypeFichierPartenaire, machineId: (data.machine_id as string | null) ?? null };
}

/** Type d'un fichier de l'entreprise (pour vérifier le droit avant de le retirer). */
export async function typeDuFichier(session: SessionPartenaire, id: string): Promise<TypeFichierPartenaire | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabaseAdmin()
    .from('partenaire_fichiers')
    .select('type_fichier')
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.type_fichier as TypeFichierPartenaire | undefined) ?? null;
}

export type FichierAffiche = {
  id: string;
  type_fichier: TypeFichierPartenaire;
  machine_id: string | null;
  nom_original: string | null;
  type_mime: string;
  taille_octets: number;
  url: string | null;
};

/**
 * Fichiers de l'entreprise de la session, lus sous RLS, avec une URL signée de 10 minutes.
 * Les chemins signés proviennent de lignes que la RLS a déjà limitées à l'entreprise.
 */
export async function mesFichiers(filtre: { type?: TypeFichierPartenaire; machineId?: string } = {}): Promise<FichierAffiche[]> {
  const client = await creerClientAuthServeur();
  let q = client
    .from('partenaire_fichiers')
    .select('id, type_fichier, machine_id, nom_original, type_mime, taille_octets, chemin')
    .order('cree_le')
    .limit(60);
  if (filtre.type) q = q.eq('type_fichier', filtre.type);
  if (filtre.machineId) q = q.eq('machine_id', filtre.machineId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as (Omit<FichierAffiche, 'url'> & { chemin: string })[];
  if (!lignes.length) return [];
  const { data: urls } = await bucket().createSignedUrls(
    lignes.map((l) => l.chemin),
    600,
  );
  return lignes.map(({ chemin, ...l }) => ({ ...l, url: urls?.find((u) => u.path === chemin)?.signedUrl ?? null }));
}

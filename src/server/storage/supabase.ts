import { createHash, randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/server/supabase/client';
import {
  TAILLE_MAX_DEVIS,
  mimeAttendu,
  typeDepuisSignature,
  verifierFichier,
  type TypeFichierVerifie,
} from '@/server/storage/verification';

export const BUCKET_DEVIS = 'devis';

export type UrlEnvoi = { chemin: string; signedUrl: string; token: string };

function nomSur(nom: string): string {
  const base = nom.split(/[\\/]/).pop() ?? 'fichier';
  const sansControle = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
  return sansControle.slice(0, 120) || 'fichier';
}

function typeDepuisMime(typeMime: string): TypeFichierVerifie | null {
  const map: Record<string, TypeFichierVerifie> = {
    'application/pdf': 'PDF',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/webp': 'WEBP',
    'application/zip': 'ZIP',
    'application/x-zip-compressed': 'ZIP',
  };
  return map[typeMime] ?? null;
}

export async function creerUrlEnvoi(devisId: string, nom: string): Promise<UrlEnvoi> {
  const chemin = `devis/${devisId}/${randomUUID()}-${nomSur(nom)}`;
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET_DEVIS)
    .createSignedUploadUrl(chemin, { upsert: false });
  if (error || !data) throw new Error(error?.message ?? 'URL d’envoi indisponible.');
  return { chemin, signedUrl: data.signedUrl, token: data.token };
}

export async function creerUrlTelechargement(chemin: string, secondes = 300): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET_DEVIS)
    .createSignedUrl(chemin, secondes, { download: true });
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'URL de téléchargement indisponible.');
  return data.signedUrl;
}

export async function verifierObjetStorage(options: {
  chemin: string;
  nom: string;
  typeMime: string;
  tailleAnnoncee: number;
}): Promise<
  | { ok: true; tailleOctets: number; typeMime: string; checksum: string }
  | { ok: false; raison: string }
> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET_DEVIS).download(options.chemin);
  if (error || !data) return { ok: false, raison: 'Objet introuvable dans le bucket.' };

  const octets = new Uint8Array(await data.arrayBuffer());
  const type = typeDepuisMime(options.typeMime);
  if (!type) return { ok: false, raison: 'Type MIME non autorisé.' };

  const verdict = verifierFichier({
    nom: options.nom,
    tailleOctets: octets.byteLength,
    octets,
    typesAutorises: [type],
    tailleMax: TAILLE_MAX_DEVIS,
  });
  if (!verdict.ok) return { ok: false, raison: verdict.raison };
  if (octets.byteLength !== options.tailleAnnoncee) {
    return { ok: false, raison: 'Taille réelle différente de la taille annoncée.' };
  }
  if (verdict.mime !== mimeAttendu(type)) {
    return { ok: false, raison: 'Type MIME incohérent.' };
  }

  const checksum = createHash('sha256').update(octets).digest('hex');
  return { ok: true, tailleOctets: octets.byteLength, typeMime: verdict.mime, checksum };
}

export async function supprimerObjet(chemin: string): Promise<void> {
  const { error } = await supabaseAdmin().storage.from(BUCKET_DEVIS).remove([chemin]);
  if (error) throw new Error(error.message);
}

export function typeDepuisNom(nom: string): TypeFichierVerifie | null {
  const extension = nom.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'PNG';
    case 'jpg':
    case 'jpeg':
      return 'JPEG';
    case 'pdf':
      return 'PDF';
    case 'webp':
      return 'WEBP';
    case 'zip':
      return 'ZIP';
    default:
      return null;
  }
}

export function signatureAttendue(nom: string): TypeFichierVerifie | null {
  return typeDepuisNom(nom);
}

export { typeDepuisSignature };

/**
 * Vérification binaire des fichiers avant association à un devis ou à une commande.
 *
 * Le `Content-Type` du navigateur n'est jamais une preuve : on lit les premiers octets.
 * Cette fonction est volontairement pure (aucun accès réseau) pour être testée et réutilisée
 * par la route d'enregistrement des métadonnées.
 */

export type TypeFichierVerifie = 'PNG' | 'JPEG' | 'PDF' | 'ZIP' | 'WEBP' | 'JSON' | 'TXT';

export const TAILLE_MAX_DEVIS = 25 * 1024 * 1024;
export const TAILLE_MAX_PRODUCTION = 50 * 1024 * 1024;

const MIME: Record<TypeFichierVerifie, string> = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  PDF: 'application/pdf',
  ZIP: 'application/zip',
  WEBP: 'image/webp',
  JSON: 'application/json',
  TXT: 'text/plain',
};

const EXTENSIONS: Record<TypeFichierVerifie, string[]> = {
  PNG: ['png'],
  JPEG: ['jpg', 'jpeg'],
  PDF: ['pdf'],
  ZIP: ['zip'],
  WEBP: ['webp'],
  JSON: ['json'],
  TXT: ['txt'],
};

const EXTENSIONS_DANGEREUSES = /\.(exe|dll|bat|cmd|sh|js|mjs|cjs|html?|xhtml|svg|php|phtml|jsp|asp|aspx)(?:\.|$)/i;

function commencePar(octets: Uint8Array, signature: number[]): boolean {
  if (octets.length < signature.length) return false;
  return signature.every((valeur, index) => octets[index] === valeur);
}

function ascii(octets: Uint8Array, debut: number, longueur: number): string {
  return String.fromCharCode(...octets.slice(debut, debut + longueur));
}

export function typeDepuisSignature(octets: Uint8Array): TypeFichierVerifie | null {
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'PNG';
  if (commencePar(octets, [0xff, 0xd8, 0xff])) return 'JPEG';
  if (ascii(octets, 0, 5) === '%PDF-') return 'PDF';
  if (commencePar(octets, [0x50, 0x4b, 0x03, 0x04])) return 'ZIP';
  if (ascii(octets, 0, 4) === 'RIFF' && ascii(octets, 8, 4) === 'WEBP') return 'WEBP';
  return null;
}

export function mimeAttendu(type: TypeFichierVerifie): string {
  return MIME[type];
}

export function nomFichierAcceptable(nom: string, typesAutorises: readonly TypeFichierVerifie[]): boolean {
  const valeur = nom.trim();
  if (valeur.length < 1 || valeur.length > 120) return false;
  if (valeur.includes('/') || valeur.includes('\\') || valeur.includes('..')) return false;
  // Caractères de contrôle et séparateurs indésirables.
  if (/[\u0000-\u001f\u007f]/.test(valeur)) return false;
  if (EXTENSIONS_DANGEREUSES.test(valeur)) return false;

  const extension = valeur.split('.').pop()?.toLowerCase() ?? '';
  for (const type of typesAutorises) {
    if (EXTENSIONS[type].includes(extension)) return true;
  }
  return false;
}

export type ResultatVerification =
  | { ok: true; type: TypeFichierVerifie; mime: string }
  | { ok: false; raison: string };

export function verifierFichier(options: {
  nom: string;
  tailleOctets: number;
  octets: Uint8Array;
  typesAutorises: readonly TypeFichierVerifie[];
  tailleMax: number;
}): ResultatVerification {
  const { nom, tailleOctets, octets, typesAutorises, tailleMax } = options;

  if (!nomFichierAcceptable(nom, typesAutorises)) {
    return { ok: false, raison: 'nom ou extension refusé' };
  }
  if (!Number.isSafeInteger(tailleOctets) || tailleOctets <= 0) {
    return { ok: false, raison: 'taille invalide' };
  }
  if (tailleOctets > tailleMax) {
    return { ok: false, raison: 'fichier trop volumineux' };
  }

  const type = typeDepuisSignature(octets);
  if (!type || !typesAutorises.includes(type)) {
    return { ok: false, raison: 'signature binaire non autorisée' };
  }

  const extension = nom.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS[type].includes(extension)) {
    return { ok: false, raison: 'extension incohérente avec le contenu' };
  }

  return { ok: true, type, mime: MIME[type] };
}

import { nomFichierAcceptable, type TypeFichierVerifie } from '@/server/storage/verification';
import type { DemandeDevis, FichierAnnonce, FamilleDevis } from './types';

const FAMILLES: FamilleDevis[] = ['TEXTILE', 'TABLEAUX', 'IMPRESSION', 'SERVICES'];
const MIME: Record<string, TypeFichierVerifie> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WEBP',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
};
const MAX_FICHIER = 25 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;
const MAX_FICHIERS = 5;

export type ResultatValidation =
  | { ok: true; valeur: DemandeDevis }
  | { ok: false; erreurs: Record<string, string> };

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

export function emailValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function normaliserTelephone(brut: string): string {
  let chiffres = brut.replace(/[^\d+]/g, '');
  if (chiffres.startsWith('+')) chiffres = chiffres.slice(1);
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  if (chiffres.startsWith('242')) {
    const reste = chiffres.slice(3);
    return reste.length === 9 ? `242${reste}` : '';
  }
  if (chiffres.startsWith('0')) {
    return chiffres.length === 9 ? `242${chiffres}` : '';
  }
  return chiffres.length === 9 ? `242${chiffres}` : '';
}

function fichiersValides(brut: unknown): { ok: true; valeur: FichierAnnonce[] } | { ok: false; erreur: string } {
  if (brut === undefined || brut === null) return { ok: true, valeur: [] };
  if (!Array.isArray(brut)) return { ok: false, erreur: 'La liste des fichiers est invalide.' };
  if (brut.length > MAX_FICHIERS) return { ok: false, erreur: `Maximum ${MAX_FICHIERS} fichiers.` };

  const resultat: FichierAnnonce[] = [];
  let total = 0;
  const noms = new Set<string>();

  for (const element of brut) {
    if (!element || typeof element !== 'object') return { ok: false, erreur: 'Fichier invalide.' };
    const item = element as Record<string, unknown>;
    const nom = texte(item.nom);
    const typeMime = texte(item.typeMime);
    const taille = Number(item.tailleOctets);

    if (!nom || noms.has(nom.toLowerCase())) {
      return { ok: false, erreur: 'Chaque fichier doit avoir un nom unique.' };
    }
    const type = MIME[typeMime];
    if (!type) return { ok: false, erreur: `Type de fichier refusé : ${typeMime || 'inconnu'}.` };
    if (!nomFichierAcceptable(nom, [type])) {
      return { ok: false, erreur: `Nom de fichier refusé : ${nom}.` };
    }
    if (!Number.isSafeInteger(taille) || taille <= 0 || taille > MAX_FICHIER) {
      return { ok: false, erreur: `Taille invalide pour ${nom} (max 25 MiB).` };
    }
    total += taille;
    if (total > MAX_TOTAL) return { ok: false, erreur: 'Le volume total dépasse 50 Mo.' };

    noms.add(nom.toLowerCase());
    resultat.push({ nom, typeMime, tailleOctets: taille });
  }

  return { ok: true, valeur: resultat };
}

export function validerDemandeDevis(brut: unknown): ResultatValidation {
  const erreurs: Record<string, string> = {};
  if (!brut || typeof brut !== 'object') {
    return { ok: false, erreurs: { formulaire: 'Corps de demande invalide.' } };
  }
  const corps = brut as Record<string, unknown>;

  const famille = texte(corps.famille).toUpperCase() as FamilleDevis;
  if (!FAMILLES.includes(famille)) erreurs.famille = 'Famille de prestation invalide.';

  const nom = texte(corps.nom);
  if (nom.length < 2 || nom.length > 160) erreurs.nom = 'Le nom doit contenir entre 2 et 160 caractères.';

  const societe = texte(corps.societe).slice(0, 160) || undefined;
  const email = texte(corps.email).toLowerCase();
  if (email && !emailValide(email)) erreurs.email = 'Adresse email invalide.';

  const telephone = texte(corps.telephone);
  const telephoneNormalise = normaliserTelephone(telephone);
  if (!telephoneNormalise) erreurs.telephone = 'Numéro de téléphone congolais invalide.';

  const besoin = texte(corps.besoin);
  if (besoin.length < 10 || besoin.length > 4000) {
    erreurs.besoin = 'Décrivez votre besoin entre 10 et 4000 caractères.';
  }

  const format = texte(corps.format).slice(0, 80) || undefined;
  const quantiteBrute = corps.quantite;
  const quantite =
    quantiteBrute === undefined || quantiteBrute === null || quantiteBrute === ''
      ? undefined
      : Number(quantiteBrute);
  if (quantite !== undefined && (!Number.isSafeInteger(quantite) || quantite < 1 || quantite > 100000)) {
    erreurs.quantite = 'La quantité doit être un entier entre 1 et 100000.';
  }

  let specifications: Record<string, unknown> = {};
  if (corps.specifications !== undefined) {
    if (!corps.specifications || typeof corps.specifications !== 'object' || Array.isArray(corps.specifications)) {
      erreurs.specifications = 'Les spécifications doivent être un objet.';
    } else {
      specifications = corps.specifications as Record<string, unknown>;
      if (JSON.stringify(specifications).length > 8000) {
        erreurs.specifications = 'Les spécifications sont trop volumineuses.';
      }
    }
  }

  const fichiers = fichiersValides(corps.fichiers);
  if (!fichiers.ok) erreurs.fichiers = fichiers.erreur;

  if (corps.consentement !== true) {
    erreurs.consentement = 'Le consentement au traitement des données est requis.';
  }

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };

  return {
    ok: true,
    valeur: {
      famille,
      nom,
      societe,
      email: email || undefined,
      telephone,
      telephoneNormalise,
      typeClient: societe ? 'ENTREPRISE' : 'PARTICULIER',
      ville: texte(corps.ville).slice(0, 120) || undefined,
      besoin,
      format,
      quantite,
      specifications,
      fichiers: fichiers.ok ? fichiers.valeur : [],
      consentement: true,
    },
  };
}

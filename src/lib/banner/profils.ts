/**
 * Banner Studio — profils d'impression tels que la base les stocke (`profils_impression`), et leur
 * conversion vers le moteur. Pur : partagé par le serveur, le back-office et la route publique.
 */

import { PROFILS_PUBLICS, type ProfilImpression, type StatutProfil } from './constraints';
import type { SupportStudio } from './model';

export type LigneProfil = {
  id: string;
  nom: string;
  support: SupportStudio;
  partenaire_id: string | null;
  est_public: boolean;
  statut: StatutProfil;
  version: number;
  laize_max_mm: number | null;
  longueur_max_mm: number | null;
  marge_securite_mm: number;
  fond_perdu_mm: number;
  ourlet_mm: number;
  oeillet_diametre_mm: number;
  oeillet_espacement_mm: number;
  oeillet_marge_mm: number;
  fourreau_haut_mm: number;
  fourreau_bas_mm: number;
  dpi_min: number;
  dpi_recommande: number;
  page_max_mm: number;
  mode_grand_format: 'PANNEAUX' | 'PAGE_UNIQUE_USERUNIT';
  notes: string | null;
  valide_par_email: string | null;
  valide_le: string | null;
  maj_le: string;
};

export const SUPPORTS_PROFILS: SupportStudio[] = ['BANDEROLE', 'BACHE', 'ROLL_UP', 'KAKEMONO', 'X_BANNER', 'PANNEAU'];

export function versProfil(l: LigneProfil): ProfilImpression {
  return {
    id: l.id,
    nom: l.nom,
    support: l.support,
    estPublic: l.est_public,
    statut: l.statut,
    version: l.version,
    laizeMaxMm: l.laize_max_mm,
    longueurMaxMm: l.longueur_max_mm,
    margeSecuriteMm: l.marge_securite_mm,
    fondPerduMm: l.fond_perdu_mm,
    ourletMm: l.ourlet_mm,
    oeillets: { diametreMm: l.oeillet_diametre_mm, espacementMm: l.oeillet_espacement_mm, margeMm: l.oeillet_marge_mm },
    fourreauHautMm: l.fourreau_haut_mm,
    fourreauBasMm: l.fourreau_bas_mm,
    dpiMin: l.dpi_min,
    dpiRecommande: l.dpi_recommande,
    pageMaxMm: l.page_max_mm,
    modeGrandFormat: l.mode_grand_format,
  };
}

/** Champs que la route publique peut montrer : ni partenaire, ni notes, ni validateur. */
export function profilPublic(l: LigneProfil): ProfilImpression {
  return versProfil({ ...l, partenaire_id: null, notes: null, valide_par_email: null });
}

/** Profil retenu pour une demande : celui du partenaire affecté, sinon le public, sinon le repli codé. */
export function choisirProfil(support: SupportStudio, partenaireId: string | null, lignes: readonly LigneProfil[]): ProfilImpression {
  const actifs = lignes.filter((l) => l.support === support && l.statut !== 'ARCHIVE');
  const ligne = (partenaireId ? actifs.find((l) => l.partenaire_id === partenaireId) : undefined) ?? actifs.find((l) => l.est_public);
  return ligne ? versProfil(ligne) : PROFILS_PUBLICS[support];
}

/** Champs numériques modifiables et leurs bornes (les mêmes que les contraintes CHECK). */
export const CHAMPS_PROFIL = [
  { cle: 'laize_max_mm', libelle: 'Laize maximale', unite: 'mm', min: 100, max: 50000, facultatif: true },
  { cle: 'longueur_max_mm', libelle: 'Longueur maximale', unite: 'mm', min: 100, max: 100000, facultatif: true },
  { cle: 'marge_securite_mm', libelle: 'Marge de sécurité', unite: 'mm', min: 0, max: 1000 },
  { cle: 'fond_perdu_mm', libelle: 'Fond perdu', unite: 'mm', min: 0, max: 100 },
  { cle: 'ourlet_mm', libelle: 'Ourlet', unite: 'mm', min: 0, max: 1000 },
  { cle: 'oeillet_diametre_mm', libelle: 'Diamètre des œillets', unite: 'mm', min: 1, max: 200 },
  { cle: 'oeillet_espacement_mm', libelle: 'Espacement des œillets', unite: 'mm', min: 50, max: 5000 },
  { cle: 'oeillet_marge_mm', libelle: 'Œillets : distance au bord', unite: 'mm', min: 0, max: 500 },
  { cle: 'fourreau_haut_mm', libelle: 'Bande réservée en haut', unite: 'mm', min: 0, max: 1000 },
  { cle: 'fourreau_bas_mm', libelle: 'Bande réservée en bas', unite: 'mm', min: 0, max: 1000 },
  { cle: 'dpi_min', libelle: 'Définition minimale', unite: 'dpi', min: 30, max: 600 },
  { cle: 'dpi_recommande', libelle: 'Définition conseillée', unite: 'dpi', min: 30, max: 600 },
  { cle: 'page_max_mm', libelle: 'Page PDF maximale', unite: 'mm', min: 500, max: 5080 },
] as const;
export type CleChampProfil = (typeof CHAMPS_PROFIL)[number]['cle'];

type Saisie = Partial<Record<CleChampProfil, number | null>> & { nom?: string; mode_grand_format?: string; notes?: string | null };

/** Lit et contrôle une saisie du back-office ; renvoie les valeurs ou la première erreur lisible. */
export function lireSaisieProfil(lire: (cle: string) => string | null): { ok: true; valeurs: Saisie } | { ok: false; erreur: string } {
  const valeurs: Saisie = {};
  for (const c of CHAMPS_PROFIL) {
    const brut = (lire(c.cle) ?? '').trim();
    if (brut === '') {
      if ('facultatif' in c) { valeurs[c.cle] = null; continue; }
      return { ok: false, erreur: `${c.libelle} : valeur requise.` };
    }
    if (!/^\d{1,6}$/.test(brut)) return { ok: false, erreur: `${c.libelle} : nombre entier attendu.` };
    const n = Number(brut);
    if (n < c.min || n > c.max) return { ok: false, erreur: `${c.libelle} : entre ${c.min} et ${c.max} ${c.unite}.` };
    valeurs[c.cle] = n;
  }
  if ((valeurs.dpi_recommande ?? 0) < (valeurs.dpi_min ?? 0)) return { ok: false, erreur: 'La définition conseillée ne peut pas être inférieure au minimum.' };
  const mode = lire('mode_grand_format');
  if (mode !== null) {
    if (mode !== 'PANNEAUX' && mode !== 'PAGE_UNIQUE_USERUNIT') return { ok: false, erreur: 'Mode grand format inconnu.' };
    valeurs.mode_grand_format = mode;
  }
  const nom = lire('nom');
  if (nom !== null) {
    const n = nom.trim();
    if (n.length < 2 || n.length > 120) return { ok: false, erreur: 'Nom : 2 à 120 caractères.' };
    valeurs.nom = n;
  }
  const notes = lire('notes');
  if (notes !== null) valeurs.notes = notes.trim().slice(0, 2000) || null;
  return { ok: true, valeurs };
}

/** Capacité grand format validée d'un partenaire (Elembo Partners), en mm. */
export type CapacitePartenaire = { largeur_max_mm: number | null; longueur_max_mm: number | null; finitions: string[] };

/** Écarts entre un profil et les capacités validées du partenaire : le profil fait foi, l'écart est signalé. */
export function ecartsCapacite(p: Pick<LigneProfil, 'laize_max_mm' | 'longueur_max_mm'>, c: CapacitePartenaire | null): string[] {
  if (!c) return ['Aucune capacité grand format validée pour ce support chez ce partenaire.'];
  const e: string[] = [];
  if (c.largeur_max_mm !== null && p.laize_max_mm !== c.largeur_max_mm) e.push(`Laize : ${p.laize_max_mm ?? 'non renseignée'} mm dans le profil, ${c.largeur_max_mm} mm dans la capacité validée.`);
  if (c.longueur_max_mm !== null && p.longueur_max_mm !== c.longueur_max_mm) e.push(`Longueur : ${p.longueur_max_mm ?? 'non renseignée'} mm dans le profil, ${c.longueur_max_mm} mm dans la capacité validée.`);
  return e;
}

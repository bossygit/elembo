/**
 * Formatage et lecture d'entrées du back-office — fonctions pures, testées.
 *
 * Fuseau : l'activité est à Brazzaville (UTC+1, sans heure d'été). Toutes les dates affichées
 * et toutes les bornes de période sont exprimées dans ce fuseau, quel que soit le serveur.
 */

export const FUSEAU = 'Africa/Brazzaville';
/** Décalage fixe de Brazzaville (pas d'heure d'été). */
const DECALAGE = '+01:00';

export function fcfa(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(Number(valeur))) return '—';
  return `${Number(valeur).toLocaleString('fr-FR')} FCFA`;
}

export function taille(octets: number | null | undefined): string {
  const n = Number(octets);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024).toLocaleString('fr-FR')} Ko`;
  return `${(n / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** Libellé lisible d'une étape d'atelier (l'étape technique créée au paiement). */
export function libelleEtape(etape: string): string {
  return etape === 'INITIALISATION' ? 'Préparation (créée au paiement)' : etape;
}

export function pourcentage(valeur: number | null | undefined, decimales = 1): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return '—';
  return `${(valeur * 100).toLocaleString('fr-FR', { maximumFractionDigits: decimales, minimumFractionDigits: 0 })} %`;
}

/** Taux de marge = marge / ventes. `null` si les ventes sont nulles. */
export function tauxMarge(marge: number, ventes: number): number | null {
  return ventes > 0 ? marge / ventes : null;
}

export function dateHeure(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: FUSEAU }).format(d);
}

export function dateCourte(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? new Date(`${valeur}T12:00:00${DECALAGE}`) : new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: FUSEAU }).format(d);
}

/** Date du jour (AAAA-MM-JJ) à Brazzaville. */
export function aujourdhui(maintenant = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);
}

export function estDateIso(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const d = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur;
}

function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Début de journée (00:00 Brazzaville) en ISO UTC. */
export function debutJour(jour: string): string {
  return new Date(`${jour}T00:00:00${DECALAGE}`).toISOString();
}

export type Periode = {
  /** Clé de préréglage ou `perso`. */
  cle: string;
  libelle: string;
  /** Jours inclus (AAAA-MM-JJ, Brazzaville). */
  du: string;
  au: string;
  /** Bornes ISO : `debut` inclus, `fin` exclue (lendemain de `au` à minuit). */
  debut: string;
  fin: string;
};

export const PERIODES = [
  { cle: '7j', libelle: '7 derniers jours', jours: 7 },
  { cle: '30j', libelle: '30 derniers jours', jours: 30 },
  { cle: '90j', libelle: '90 derniers jours', jours: 90 },
  { cle: '365j', libelle: '12 derniers mois', jours: 365 },
] as const;

/**
 * Lit une période depuis les paramètres d'URL. Valeur par défaut : 30 derniers jours.
 * Une période personnalisée invalide ou inversée retombe sur la valeur par défaut ; elle est
 * plafonnée à 3 ans pour borner le coût des requêtes.
 */
export function lirePeriode(
  params: { periode?: string; du?: string; au?: string },
  maintenant = new Date(),
): Periode {
  const jour = aujourdhui(maintenant);
  if (params.periode === 'perso' && estDateIso(params.du) && estDateIso(params.au) && params.du <= params.au) {
    const du = params.du < ajouterJours(params.au, -1095) ? ajouterJours(params.au, -1095) : params.du;
    return {
      cle: 'perso',
      libelle: `Du ${dateCourte(du)} au ${dateCourte(params.au)}`,
      du,
      au: params.au,
      debut: debutJour(du),
      fin: debutJour(ajouterJours(params.au, 1)),
    };
  }
  const preset = PERIODES.find((p) => p.cle === params.periode) ?? PERIODES[1];
  const du = ajouterJours(jour, -(preset.jours - 1));
  return {
    cle: preset.cle,
    libelle: preset.libelle,
    du,
    au: jour,
    debut: debutJour(du),
    fin: debutJour(ajouterJours(jour, 1)),
  };
}

/** Bornes ISO d'un filtre « du / au » facultatif (listes). */
export function bornesDates(du?: string, au?: string): { debut: string | null; fin: string | null } {
  return {
    debut: estDateIso(du) ? debutJour(du) : null,
    fin: estDateIso(au) ? debutJour(ajouterJours(au, 1)) : null,
  };
}

/** Entier positif ou nul depuis un champ de formulaire ; `null` si vide, `NaN` si invalide. */
export function entierChamp(valeur: FormDataEntryValue | null | undefined): number | null {
  const brut = String(valeur ?? '').trim().replace(/\s/g, '');
  if (!brut) return null;
  if (!/^\d{1,10}$/.test(brut)) return Number.NaN;
  const n = Number(brut);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

export function texteChamp(valeur: FormDataEntryValue | null | undefined, max: number): string {
  return String(valeur ?? '').trim().slice(0, max);
}

export function texteOuNull(valeur: FormDataEntryValue | null | undefined, max: number): string | null {
  const t = texteChamp(valeur, max);
  return t ? t : null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estUuid(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && UUID.test(valeur);
}

/* ----------------------------------------------------------------- CSV ---- */

/**
 * Cellule CSV sûre :
 *  - guillemets doublés, champ toujours entre guillemets ;
 *  - neutralise l'injection de formule (=, +, -, @, tabulation, retour chariot en tête) en
 *    préfixant une apostrophe, sinon Excel / LibreOffice exécuteraient le contenu saisi par un
 *    client (nom, adresse, note).
 */
export function celluleCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '""';
  let texte = typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
  if (typeof valeur === 'string' && /^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  return `"${texte.replace(/"/g, '""')}"`;
}

/**
 * Document CSV pour Excel en français : séparateur `;`, fin de ligne CRLF, BOM UTF-8 pour que
 * les accents s'affichent correctement à l'ouverture.
 */
export function documentCsv(entetes: string[], lignes: unknown[][]): string {
  const corps = [entetes, ...lignes].map((ligne) => ligne.map(celluleCsv).join(';')).join('\r\n');
  return `﻿${corps}\r\n`;
}

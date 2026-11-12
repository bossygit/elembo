/**
 * Persistance des projets du configurateur dans le navigateur (`localStorage`).
 *
 * POURQUOI `localStorage` : un projet n'est qu'une configuration sérialisée (JSON), bien en
 * dessous du quota navigateur. Les fichiers images, eux, ne sont PAS embarqués : ils vivent
 * dans IndexedDB (voir `src/lib/storage/asset-store.ts`) et la configuration ne référence que
 * leurs ids. C'est ce qui permet de sauvegarder trente projets sans exploser le quota.
 *
 * TROIS COLLECTIONS, TROIS BESOINS :
 * - `projets` : les projets nommés de l'utilisateur (limite 40, plus récent en tête) ;
 * - `panier`  : les projets mis de côté pour commander (limite 20, plus récent en tête) ;
 * - `brouillon` : le projet en cours d'édition, écrasé à chaque modification.
 *
 * RÈGLE DE TOLÉRANCE : le contenu de `localStorage` peut être absent, écrit par une version
 * antérieure, tronqué ou corrompu (extension, autre onglet, quota). Une lecture ne doit donc
 * JAMAIS jeter : JSON invalide → liste vide / `null`, entrée invalide → ignorée. Toute
 * écriture renvoie `false` si le navigateur refuse (quota), sans exception.
 *
 * Les aperçus (data URL) sont le champ le plus lourd : au-delà de 400 000 caractères ils
 * sont omis à l'écriture. Un aperçu manquant est un simple défaut d'affichage ; un
 * `localStorage` saturé, lui, ferait échouer TOUTES les sauvegardes. On sacrifie donc
 * l'aperçu plutôt que la persistance du projet.
 */

import type { ConfiguratorConfig } from '../../types/configurator';

/**
 * Sous-ensemble de `Storage` réellement utilisé. Permet d'injecter une implémentation en
 * mémoire dans les tests sans dépendre de jsdom ni d'un vrai navigateur.
 */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Un projet tel qu'il est conservé sur l'appareil. */
export type ProjetSauvegarde = {
  id: string;
  nom: string;
  /** Dates ISO 8601 : `modifieLe` sert au tri, `creeLe` au classement d'ancienneté. */
  creeLe: string;
  modifieLe: string;
  config: ConfiguratorConfig;
  /** Data URL d'aperçu (facultative, ignorée si trop volumineuse). */
  apercu?: string;
  prixFcfa?: number | null;
};

const CLE_PROJETS = 'elembo.projets.v1';
const CLE_PANIER = 'elembo.panier.v1';
const CLE_BROUILLON = 'elembo.brouillon.v1';

/** Bornes de volume : au-delà, on sacrifie le plus ancien pour ne pas saturer le quota. */
const MAX_PROJETS = 40;
const MAX_PANIER = 20;

/** Longueur maximale d'une data URL d'aperçu conservée (≈ 400 Ko de texte). */
const TAILLE_APERCU_MAX = 400_000;

/**
 * Poids maximal d'un projet dans le panier, en caractères sérialisés (≈ 400 Ko).
 * Un panier peut contenir 20 entrées : sans plafond, quelques aperçus suffiraient à
 * atteindre les ~5 Mo de `localStorage` et à faire échouer toute écriture ultérieure.
 */
const POIDS_ELEMENT_PANIER_MAX = 400 * 1024;

/** `localStorage` quand il est utilisable (SSR, cookies bloqués : `null`, sans jeter). */
export function storageNavigateur(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Safari en navigation privée expose `localStorage` mais son accès jette : on renonce.
    return null;
  }
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function chaine(valeur: unknown): valeur is string {
  return typeof valeur === 'string';
}

/**
 * Validation MINIMALE d'un projet relu : un id exploitable et une configuration objet avec
 * un `productId`. C'est le contrat plancher pour que les listes et le panier restent
 * utilisables (suppression par id, réouverture) ; au-delà, une donnée altérée est ignorée
 * plutôt que propagée telle quelle au store du configurateur.
 *
 * Les champs facultatifs sont normalisés : une entrée valide mais incomplète ressort avec
 * des valeurs par défaut de bon type, jamais avec un `undefined` qui mentirait au typage.
 */
function normaliserProjet(brut: unknown): ProjetSauvegarde | null {
  if (!estObjet(brut)) return null;

  const { id, config } = brut;
  if (!chaine(id) || id.length === 0) return null;
  if (!estObjet(config)) return null;
  if (!chaine(config.productId) || config.productId.length === 0) return null;

  const projet: ProjetSauvegarde = {
    id,
    nom: chaine(brut.nom) ? brut.nom : '',
    creeLe: chaine(brut.creeLe) ? brut.creeLe : '',
    modifieLe: chaine(brut.modifieLe) ? brut.modifieLe : '',
    // La configuration est écrite par `serializeConfig()` du store : la valider champ par
    // champ rejetterait une config ancienne pourtant lisible. Le garde-fou ci-dessus
    // (objet + productId) suffit à écarter les entrées corrompues.
    config: config as unknown as ConfiguratorConfig,
  };

  if (chaine(brut.apercu)) projet.apercu = brut.apercu;
  if (typeof brut.prixFcfa === 'number' && Number.isFinite(brut.prixFcfa)) {
    projet.prixFcfa = brut.prixFcfa;
  } else if (brut.prixFcfa === null) {
    projet.prixFcfa = null;
  }

  return projet;
}

/**
 * Prépare un projet pour l'écriture : si l'aperçu est trop lourd, il est OMIS (le reste du
 * projet est conservé). On reconstruit l'objet sans le champ plutôt que de le mettre à
 * `undefined`, pour que `JSON.stringify` ne laisse pas de clé vide.
 */
function projetEcrit(projet: ProjetSauvegarde): ProjetSauvegarde {
  if (projet.apercu === undefined || projet.apercu.length <= TAILLE_APERCU_MAX) return projet;

  const copie: ProjetSauvegarde = {
    id: projet.id,
    nom: projet.nom,
    creeLe: projet.creeLe,
    modifieLe: projet.modifieLe,
    config: projet.config,
  };
  if (projet.prixFcfa !== undefined) copie.prixFcfa = projet.prixFcfa;
  return copie;
}

/** `JSON.stringify` protégé : une config cyclique ne doit pas faire jeter une sauvegarde. */
function serialiser(valeur: unknown): string | null {
  try {
    return JSON.stringify(valeur);
  } catch {
    return null;
  }
}

/** Écrit une valeur JSON ; `false` si le stockage est absent ou refuse (quota). */
function ecrireJson(stockage: StorageLike | null, cle: string, valeur: unknown): boolean {
  if (!stockage) return false;
  const texte = serialiser(valeur);
  if (texte === null) return false;
  try {
    stockage.setItem(cle, texte);
    return true;
  } catch {
    // Quota dépassé, mode privé, stockage désactivé : l'appelant affiche un état dégradé.
    return false;
  }
}

/** Lit et désérialise une valeur ; `null` si absente, illisible ou de forme inattendue. */
function lireJson(stockage: StorageLike | null, cle: string): unknown {
  if (!stockage) return null;
  try {
    const texte = stockage.getItem(cle);
    if (!texte) return null;
    return JSON.parse(texte) as unknown;
  } catch {
    return null;
  }
}

/** Lit une liste de projets en ignorant les entrées invalides et les doublons d'id. */
function lireListe(
  stockage: StorageLike | null,
  cle: string,
  limite?: number,
): ProjetSauvegarde[] {
  const brut = lireJson(stockage, cle);
  if (!Array.isArray(brut)) return [];

  const vus = new Set<string>();
  const liste: ProjetSauvegarde[] = [];
  for (const entree of brut) {
    const projet = normaliserProjet(entree);
    if (!projet || vus.has(projet.id)) continue;
    vus.add(projet.id);
    liste.push(projet);
    if (limite !== undefined && liste.length >= limite) break;
  }
  return liste;
}

function ecrireListe(
  stockage: StorageLike | null,
  cle: string,
  liste: ProjetSauvegarde[],
): boolean {
  return ecrireJson(stockage, cle, liste);
}

/** Horodatage comparable ; une date invalide passe en dernier plutôt que de fausser le tri. */
function horodatage(dateIso: string): number {
  const temps = Date.parse(dateIso);
  return Number.isNaN(temps) ? 0 : temps;
}

/** Du plus récent au plus ancien. Le tri est stable : à date égale, l'ordre d'ajout compte. */
function trierProjets(liste: ProjetSauvegarde[]): ProjetSauvegarde[] {
  return [...liste].sort((a, b) => horodatage(b.modifieLe) - horodatage(a.modifieLe));
}

/** Liste les projets sauvegardés, du plus récent au plus ancien (40 au maximum). */
export function listerProjets(stockage: StorageLike | null = storageNavigateur()): ProjetSauvegarde[] {
  // Tri à la lecture en plus du tri à l'écriture : une donnée écrite par une version
  // antérieure (ou par un autre onglet) peut ne pas être ordonnée.
  return trierProjets(lireListe(stockage, CLE_PROJETS)).slice(0, MAX_PROJETS);
}

/**
 * Sauvegarde un projet : remplace l'entrée de même id, trie du plus récent au plus ancien et
 * ne conserve que les 40 derniers. Renvoie `false` si l'entrée est invalide, si le stockage
 * est indisponible ou si le quota est atteint.
 */
export function sauverProjet(
  projet: ProjetSauvegarde,
  stockage: StorageLike | null = storageNavigateur(),
): boolean {
  const propre = normaliserProjet(projet);
  if (!propre) return false;

  // On filtre l'ancienne version AVANT d'ajouter : un même id ne peut pas apparaître deux fois.
  const autres = listerProjets(stockage).filter((p) => p.id !== propre.id);
  const liste = trierProjets([projetEcrit(propre), ...autres]).slice(0, MAX_PROJETS);
  return ecrireListe(stockage, CLE_PROJETS, liste);
}

/** Supprime un projet par id. Best effort : ne jette jamais, même si l'écriture échoue. */
export function supprimerProjet(id: string, stockage: StorageLike | null = storageNavigateur()): void {
  const liste = listerProjets(stockage).filter((p) => p.id !== id);
  ecrireListe(stockage, CLE_PROJETS, liste);
}

/** Relit le brouillon en cours ; `null` s'il n'y en a pas (ou s'il est illisible). */
export function lireBrouillon(stockage: StorageLike | null = storageNavigateur()): ProjetSauvegarde | null {
  return normaliserProjet(lireJson(stockage, CLE_BROUILLON));
}

/**
 * Écrit le brouillon (écrasé à chaque appel). Un aperçu trop lourd est omis, comme pour les
 * projets : mieux vaut restaurer un brouillon sans vignette que perdre le travail en cours.
 */
export function ecrireBrouillon(
  projet: ProjetSauvegarde,
  stockage: StorageLike | null = storageNavigateur(),
): boolean {
  const propre = normaliserProjet(projet);
  if (!propre) return false;
  return ecrireJson(stockage, CLE_BROUILLON, projetEcrit(propre));
}

/** Efface le brouillon. Best effort : ne jette jamais. */
export function effacerBrouillon(stockage: StorageLike | null = storageNavigateur()): void {
  if (!stockage) return;
  try {
    stockage.removeItem(CLE_BROUILLON);
  } catch {
    // Stockage inaccessible : il n'y a de toute façon rien à effacer.
  }
}

/** Liste le panier, du plus récent au plus ancien (20 au maximum). */
export function listerPanier(stockage: StorageLike | null = storageNavigateur()): ProjetSauvegarde[] {
  return lireListe(stockage, CLE_PANIER, MAX_PANIER);
}

/**
 * Ajoute un projet au panier :
 * - pas de doublon d'id : la version ajoutée remplace l'ancienne ET passe en tête ;
 * - 20 entrées au maximum, les plus anciennes tombent ;
 * - un projet trop lourd (> 400 Ko sérialisé) n'est PAS conservé : il est retiré du panier
 *   (y compris une éventuelle version antérieure), pour ne pas saturer le quota.
 * Renvoie `false` si l'entrée est invalide, trop lourde, ou si l'écriture échoue.
 */
export function ajouterAuPanier(
  projet: ProjetSauvegarde,
  stockage: StorageLike | null = storageNavigateur(),
): boolean {
  const propre = normaliserProjet(projet);
  if (!propre) return false;

  const ecrit = projetEcrit(propre);
  const autres = listerPanier(stockage).filter((p) => p.id !== ecrit.id);

  const texte = serialiser(ecrit);
  if (texte === null) return false;

  if (texte.length > POIDS_ELEMENT_PANIER_MAX) {
    // On réécrit la liste nettoyée de cet id : l'élément encombrant n'est jamais ajouté et
    // son ancienne version disparaît. Le quota n'augmente pas.
    ecrireListe(stockage, CLE_PANIER, autres);
    return false;
  }

  return ecrireListe(stockage, CLE_PANIER, [ecrit, ...autres].slice(0, MAX_PANIER));
}

/** Retire un projet du panier. Best effort : ne jette jamais. */
export function retirerDuPanier(id: string, stockage: StorageLike | null = storageNavigateur()): void {
  const liste = listerPanier(stockage).filter((p) => p.id !== id);
  ecrireListe(stockage, CLE_PANIER, liste);
}

/** Vide entièrement le panier. Best effort : ne jette jamais. */
export function viderPanier(stockage: StorageLike | null = storageNavigateur()): void {
  if (!stockage) return;
  try {
    stockage.removeItem(CLE_PANIER);
  } catch {
    // Stockage inaccessible : il n'y a de toute façon rien à vider.
  }
}

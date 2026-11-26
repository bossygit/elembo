/**
 * Banner Studio — modèles (audit §10, décision 7) : dix documents JSON originaux, noms, lieux et
 * organisations fictifs, sans photo de tiers. Un modèle est un document ordinaire dont les textes
 * citent des variables `{{nom}}` et dont les cadres disent la place disponible.
 */

import type { CategorieId } from '../categories';
import { remplirTexte } from '../edition';
import type { DocumentBanner } from '../model';
import type { Mesureur } from '../polices';
import anniversaireFestif from './anniversaire-festif.json';
import conferenceRollup from './conference-rollup.json';
import culteSpecial from './culte-special.json';
import grandeCroisade from './grande-croisade.json';
import hommagePortrait from './hommage-portrait.json';
import mariageAnneaux from './mariage-anneaux.json';
import ouvertureCommerce from './ouverture-commerce.json';
import promotion from './promotion.json';
import retraitDeDeuil from './retrait-de-deuil.json';
import sensibilisation from './sensibilisation.json';

export type VariableModele = { id: string; libelle: string; exemple: string; max: number; multiligne?: boolean; /** À personnaliser : un nom, une date, un lieu. */ personnel?: boolean };
export type ModeleStudio = { id: string; nom: string; categorie: CategorieId; description: string; variables: VariableModele[]; document: DocumentBanner };

/** Ordre de la galerie. Le contenu est vérifié par `tests/bannerModeles.test.ts`. */
export const MODELES_STUDIO = [
  hommagePortrait, retraitDeDeuil, grandeCroisade, culteSpecial, mariageAnneaux,
  anniversaireFestif, ouvertureCommerce, promotion, conferenceRollup, sensibilisation,
] as unknown as ModeleStudio[];

export const modeleStudio = (id: string | null | undefined) => MODELES_STUDIO.find((m) => m.id === id) ?? null;

export type Valeurs = Record<string, string>;
export const valeursExemple = (m: ModeleStudio): Valeurs => Object.fromEntries(m.variables.map((v) => [v.id, v.exemple]));

/** Remplace `{{variable}}`. Une variable laissée vide garde son exemple : rien ne disparaît en silence. */
export function remplacerVariables(contenu: string, m: ModeleStudio, valeurs: Valeurs): string {
  return contenu.replace(/\{\{([a-z]+)\}\}/g, (_, id: string) => {
    const v = m.variables.find((x) => x.id === id);
    const brut = (valeurs[id] ?? '').trim().slice(0, v?.max ?? 200);
    const valeur = brut || v?.exemple || '';
    return v?.multiligne ? valeur : valeur.replace(/\s*\n\s*/g, ' ');
  });
}

/**
 * Document prêt à éditer. Les polices doivent être chargées avant (la mesure en dépend). Un texte
 * plus long que sa place est réduit pour y tenir, jamais tronqué.
 */
export function documentDepuisModele(m: ModeleStudio, valeurs: Valeurs, base: { id: string; creeLe: string; modifieLe: string }, mesurer: Mesureur): DocumentBanner {
  const d = structuredClone(m.document);
  const titre = m.variables.map((v) => (valeurs[v.id] ?? '').trim()).find((x, i) => x && x !== m.variables[i].exemple);
  return {
    ...d,
    ...base,
    nom: titre ? `${m.nom} — ${titre.replace(/\s+/g, ' ')}`.slice(0, 120) : m.nom,
    modeleId: m.id,
    categorie: m.categorie,
    meta: { ...d.meta, createur: 'client' },
    elements: d.elements.map((e) => (e.type === 'texte' ? remplirTexte(e, remplacerVariables(e.texte.contenu, m, valeurs), mesurer) : e)),
  };
}

/** Éléments qui montrent encore un nom, une date ou un lieu d'exemple. */
export function textesExemple(doc: DocumentBanner): Set<string> {
  const m = modeleStudio(doc.modeleId);
  if (!m) return new Set();
  const personnels = new Set(m.variables.filter((v) => v.personnel).map((v) => v.id));
  const exemples = new Set(m.document.elements.flatMap((e) => {
    if (e.type !== 'texte') return [];
    const cites = [...e.texte.contenu.matchAll(/\{\{([a-z]+)\}\}/g)].map((x) => x[1]);
    return cites.some((c) => personnels.has(c)) ? [remplacerVariables(e.texte.contenu, m, {})] : [];
  }));
  return new Set(doc.elements.flatMap((e) => (e.type === 'texte' && exemples.has(e.texte.contenu) ? [e.id] : [])));
}

/** Textes d'exemple d'un modèle, pour sa vignette. */
export function documentVignette(m: ModeleStudio): DocumentBanner {
  return { ...m.document, elements: m.document.elements.map((e) => (e.type === 'texte' ? { ...e, texte: { ...e.texte, contenu: remplacerVariables(e.texte.contenu, m, {}) } } : e)) };
}

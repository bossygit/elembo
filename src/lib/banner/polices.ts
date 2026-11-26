/**
 * Banner Studio — polices disponibles, métriques et caractères couverts.
 *
 * Catalogue **propre au Studio** (`scripts/polices-banner.py`) : l'éditeur affiche les WOFF2 et le
 * PDF embarque les TTF tirés des mêmes glyphes. Aucun gras ni italique n'est simulé : le PDF ne
 * saurait pas le reproduire.
 */

import type { MesureLigne, MetriquesPolice } from './layout';
import type { StyleTexte } from './model';
import { COUVERTURE, METRIQUES, POLICES_BANNER, type Variante } from './polices.generated';

export const POLICES = POLICES_BANNER;
export const CATEGORIES_POLICE = { sans: 'Sans empattement', serif: 'Avec empattement', script: 'Manuscrites', display: 'Titres' } as const;

export type ChoixPolice = Pick<StyleTexte, 'policeId' | 'graisse'> & Partial<Pick<StyleTexte, 'italique' | 'interlettrageEm'>>;

const parId = (id: string) => POLICES.find((p) => p.id === id);
export const policeConnue = (id: string) => parId(id) !== undefined;

/** Variante réellement utilisée : celle demandée, sinon la plus proche qui existe. */
export function varianteDe({ policeId, graisse, italique = false }: ChoixPolice): { graisse: 400 | 700; italique: boolean } {
  const autre = graisse === 400 ? 700 : 400;
  const essais: Variante[] = italique ? [`${graisse}i`, `${autre}i`, `${graisse}`, `${autre}`] : [`${graisse}`, `${autre}`];
  const v = essais.find((x) => parId(policeId)?.variantes.includes(x)) ?? `${graisse}`;
  return { graisse: v.startsWith('700') ? 700 : 400, italique: v.endsWith('i') };
}

/** Ce que l'interface peut proposer, sans jamais simuler. */
export function variantesPossibles(choix: ChoixPolice): { gras: boolean; normal: boolean; italique: boolean } {
  const v = varianteDe(choix);
  const a = (x: Variante) => parId(choix.policeId)?.variantes.includes(x) ?? false;
  const i = v.italique ? 'i' : '';
  return { gras: a(`700${i}` as Variante), normal: a(`400${i}` as Variante), italique: a(`${v.graisse}i`) };
}

export function metriquesDe(choix: ChoixPolice): MetriquesPolice {
  const v = varianteDe(choix);
  const m = METRIQUES[choix.policeId];
  return m?.[`${v.graisse}${v.italique ? 'i' : ''}` as Variante] ?? { ascendante: 1, descendante: -0.25 };
}

/** Chaîne `ctx.font`. Une police inconnue retombe sur le sans-serif (signalé par le préflight). */
export function fontCss(choix: ChoixPolice, taille: number): string {
  const nom = parId(choix.policeId)?.nom;
  const v = varianteDe(choix);
  return `${v.italique ? 'italic ' : ''}${v.graisse} ${taille}px ${nom ? `"Studio ${nom}", ` : ''}sans-serif`;
}

/** Fabrique de mesure : le navigateur mesure au canvas, les tests injectent une police fictive. */
export type Mesureur = (choix: ChoixPolice) => MesureLigne;

/* ---------------------------------------------------------------- caractères couverts -- */

const tables = new Map<string, [number, number][]>();
function plages(policeId: string): [number, number][] | null {
  const brut = COUVERTURE[policeId];
  if (!brut) return null;
  let t = tables.get(policeId);
  if (!t) {
    t = brut.split(' ').map((p) => {
      const [a, b = a] = p.split('-');
      return [parseInt(a, 16), parseInt(b, 16)];
    });
    tables.set(policeId, t);
  }
  return t;
}

/** Caractères absents de la police (sans doublon). Une police inconnue n'est pas jugée ici. */
export function glyphesManquants(policeId: string, contenu: string): string[] {
  const t = plages(policeId);
  if (!t) return [];
  const couvert = (c: number) => c === 10 || t.some(([a, b]) => c >= a && c <= b);
  return [...new Set([...contenu.normalize('NFC')].filter((x) => !couvert(x.codePointAt(0)!)))];
}

/** Polices qui contiennent tous les caractères d'un texte. */
export const policesPour = (contenu: string) => POLICES.filter((p) => glyphesManquants(p.id, contenu).length === 0);

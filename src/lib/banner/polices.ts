/**
 * Banner Studio — polices disponibles et métriques partagées.
 *
 * Les métadonnées (noms, graisses, licences) viennent du catalogue du site ; les métriques
 * verticales sont générées depuis les mêmes fichiers. Les TTF du PDF arrivent au lot 3.
 */

import { FONTS } from '@/lib/fonts.generated';

import type { MesureLigne, MetriquesPolice } from './layout';
import type { StyleTexte } from './model';
import { METRIQUES } from './polices.generated';

export const POLICES = FONTS.map((f) => ({ id: f.id, nom: f.name, categorie: f.category, graisses: f.weights as (400 | 700)[] }));

type ChoixPolice = Pick<StyleTexte, 'policeId' | 'graisse'>;

const parId = (id: string) => POLICES.find((p) => p.id === id);
export const policeConnue = (id: string) => parId(id) !== undefined;

/** Graisse réellement disponible : on n'affiche jamais un gras simulé que le PDF n'aurait pas. */
export function graisseDisponible({ policeId, graisse }: ChoixPolice): 400 | 700 {
  const p = parId(policeId);
  return !p || p.graisses.includes(graisse) ? graisse : p.graisses[0];
}

export function metriquesDe(choix: ChoixPolice): MetriquesPolice {
  const m = METRIQUES[choix.policeId];
  return m?.[graisseDisponible(choix)] ?? m?.[400] ?? { ascendante: 1, descendante: -0.25 };
}

/** Chaîne `ctx.font`. Une police inconnue retombe sur le sans-serif (signalé par le préflight). */
export function fontCss(choix: ChoixPolice, taille: number): string {
  const nom = parId(choix.policeId)?.nom;
  return `${graisseDisponible(choix)} ${taille}px ${nom ? `"${nom}", ` : ''}sans-serif`;
}

/** Fabrique de mesure : le navigateur mesure au canvas, les tests injectent une police fictive. */
export type Mesureur = (choix: ChoixPolice) => MesureLigne;

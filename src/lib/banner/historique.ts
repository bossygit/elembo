/**
 * Banner Studio — historique par instantanés. Les modifications rapprochées qui portent la même
 * clé de fusion (frappe, curseur, flèches répétées) ne font qu'une étape.
 */

export const HISTORIQUE_MAX = 60;
export const FUSION_MS = 600;

export type Historique<T> = { passe: T[]; futur: T[]; fusion: string | null; instant: number };

export const historiqueVide = <T>(): Historique<T> => ({ passe: [], futur: [], fusion: null, instant: 0 });

/** Enregistre l'état `avant` une modification. */
export function enregistrer<T>(h: Historique<T>, avant: T, maintenant: number, fusion: string | null = null): Historique<T> {
  if (fusion !== null && fusion === h.fusion && maintenant - h.instant < FUSION_MS) return { ...h, futur: [], instant: maintenant };
  return { passe: [...h.passe, avant].slice(-HISTORIQUE_MAX), futur: [], fusion, instant: maintenant };
}

export function annuler<T>(h: Historique<T>, present: T): { historique: Historique<T>; present: T } | null {
  if (!h.passe.length) return null;
  return { present: h.passe[h.passe.length - 1], historique: { passe: h.passe.slice(0, -1), futur: [present, ...h.futur], fusion: null, instant: 0 } };
}

export function retablir<T>(h: Historique<T>, present: T): { historique: Historique<T>; present: T } | null {
  if (!h.futur.length) return null;
  return { present: h.futur[0], historique: { passe: [...h.passe, present], futur: h.futur.slice(1), fusion: null, instant: 0 } };
}

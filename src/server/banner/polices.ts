import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import fontkit from '@pdf-lib/fontkit';

import type { ChoixPolice, Mesureur } from '@/lib/banner/polices';
import { POLICES, varianteDe } from '@/lib/banner/polices';

/**
 * Banner Studio — polices du PDF. Les TTF viennent de `assets/banner/polices`, tirés des mêmes
 * glyphes que les WOFF2 de l'éditeur ; `next.config.ts` les joint à la fonction serveur.
 */

export type Glyphe = { id: number; advanceWidth: number; isMark: boolean; codePoints: number[] };
export type Position = { xAdvance: number; xOffset: number; yOffset: number };
export type PoliceTtf = {
  unitsPerEm: number;
  hasGlyphForCodePoint: (c: number) => boolean;
  layout: (texte: string, features?: Record<string, boolean>) => { glyphs: Glyphe[]; positions: Position[] };
};
export type PoliceChargee = { cle: string; octets: Uint8Array; police: PoliceTtf };

const DOSSIER = join(process.cwd(), 'assets', 'banner', 'polices');
const cache = new Map<string, Promise<PoliceChargee>>();

export const clePolice = (choix: ChoixPolice) => {
  const v = varianteDe(choix);
  return `${choix.policeId}-${v.graisse}${v.italique ? 'i' : ''}`;
};

/** Charge un TTF. Seules les variantes du catalogue existent : jamais de chemin venu du document. */
export async function chargerPoliceTtf(choix: ChoixPolice): Promise<PoliceChargee> {
  const cle = clePolice(choix);
  const p = POLICES.find((x) => x.id === choix.policeId);
  if (!p || !p.variantes.some((v) => `${p.id}-${v}` === cle)) throw new Error(`POLICE_INDISPONIBLE : ${choix.policeId}`);
  let c = cache.get(cle);
  if (!c) {
    c = readFile(join(DOSSIER, `${cle}.ttf`)).then((octets) => ({ cle, octets: new Uint8Array(octets), police: fontkit.create(octets) as unknown as PoliceTtf }));
    cache.set(cle, c);
    c.catch(() => cache.delete(cle));
  }
  return c;
}

/** Le navigateur coupe les ligatures dès qu'il y a un interlettrage : le PDF aussi. */
export const fonctionsOpenType = (choix: ChoixPolice): Record<string, boolean> | undefined => (choix.interlettrageEm ? { liga: false, clig: false } : undefined);

/** Composition d'une ligne : avances **crénées**, c'est toute la fidélité à l'écran. */
export const composer = (p: PoliceChargee, texte: string, choix: ChoixPolice) => p.police.layout(texte, fonctionsOpenType(choix));

/** Même convention que `mesureurNavigateur` : largeur sans l'interlettrage compté par caractère. */
export function mesureurServeur(polices: ReadonlyMap<string, PoliceChargee>): Mesureur {
  return (choix) => (texte, corpsMm) => {
    const p = polices.get(clePolice(choix));
    if (!p) throw new Error(`POLICE_INDISPONIBLE : ${choix.policeId}`);
    const r = composer(p, texte, choix);
    const em = r.positions.reduce((s, x) => s + x.xAdvance, 0) / p.police.unitsPerEm;
    // Un accent combinant ne reçoit pas d'interlettrage, mais `lignesTexte` compte les caractères.
    const marques = r.glyphs.filter((g) => g.isMark).length;
    return (em - marques * (choix.interlettrageEm ?? 0)) * corpsMm;
  };
}

export function glyphesAbsents(p: PoliceChargee, texte: string): string[] {
  return [...new Set([...texte.normalize('NFC')].filter((c) => c !== '\n' && !p.police.hasGlyphForCodePoint(c.codePointAt(0)!)))];
}

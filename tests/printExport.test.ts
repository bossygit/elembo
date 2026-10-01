import { describe, it, expect } from 'vitest';
import {
  clampElement,
  compositionSize,
  elementOverflow,
} from '../src/lib/canvas/design-canvas';
import type { Measurer } from '../src/lib/canvas/design-canvas';
import { renderPrintPng } from '../src/lib/canvas/export';
import { CATALOG, getPrintArea, getProductById } from '../src/lib/products/catalog';
import type { TextElement } from '../src/types/configurator';
import { DEFAULT_FONT_ID } from '../src/lib/fonts';

/** Mesureur qui suit la taille de police réelle (comme le fait le canvas). */
const mesureur: Measurer = (text, font) => {
  const taille = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return text.length * taille * 0.6;
};
const product = getProductById(CATALOG[0].id)!;
const AREA = getPrintArea(product, 'front')!;
const SPACE = compositionSize(AREA);

function texte(patch: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text-001',
    type: 'text',
    content: 'CONGO',
    fontId: DEFAULT_FONT_ID,
    fontSize: 100,
    color: '#000000',
    fontWeight: 700,
    fontStyle: 'normal',
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'center',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    side: 'front',
    z: 1,
    visible: true,
    ...patch,
  };
}

describe('débordement de la zone d’impression', () => {
  it('ne signale rien quand l’élément tient dans la zone', () => {
    expect(elementOverflow(texte({ fontSize: 60 }), AREA, SPACE, mesureur).over).toBe(false);
  });

  it('signale un texte trop grand et propose le facteur d’ajustement', () => {
    const el = texte({ fontSize: 400, content: 'UN TEXTE BEAUCOUP TROP LARGE' });
    const { over, factor } = elementOverflow(el, AREA, SPACE, mesureur);
    expect(over).toBe(true);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeGreaterThan(0);
  });

  it('le facteur ramène effectivement l’élément dans la zone', () => {
    const el = texte({ fontSize: 400, content: 'UN TEXTE BEAUCOUP TROP LARGE' });
    const { factor } = elementOverflow(el, AREA, SPACE, mesureur);
    const ajuste = clampElement({ ...el, fontSize: Math.round(el.fontSize * factor) }, AREA, SPACE, mesureur);
    expect(elementOverflow(ajuste, AREA, SPACE, mesureur).over).toBe(false);
  });

  it('tient compte de la rotation dans la boîte occupée', () => {
    const droit = elementOverflow(texte({ fontSize: 300, content: 'ASSEZ LARGE ICI' }), AREA, SPACE, mesureur);
    const tourne = elementOverflow(texte({ fontSize: 300, content: 'ASSEZ LARGE ICI', rotation: 90 }), AREA, SPACE, mesureur);
    // Tourné d'un quart de tour, le texte occupe la hauteur : le facteur diffère.
    expect(tourne.factor).not.toBeCloseTo(droit.factor, 3);
  });

  it('ne signale rien sans zone d’impression', () => {
    expect(elementOverflow(texte({ fontSize: 900 }), null, SPACE, mesureur).over).toBe(false);
  });
});

/* ------------------------------------------------------------------ export ------ */

type Appel = { methode: string; args: number[] };

/** Faux canvas : enregistre les appels du contexte, sans navigateur. */
function fauxCanvas() {
  const appels: Appel[] = [];
  const textes: string[] = [];
  const ctx: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'top',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    measureText: (t: string) => {
      textes.push(t);
      const taille = Number(/(\d+(?:\.\d+)?)px/.exec(String(ctx.font))?.[1] ?? 16);
      return { width: t.length * taille * 0.6 };
    },
  };
  for (const m of ['clearRect', 'fillRect', 'save', 'restore', 'beginPath', 'rect', 'clip', 'translate', 'rotate', 'scale', 'drawImage', 'fillText', 'strokeRect', 'setLineDash']) {
    ctx[m] = (...args: unknown[]) => {
      appels.push({ methode: m, args: args.filter((a): a is number => typeof a === 'number') });
      return undefined;
    };
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;
  return { canvas, appels, textes };
}

describe('export d’impression : le texte est RECOMPOSÉ à la résolution cible', () => {
  it('produit un fichier à la taille physique de la zone (300 dpi)', async () => {
    const { canvas } = fauxCanvas();
    const blob = await renderPrintPng({ area: AREA, elements: [{ element: texte() }], canvas });
    expect(blob).toBeInstanceOf(Blob);
    // 21 cm × 30 cm à 300 dpi → 2480 × 3543 px
    expect(canvas.width).toBe(2480);
    expect(canvas.height).toBe(3543);
  });

  it('redessine le texte par son contenu (jamais une capture de l’aperçu)', async () => {
    const { canvas, appels, textes } = fauxCanvas();
    await renderPrintPng({ area: AREA, elements: [{ element: texte({ content: 'BRAZZAVILLE' }) }], canvas });
    expect(textes.some((t) => t.includes('BRAZZAVILLE') || 'BRAZZAVILLE'.includes(t))).toBe(true);
    // Le rapport de résolution est appliqué au contexte : c'est lui qui donne la finesse.
    // (Chaque élément applique ensuite sa propre échelle.) L'export compose dans un espace
    // de 2048 px de large, recadré sur la zone puis mis à l'échelle du fichier final.
    const echelle = appels.filter((a) => a.methode === 'scale');
    expect(echelle.length).toBeGreaterThanOrEqual(1);
    expect(echelle[0].args[0]).toBeCloseTo(2480 / 2048, 3);
  });

  it('compose tous les éléments visibles de la face, dans l’ordre des calques', async () => {
    const { canvas, textes } = fauxCanvas();
    await renderPrintPng({
      area: AREA,
      elements: [
        { element: texte({ id: 'text-001', content: 'PREMIER', z: 1 }) },
        { element: texte({ id: 'text-002', content: 'SECOND', z: 2 }) },
      ],
      canvas,
    });
    const premier = textes.findIndex((t) => t.includes('PREMIER'));
    const second = textes.findIndex((t) => t.includes('SECOND'));
    expect(premier).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(premier);
  });

  it('ignore les éléments masqués et n’exporte rien sans élément visible', async () => {
    const { canvas, textes } = fauxCanvas();
    await renderPrintPng({ area: AREA, elements: [{ element: texte({ visible: false, content: 'CACHÉ' }) }], canvas });
    expect(textes.some((t) => t.includes('CACHÉ'))).toBe(false);
    expect(await renderPrintPng({ area: AREA, elements: [], canvas })).toBeNull();
  });
});

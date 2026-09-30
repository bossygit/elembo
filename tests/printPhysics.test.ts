import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRODUCTS } from '../src/lib/products';
import { computePrintRect, computePlacement } from '../src/lib/printArea';
import { printedSizeCm } from '../src/lib/printQuality';

// Invariant physique : la conversion pixels → centimètres doit être ISOTROPE.
// Autrement dit la zone physique déclarée (zoneCm) doit avoir le même rapport
// largeur/hauteur que la zone telle qu'elle apparaît dans la photo de mockup.
// Sinon un visuel carré s'imprime en rectangle : le client valide un BAT qui ne
// correspond pas au tirage. Ce test valide products.ts contre les vrais PNG.

function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  const isPng = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) throw new Error(`pas un PNG : ${path}`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Reproduit le dimensionnement du canvas fait par MockupCanvas (plafond 1400 px).
function canvasSize(natural: { w: number; h: number }) {
  const W = Math.min(natural.w, 1400);
  return { W, H: Math.round((natural.h / natural.w) * W) };
}

describe('modèle physique des zones d’impression', () => {
  it('chaque produit référence un mockup existant', () => {
    for (const p of PRODUCTS) {
      const rel = p.mockup.replace(/^\/elembo/, '');
      expect(() => pngSize(join('public', rel)), `${p.id} → ${rel}`).not.toThrow();
    }
  });

  it('la zone physique a le même ratio que la zone dans la photo (conversion isotrope)', () => {
    for (const p of PRODUCTS) {
      const rel = p.mockup.replace(/^\/elembo/, '');
      const { W, H } = canvasSize(pngSize(join('public', rel)));
      const zoneAspectPx = (p.zone.w * W) / (p.zone.h * H);
      const zoneAspectCm = p.zoneCm.w / p.zoneCm.h;
      expect(zoneAspectCm, `${p.id} : zoneCm ${p.zoneCm.w}×${p.zoneCm.h} vs zone photo ${zoneAspectPx.toFixed(3)}`)
        .toBeCloseTo(zoneAspectPx, 2);
    }
  });

  it('un visuel carré s’imprime carré, dans les 3 modes et à toute échelle', () => {
    for (const p of PRODUCTS) {
      const rel = p.mockup.replace(/^\/elembo/, '');
      const { W, H } = canvasSize(pngSize(join('public', rel)));
      const zonePx = { w: p.zone.w * W, h: p.zone.h * H };
      for (const mode of ['contain', 'cover', 'stretch'] as const) {
        for (const scale of [0.5, 1, 1.5]) {
          const rect = computePrintRect(1000, 1000, W, H, p.zone, mode);
          const placed = computePlacement(rect, p.zone, W, H, scale, { x: 0, y: 0 });
          const cm = printedSizeCm(placed, zonePx, p.zoneCm, 1);
          // en stretch le ratio du visuel n'est pas conservé par définition
          if (mode === 'stretch') continue;
          expect(cm.w / cm.h, `${p.id} / ${mode} / ×${scale}`).toBeCloseTo(1, 2);
        }
      }
    }
  });

  it('les tailles physiques restent dans des ordres de grandeur plausibles', () => {
    for (const p of PRODUCTS) {
      const rel = p.mockup.replace(/^\/elembo/, '');
      const { W, H } = canvasSize(pngSize(join('public', rel)));
      const zonePx = { w: p.zone.w * W, h: p.zone.h * H };
      const rect = computePrintRect(1000, 1000, W, H, p.zone, 'contain');
      const cm = printedSizeCm(rect, zonePx, p.zoneCm, 1);
      expect(cm.w).toBeGreaterThan(5);
      expect(cm.w).toBeLessThan(60);
      expect(cm.h).toBeGreaterThan(5);
      expect(cm.h).toBeLessThan(70);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { framingFor } from '../src/lib/three/framing';

// Boîte du T-shirt fournisseur (unités = pouces) : 23,66 × 28,07 × 11,39, posée haut.
const TSHIRT = { min: [-11.83, 36.8, -5.67] as [number, number, number], max: [11.83, 64.87, 5.72] as [number, number, number] };
// Placeholder Elembo : 1 × 1,2 × 0,3 centré à l'origine.
const PLACEHOLDER = { min: [-0.5, -0.6, -0.15] as [number, number, number], max: [0.5, 0.6, 0.15] as [number, number, number] };

describe('cadrage automatique', () => {
  it('vise le centre réel du modèle (pas l’origine)', () => {
    const f = framingFor(TSHIRT, 35, 2.3);
    expect(f.center[0]).toBeCloseTo(0, 5);
    expect(f.center[1]).toBeCloseTo(50.835, 2); // le vêtement est haut perché
    expect(f.center[2]).toBeCloseTo(0.025, 2);
  });

  it('recule assez pour contenir toute la hauteur', () => {
    const fov = 35;
    const f = framingFor(TSHIRT, fov, 2.3);
    // distance minimale pour contenir 28,07 unités de haut, plus la profondeur
    const mini = 28.066 / 2 / Math.tan((fov * Math.PI) / 180 / 2);
    expect(f.distance).toBeGreaterThan(mini);
    expect(f.distance).toBeLessThan(mini * 1.2 + 6);
  });

  it('s’adapte à un petit modèle (placeholder)', () => {
    const f = framingFor(PLACEHOLDER, 35, 2.3);
    expect(f.center).toEqual([0, 0, 0]);
    expect(f.distance).toBeGreaterThan(1.5);
    expect(f.distance).toBeLessThan(3);
  });

  it('tient compte du format de la vue (vue étroite = recul nécessaire)', () => {
    const large = framingFor(TSHIRT, 35, 3);
    const etroit = framingFor(TSHIRT, 35, 0.5);
    expect(etroit.distance).toBeGreaterThan(large.distance);
  });

  it('borne les distances de zoom et pose le sol sous le modèle', () => {
    const f = framingFor(TSHIRT, 35, 2.3);
    expect(f.minDistance).toBeLessThan(f.distance);
    expect(f.maxDistance).toBeGreaterThan(f.distance);
    expect(f.groundY).toBeLessThan(TSHIRT.min[1]);
    expect(f.shadowScale).toBeGreaterThan(f.height);
  });

  it('résiste à une boîte dégénérée (modèle vide)', () => {
    const f = framingFor({ min: [0, 0, 0], max: [0, 0, 0] }, 35, 1);
    expect(Number.isFinite(f.distance)).toBe(true);
    expect(f.distance).toBeGreaterThan(0);
  });
});

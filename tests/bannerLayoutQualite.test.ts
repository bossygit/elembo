/**
 * Banner Studio — mise en page partagée (texte, image) et définition des images.
 * La mesure des lignes est injectée : ici une police « à chasse fixe » de 0,5 em par caractère,
 * pour des valeurs exactes et vérifiables à la main.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { encombrementTexte, lignesTexte, placementImage } from '../src/lib/banner/layout';
import type { Asset, DocumentBanner, ElementImage, ElementTexte } from '../src/lib/banner/model';
import { dpiEffectif, niveauQualite, pixelsVisibles, seuils, SEUILS_DISTANCE } from '../src/lib/banner/quality';

const reference = (): DocumentBanner => JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/banner/document-reference.json'), 'utf8'));
const metriques = { ascendante: 0.8, descendante: -0.2 };
const chasseFixe = (texte: string, corpsMm: number) => [...texte].length * 0.5 * corpsMm;

const texte = (contenu: string, style: Partial<ElementTexte['texte']> = {}, largeurMm = 1000): ElementTexte => ({
  id: 't', type: 'texte', nom: 'T', xMm: 0, yMm: 0, largeurMm, hauteurMm: 300, rotationDeg: 0, opacite: 1, verrouille: false, visible: true,
  texte: { contenu, policeId: 'essai', corpsMm: 100, couleur: '#000000', alignement: 'center', graisse: 400, italique: false, interlettrageEm: 0, interligne: 1, ...style },
});
const asset = (largeurPx: number, hauteurPx: number): Asset => ({ id: 'a', nom: 'a.jpg', mime: 'image/jpeg', largeurPx, hauteurPx });
const image = (largeurMm: number, hauteurMm: number, image: Partial<ElementImage['image']> = {}): ElementImage => ({
  id: 'i', type: 'image', nom: 'I', xMm: 0, yMm: 0, largeurMm, hauteurMm, rotationDeg: 0, opacite: 1, verrouille: false, visible: true,
  image: { assetId: 'a', recadrage: { x: 0, y: 0, l: 1, h: 1 }, ajustement: 'contain', ...image },
});

describe('mise en page du texte', () => {
  it('centre une ligne : x = −largeur / 2', () => {
    const [l] = lignesTexte(texte('ABCD'), metriques, chasseFixe);
    expect(l.largeur).toBe(200);
    expect(l.x).toBe(-100);
  });

  it('aligne à gauche et à droite sur le cadre', () => {
    expect(lignesTexte(texte('ABCD', { alignement: 'left' }), metriques, chasseFixe)[0].x).toBe(-500);
    expect(lignesTexte(texte('ABCD', { alignement: 'right' }), metriques, chasseFixe)[0].x).toBe(300);
  });

  it('l’interlettrage s’ajoute entre les caractères, pas après le dernier', () => {
    const [l] = lignesTexte(texte('ABCD', { interlettrageEm: 0.1 }), metriques, chasseFixe);
    expect(l.largeur).toBeCloseTo(200 + 3 * 10);
  });

  it('les caractères composés comptent pour un (œ, é, emoji)', () => {
    const [l] = lignesTexte(texte('cœur', { interlettrageEm: 0.1 }), metriques, (t, c) => [...t].length * 0.5 * c);
    expect(l.largeur).toBeCloseTo(4 * 50 + 3 * 10);
  });

  it('lignes explicites : lignes de base espacées de corps × interligne, bloc centré', () => {
    const lignes = lignesTexte(texte('UN\nDEUX\nTROIS', { interligne: 1.2 }), metriques, chasseFixe);
    expect(lignes.map((l) => l.texte)).toEqual(['UN', 'DEUX', 'TROIS']);
    expect(lignes[1].ligneBase - lignes[0].ligneBase).toBeCloseTo(120);
    expect(lignes[2].ligneBase - lignes[1].ligneBase).toBeCloseTo(120);
    // Symétrie : le haut de la première ligne et le bas de la dernière sont à ±bloc/2.
    const oeil = (metriques.ascendante - metriques.descendante) * 100;
    const haut = lignes[0].ligneBase - 80 - (120 - oeil) / 2;
    const bas = lignes[2].ligneBase - 80 - (120 - oeil) / 2 + 120;
    expect(haut).toBeCloseTo(-180);
    expect(bas).toBeCloseTo(180);
  });

  it('une ligne vide reste une ligne (hauteur conservée)', () => {
    const lignes = lignesTexte(texte('A\n\nB'), metriques, chasseFixe);
    expect(lignes).toHaveLength(3);
    expect(lignes[1].largeur).toBe(0);
  });

  it('encombrement : plus longue ligne et hauteur totale', () => {
    const e = encombrementTexte(texte('AB\nABCDEF', { interligne: 1.1 }), metriques, chasseFixe);
    expect(e.largeurMm).toBe(300);
    expect(e.hauteurMm).toBeCloseTo(220);
  });
});

describe('placement des images', () => {
  it('contain : la zone recadrée tient dans le cadre et touche un bord', () => {
    const p = placementImage(image(400, 400), asset(2000, 1000));
    expect(p.echelle).toBeCloseTo(0.2);
    expect(p.image).toEqual({ x: -200, y: -100, largeur: 400, hauteur: 200 });
  });

  it('cover : l’image couvre tout le cadre', () => {
    const p = placementImage(image(400, 400, { ajustement: 'cover' }), asset(2000, 1000));
    expect(p.image.x).toBeLessThanOrEqual(p.cadre.x);
    expect(p.image.y).toBeLessThanOrEqual(p.cadre.y);
    expect(p.image.x + p.image.largeur).toBeGreaterThanOrEqual(p.cadre.x + p.cadre.largeur);
    expect(p.image.y + p.image.hauteur).toBeGreaterThanOrEqual(p.cadre.y + p.cadre.hauteur);
  });

  it('le centre de la zone recadrée est au centre du cadre', () => {
    const r = { x: 0.6, y: 0.1, l: 0.3, h: 0.5 };
    const p = placementImage(image(300, 500, { recadrage: r, ajustement: 'cover' }), asset(1000, 1000));
    const centreX = p.image.x + (r.x + r.l / 2) * 1000 * p.echelle;
    const centreY = p.image.y + (r.y + r.h / 2) * 1000 * p.echelle;
    expect(centreX).toBeCloseTo(0);
    expect(centreY).toBeCloseTo(0);
  });
});

describe('définition des images', () => {
  it('seuils : le plus exigeant de la distance de lecture et du profil', () => {
    expect(SEUILS_DISTANCE[1]).toEqual({ min: 150, recommande: 300 });
    expect(seuils(3, { dpiMin: 72, dpiRecommande: 150 })).toEqual({ min: 72, recommande: 150 });
    expect(seuils(10, { dpiMin: 72, dpiRecommande: 150 })).toEqual({ min: 72, recommande: 150 });
    expect(seuils(1, { dpiMin: 100, dpiRecommande: 200 })).toEqual({ min: 150, recommande: 300 });
  });

  it('DPI d’une image entière : pixels / pouces', () => {
    expect(dpiEffectif(image(254, 254), asset(1000, 1000))).toBe(100);
  });

  it('le recadrage réduit le DPI en proportion', () => {
    expect(dpiEffectif(image(254, 254, { recadrage: { x: 0.25, y: 0.25, l: 0.5, h: 0.5 } }), asset(1000, 1000))).toBe(50);
  });

  it('on retient l’axe le plus faible', () => {
    // contain d'une image 2:1 dans un cadre carré : 1000 px sur 254 mm en largeur.
    expect(dpiEffectif(image(254, 254), asset(1000, 500))).toBe(100);
    // cover : la largeur est rognée, la hauteur impose 500 px sur 254 mm.
    expect(dpiEffectif(image(254, 254, { ajustement: 'cover' }), asset(1000, 500))).toBe(50);
    expect(pixelsVisibles(image(254, 254, { ajustement: 'cover' }), asset(1000, 500))).toEqual({ largeurPx: 500, hauteurPx: 500 });
  });

  it('niveaux : insuffisante sous le minimum, faible sous le recommandé', () => {
    const s = { min: 72, recommande: 150 };
    expect(niveauQualite(71, s)).toBe('INSUFFISANTE');
    expect(niveauQualite(72, s)).toBe('FAIBLE');
    expect(niveauQualite(149, s)).toBe('FAIBLE');
    expect(niveauQualite(150, s)).toBe('BONNE');
  });

  it('document de référence : portrait à 52 dpi, logo à 95 dpi', () => {
    const d = reference();
    const dpi = Object.fromEntries(d.elements.filter((e): e is ElementImage => e.type === 'image').map((e) => [e.id, dpiEffectif(e, d.assets.find((a) => a.id === e.image.assetId)!)]));
    expect(dpi).toEqual({ portrait: 52, logo: 95 });
  });
});

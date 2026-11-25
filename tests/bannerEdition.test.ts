/**
 * Banner Studio, lot 2 — opérations d'édition, historique, vue, contrôle des images, polices.
 * Mesure injectée : 0,5 em par caractère, donc des largeurs vérifiables à la main.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as op from '../src/lib/banner/edition';
import { annuler, enregistrer, FUSION_MS, HISTORIQUE_MAX, historiqueVide, retablir } from '../src/lib/banner/historique';
import { IMAGE_MAX_OCTETS, nomFichier, refusDimensions, refusFichier, tailleTravail, typeReel } from '../src/lib/banner/images';
import { creerDocument, creerForme, creerTexte, type DocumentBanner, type ElementTexte } from '../src/lib/banner/model';
import { fontCss, graisseDisponible, metriquesDe, POLICES, type Mesureur } from '../src/lib/banner/polices';
import { METRIQUES } from '../src/lib/banner/polices.generated';
import { validerDocument } from '../src/lib/banner/schema';
import { ajuster, contenir, pasRegle, pourcentage, ZOOM_MAX, ZOOM_MIN, zoomer } from '../src/lib/banner/vue';

const mesurer: Mesureur = () => (t, corps) => [...t].length * 0.5 * corps;
const reference = (): DocumentBanner => JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/banner/document-reference.json'), 'utf8'));
const vierge = () => {
  let n = 0;
  return creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000 }, { id: () => `d${++n}` });
};
const avecTexte = (style: Partial<ElementTexte['texte']> = {}) => {
  const d = vierge();
  const t = creerTexte(d, 'ABCD', { id: () => 't' });
  return op.ajouter(d, op.ajusterCadre({ ...t, texte: { ...t.texte, corpsMm: 100, interligne: 1, ...style } }, mesurer));
};
const texte = (d: DocumentBanner) => op.trouver(d, 't') as ElementTexte;

describe('cadre du texte', () => {
  it('suit la largeur réelle du texte et le nombre de lignes', () => {
    const d = op.poserTexte(avecTexte(), 't', { contenu: 'ABCDEFGH\nAB' }, mesurer);
    expect([texte(d).largeurMm, texte(d).hauteurMm]).toEqual([400, 200]);
  });

  it('un texte trop long est signalé hors format, au lieu de déborder en silence', () => {
    const d = op.poserTexte(avecTexte(), 't', { contenu: 'A'.repeat(80) }, mesurer);
    expect(texte(d).largeurMm).toBe(4000);
  });

  it('le bord d’alignement ne bouge pas, rotation comprise', () => {
    const gauche = (e: ElementTexte) => op.contour(e).slice(0, 2);
    const droite = (e: ElementTexte) => op.contour(e).slice(2, 4);
    for (const rotationDeg of [0, 30, -90]) {
      const a = op.tourner(avecTexte({ alignement: 'left' }), 't', rotationDeg);
      const b = op.poserTexte(a, 't', { contenu: 'ABCDEFGHIJ' }, mesurer);
      gauche(texte(b)).forEach((v, i) => expect(v).toBeCloseTo(gauche(texte(a))[i], 0));
      const c = op.tourner(avecTexte({ alignement: 'right' }), 't', rotationDeg);
      const e = op.poserTexte(c, 't', { contenu: 'AB' }, mesurer);
      droite(texte(e)).forEach((v, i) => expect(v).toBeCloseTo(droite(texte(c))[i], 0));
    }
  });

  it('nettoie ce que le schéma refuserait', () => {
    expect(op.nettoyerTexte('a\u0007b\tc\r\nd')).toBe('a b c\nd');
    expect(op.nettoyerTexte('x\n'.repeat(40)).split('\n')).toHaveLength(20);
    const d = op.poserTexte(avecTexte(), 't', { contenu: '' }, mesurer);
    expect(validerDocument(d).ok).toBe(true);
  });
});

describe('géométrie et gestes', () => {
  it('redimensionner un texte change son corps ; une forme change de cadre', () => {
    expect(op.redimensionne(texte(avecTexte()), 2, 2, mesurer).texte.corpsMm).toBe(200);
    const f = creerForme(vierge(), 'rect', { id: () => 'f' });
    expect(op.redimensionne(f, 2, 0.5, mesurer)).toMatchObject({ largeurMm: 600, hauteurMm: 150 });
  });

  it('le centre d’un élément reste dans le format', () => {
    const d = op.deplacer(avecTexte(), 't', -900, 5000);
    expect([texte(d).xMm, texte(d).yMm]).toEqual([0, 1000]);
  });

  it('les angles sont ramenés entre −180° et 180°', () => {
    expect([370, -190, 180, -180, 720].map(op.normaliserAngle)).toEqual([10, 170, 180, 180, 0]);
  });

  it('un élément verrouillé ne change pas, et le document est rendu tel quel', () => {
    const d = op.poserProprietes(avecTexte(), 't', { verrouille: true });
    expect(op.deplacer(d, 't', 10, 10)).toBe(d);
    expect(op.tourner(d, 't', 45)).toBe(d);
    expect(op.supprimer(d, 't')).toBe(d);
    expect(op.poserTexte(d, 't', { contenu: 'X' }, mesurer)).toBe(d);
    expect(op.poserGeometrie(d, 't', { largeurMm: 10 }, mesurer)).toBe(d);
  });

  it('une saisie extrême reste dans les bornes du schéma', () => {
    const f = creerForme(vierge(), 'rect', { id: () => 'f' });
    const d = op.poserGeometrie(op.ajouter(vierge(), f), 'f', { largeurMm: 1e9, hauteurMm: 0, xMm: -1e9, rotationDeg: 1e6 }, mesurer);
    expect(validerDocument(d)).toMatchObject({ ok: true });
  });
});

describe('pile, duplication, format', () => {
  it('avancer, reculer, premier plan, arrière-plan', () => {
    const ids = (d: DocumentBanner) => d.elements.map((e) => e.id).slice(0, 3).join();
    const d = reference();
    expect(ids(op.reordonner(d, 'cadre', 'avancer'))).toBe('portrait,cadre,surtitre');
    expect(op.reordonner(d, 'cadre', 'dessus').elements.at(-1)!.id).toBe('cadre');
    expect(op.reordonner(d, 'mention', 'fond').elements[0].id).toBe('mention');
    expect(op.reordonner(d, 'cadre', 'reculer')).toBe(d);
  });

  it('la copie est au-dessus de l’original, déverrouillée et indépendante', () => {
    const d = op.dupliquer(reference(), 'cadre', 'copie');
    expect(d.elements[1]).toMatchObject({ id: 'copie', verrouille: false, nom: 'Cadre or (copie)' });
    expect(validerDocument(d).ok).toBe(true);
  });

  it('changer de format garde la composition dans le format et le document valide', () => {
    for (const [l, h] of [[6000, 1000], [850, 2000], [200, 200], [50_000, 50_000]]) {
      const d = op.poserFormat(reference(), l, h, mesurer);
      expect(d.dimensions).toEqual({ largeurMm: l, hauteurMm: h });
      expect(validerDocument(d)).toMatchObject({ ok: true });
      for (const e of d.elements) expect(e.xMm >= 0 && e.xMm <= l && e.yMm >= 0 && e.yMm <= h).toBe(true);
    }
    const meme = reference();
    expect(op.poserFormat(meme, 3000, 1000, mesurer)).toBe(meme);
    expect(op.poserFormat(meme, Number.NaN, 1000, mesurer)).toBe(meme);
  });

  it('un support rigide retire les finitions qui n’ont pas de sens', () => {
    const d = op.poserSupport(vierge(), 'ROLL_UP', 'OURLETS_OEILLETS');
    expect([d.finition, d.contraintes.oeillets.actifs, d.contraintes.fourreaux.basMm]).toEqual(['SANS', false, 100]);
  });
});

describe('historique', () => {
  it('annuler puis rétablir', () => {
    let h = enregistrer(historiqueVide<string>(), 'a', 0);
    h = enregistrer(h, 'b', 10);
    const r = annuler(h, 'c')!;
    expect(r.present).toBe('b');
    expect(retablir(r.historique, r.present)!.present).toBe('c');
    expect(annuler(historiqueVide<string>(), 'x')).toBeNull();
  });

  it('fusionne les modifications rapprochées de même clé, pas les autres', () => {
    let h = enregistrer(historiqueVide<number>(), 1, 0, 'texte');
    h = enregistrer(h, 2, 300, 'texte');
    h = enregistrer(h, 3, 600, 'texte'); // moins de 600 ms après la précédente
    expect(h.passe).toEqual([1]);
    expect(enregistrer(h, 4, 600 + FUSION_MS, 'texte').passe).toEqual([1, 4]);
    expect(enregistrer(h, 4, 610, 'couleur').passe).toEqual([1, 4]);
    expect(enregistrer(enregistrer(historiqueVide<number>(), 1, 0), 2, 1).passe).toEqual([1, 2]);
  });

  it('une nouvelle modification efface le futur, et la profondeur est bornée', () => {
    const r = annuler(enregistrer(historiqueVide<number>(), 1, 0), 2)!;
    expect(enregistrer(r.historique, 1, 5).futur).toEqual([]);
    let h = historiqueVide<number>();
    for (let i = 0; i < 100; i++) h = enregistrer(h, i, i);
    expect(h.passe).toHaveLength(HISTORIQUE_MAX);
    expect(h.passe[0]).toBe(40);
  });
});

describe('vue', () => {
  const cadre = { largeur: 1000, hauteur: 600 };
  const d = { largeurMm: 3000, hauteurMm: 1000 };

  it('ajuste la banderole au cadre, centrée', () => {
    const v = ajuster(cadre, d);
    expect(v.echelle).toBeCloseTo(936 / 3000);
    expect(v.x).toBeCloseTo(32);
    expect(pourcentage(v, cadre, d)).toBe(100);
  });

  it('le point sous le curseur ne bouge pas pendant le zoom', () => {
    const v = ajuster(cadre, d);
    const a = { x: 400, y: 300 };
    const z = zoomer(v, 3, a, cadre, d);
    expect((a.x - z.x) / z.echelle).toBeCloseTo((a.x - v.x) / v.echelle);
    expect((a.y - z.y) / z.echelle).toBeCloseTo((a.y - v.y) / v.echelle);
  });

  it('le zoom est borné et la banderole ne peut pas être perdue', () => {
    const v = ajuster(cadre, d);
    expect(zoomer(v, 1e6, { x: 0, y: 0 }, cadre, d).echelle).toBeCloseTo(v.echelle * ZOOM_MAX);
    expect(zoomer(v, 1e-6, { x: 0, y: 0 }, cadre, d).echelle).toBeCloseTo(v.echelle * ZOOM_MIN);
    const c = contenir({ ...v, x: 1e6, y: -1e6 }, cadre, d);
    expect(c.x).toBe(920);
    expect(c.y + d.hauteurMm * c.echelle).toBeCloseTo(80);
  });

  it('règle : graduations rondes et assez espacées', () => {
    for (const e of [0.01, 0.31, 1, 4.7]) {
      const p = pasRegle(e);
      expect(p * e).toBeGreaterThanOrEqual(56 - 1e-6);
      expect(p * e).toBeLessThan(56 * 2.6);
    }
    expect(pasRegle(0.312)).toBe(200);
  });
});

describe('images', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  it('le type est lu dans les octets', () => {
    expect(typeReel(jpeg)).toBe('image/jpeg');
    expect(typeReel(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(typeReel(new TextEncoder().encode('<svg xmlns='))).toBeNull();
  });

  it('refuse fichier vide, trop lourd, trop petit, trop grand', () => {
    expect(refusFichier(0, jpeg)).toMatch(/vide/);
    expect(refusFichier(IMAGE_MAX_OCTETS + 1, jpeg)).toMatch(/25 Mo/);
    expect(refusFichier(100, jpeg)).toBeNull();
    expect(refusDimensions(199, 900)).toMatch(/trop petite/);
    expect(refusDimensions(10_000, 5001)).toMatch(/trop grande/);
    expect(refusDimensions(4000, 3000)).toBeNull();
  });

  it('copie de travail bornée, jamais agrandie ; nom sans chemin', () => {
    expect(tailleTravail(4096, 1024)).toEqual({ largeur: 2048, hauteur: 512 });
    expect(tailleTravail(800, 600)).toEqual({ largeur: 800, hauteur: 600 });
    expect(nomFichier('C:\\photos\\papa.jpg')).toBe('papa.jpg');
    expect(nomFichier('\u0000')).toBe('image');
  });
});

describe('polices', () => {
  it('chaque police du site a ses métriques, pour chacune de ses graisses', () => {
    for (const p of POLICES) for (const g of p.graisses) expect(METRIQUES[p.id]?.[g], `${p.id} ${g}`).toBeDefined();
  });

  it('les métriques générées sont celles que fontkit lisait au lot 0', () => {
    expect(metriquesDe({ policeId: 'anton', graisse: 400 })).toEqual({ ascendante: 1.17627, descendante: -0.329102 });
    expect(metriquesDe({ policeId: 'dm-serif-display', graisse: 400 })).toEqual({ ascendante: 1.036, descendante: -0.335 });
  });

  it('pas de gras simulé : la graisse absente est remplacée', () => {
    expect(graisseDisponible({ policeId: 'anton', graisse: 700 })).toBe(400);
    expect(fontCss({ policeId: 'anton', graisse: 700 }, 50)).toBe('400 50px "Anton", sans-serif');
    expect(fontCss({ policeId: 'inconnue', graisse: 400 }, 50)).toBe('400 50px sans-serif');
  });
});

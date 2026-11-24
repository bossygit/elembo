/**
 * Banner Studio — profils, zones, œillets, panneaux, format et alertes (préflight).
 * Sortie du lot 1 : le document de référence se valide, se met en page et produit exactement
 * les alertes attendues.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  alertesFormat, bloquant, evaluer, panneaux, PLAFOND_LIBRE_SERVICE, positionsOeillets, PROFILS_PUBLICS,
  resoudreContraintes, zones,
} from '../src/lib/banner/constraints';
import { CONTRAINTES_NEUTRES, creerDocument, type DocumentBanner, type Element } from '../src/lib/banner/model';

const reference = (): DocumentBanner => JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/banner/document-reference.json'), 'utf8'));
const codes = (d: DocumentBanner, ctx = {}) => evaluer(d, ctx).map((a) => `${a.severite} ${a.code}${a.elementId ? ` ${a.elementId}` : ''}`);
const texte = (id: string, xMm: number, yMm: number, largeurMm = 400, hauteurMm = 100, rotationDeg = 0): Element => ({
  id, type: 'texte', nom: id, xMm, yMm, largeurMm, hauteurMm, rotationDeg, opacite: 1, verrouille: false, visible: true,
  texte: { contenu: 'Texte', policeId: 'anton', corpsMm: 60, couleur: '#000000', alignement: 'center', graisse: 400, italique: false, interlettrageEm: 0, interligne: 1 },
});
const doc = (support: DocumentBanner['support'], largeurMm: number, hauteurMm: number, finition: DocumentBanner['finition'] = 'SANS') => {
  const d = creerDocument({ support, largeurMm, hauteurMm, finition }, { id: () => 'doc', maintenant: () => new Date(0) });
  d.contraintes = resoudreContraintes(PROFILS_PUBLICS[support], finition);
  return d;
};

describe('profils publics', () => {
  it('un profil par support, aucun n’est déclaré validé', () => {
    expect(Object.keys(PROFILS_PUBLICS).sort()).toEqual(['BACHE', 'BANDEROLE', 'KAKEMONO', 'PANNEAU', 'ROLL_UP', 'X_BANNER']);
    for (const p of Object.values(PROFILS_PUBLICS)) {
      expect(p.statut).toBe('A_VALIDER');
      expect(p.estPublic).toBe(true);
      expect(p.margeSecuriteMm).toBeGreaterThanOrEqual(20);
    }
  });

  it('valeurs prudentes du seed (§6.1) pour la banderole', () => {
    const p = PROFILS_PUBLICS.BANDEROLE;
    expect([p.margeSecuriteMm, p.ourletMm, p.oeillets.diametreMm, p.oeillets.espacementMm, p.oeillets.margeMm, p.dpiMin, p.dpiRecommande]).toEqual([50, 50, 20, 500, 30, 72, 150]);
    expect(p.laizeMaxMm).toBeNull(); // on n'invente pas une capacité d'imprimeur
  });
});

describe('résolution des contraintes selon la finition', () => {
  it('sans finition : ni ourlet, ni œillets, ni fourreaux', () => {
    const c = resoudreContraintes(PROFILS_PUBLICS.BANDEROLE, 'SANS');
    expect([c.ourletMm, c.oeillets.actifs, c.fourreaux.hautMm, c.fourreaux.basMm]).toEqual([0, false, 0, 0]);
  });

  it('ourlets + œillets activent les deux', () => {
    const c = resoudreContraintes(PROFILS_PUBLICS.BANDEROLE, 'OURLETS_OEILLETS');
    expect([c.ourletMm, c.oeillets.actifs]).toEqual([50, true]);
  });

  it('les fourreaux réservent des bandes haute et basse', () => {
    expect(resoudreContraintes(PROFILS_PUBLICS.BANDEROLE, 'FOURREAUX').fourreaux).toEqual({ hautMm: 60, basMm: 60 });
  });

  it('un roll-up garde la bande basse masquée par son pied, quelle que soit la finition', () => {
    const c = resoudreContraintes(PROFILS_PUBLICS.ROLL_UP, 'OURLETS_OEILLETS');
    expect([c.ourletMm, c.oeillets.actifs, c.fourreaux.basMm]).toEqual([0, false, 100]);
  });
});

describe('œillets', () => {
  it('3 × 1 m : 16 œillets, un à chaque coin, espacement ≤ 500 mm', () => {
    const p = positionsOeillets(3000, 1000, { espacementMm: 500, margeMm: 30 });
    expect(p).toHaveLength(16);
    for (const coin of [{ x: 30, y: 30 }, { x: 2970, y: 30 }, { x: 2970, y: 970 }, { x: 30, y: 970 }]) expect(p).toContainEqual(coin);
    const haut = p.filter((q) => q.y === 30).map((q) => q.x).sort((a, b) => a - b);
    haut.slice(1).forEach((x, i) => expect(x - haut[i]).toBeLessThanOrEqual(500));
  });

  it('tous à la marge du bord, sans doublon', () => {
    const p = positionsOeillets(2000, 1000, { espacementMm: 400, margeMm: 25 });
    expect(new Set(p.map((q) => `${q.x},${q.y}`)).size).toBe(p.length);
    for (const q of p) expect([25, 1975].includes(q.x) || [25, 975].includes(q.y)).toBe(true);
  });

  it('un petit format garde au moins ses quatre coins', () => {
    expect(positionsOeillets(300, 300, { espacementMm: 500, margeMm: 20 })).toHaveLength(4);
  });
});

describe('panneaux', () => {
  it('jusqu’à 5 080 mm : une seule page', () => {
    expect(panneaux(5080, 5080)).toEqual([{ debutMm: 0, longueurMm: 5080 }]);
  });

  it('6 m : deux panneaux de 3 010 mm, recouvrement de 20 mm', () => {
    expect(panneaux(6000, 5080)).toEqual([{ debutMm: 0, longueurMm: 3010 }, { debutMm: 2990, longueurMm: 3010 }]);
  });

  it('12 m : chaque panneau tient dans une page et l’ensemble couvre la longueur', () => {
    const p = panneaux(12_000, 5080);
    expect(p).toHaveLength(3);
    for (const q of p) expect(q.longueurMm).toBeLessThanOrEqual(5000);
    const dernier = p.at(-1)!;
    expect(dernier.debutMm + dernier.longueurMm).toBeCloseTo(12_000);
  });
});

describe('zones', () => {
  it('zone sûre = marge + ourlet ; quatre bandes d’ourlet', () => {
    const z = zones(reference());
    expect(z.zoneSure).toEqual({ x: 100, y: 100, largeur: 2800, hauteur: 800 });
    expect(z.ourlets).toHaveLength(4);
    expect(z.oeillets).toHaveLength(16);
    expect(z.oeillets[0].rayon).toBe(40);
    expect(z.plis).toEqual([]);
  });

  it('un fourreau repousse la zone sûre au-delà de sa bande', () => {
    const z = zones(doc('BANDEROLE', 3000, 1000, 'FOURREAUX'));
    expect(z.fourreaux).toHaveLength(2);
    expect(z.zoneSure).toEqual({ x: 50, y: 110, largeur: 2900, hauteur: 780 });
  });

  it('les plis suivent le grand côté, en paysage comme en portrait', () => {
    expect(zones(doc('BANDEROLE', 6000, 1000)).plis).toEqual([{ axe: 'x', debutMm: 2990, finMm: 3010 }]);
    expect(zones(doc('BANDEROLE', 1000, 6000)).plis).toEqual([{ axe: 'y', debutMm: 2990, finMm: 3010 }]);
  });

  it('en mode UserUnit, aucune jonction', () => {
    const d = doc('BANDEROLE', 6000, 1000);
    d.contraintes.modeGrandFormat = 'PAGE_UNIQUE_USERUNIT';
    expect(zones(d).plis).toEqual([]);
  });
});

describe('format', () => {
  it('au-delà du plafond du libre-service : sur devis (critique)', () => {
    expect(PLAFOND_LIBRE_SERVICE).toEqual({ pages: 12, surfaceM2: 100, longueurMm: 20_000 });
    expect(alertesFormat(doc('BANDEROLE', 25_000, 1000)).map((a) => a.code)).toContain('FORMAT_SUR_DEVIS');
    expect(alertesFormat(doc('BACHE', 12_000, 9000)).map((a) => a.code)).toContain('FORMAT_SUR_DEVIS');
    expect(alertesFormat(doc('BANDEROLE', 6000, 1000))).toEqual([]);
  });

  it('la laize contraint le petit côté : 5 × 1 m tient dans 3,2 m, 4 × 3,5 m non', () => {
    const tient = doc('BANDEROLE', 5000, 1000);
    tient.contraintes.laizeMaxMm = 3200;
    expect(alertesFormat(tient)).toEqual([]);
    const depasse = doc('BACHE', 4000, 3500);
    depasse.contraintes.laizeMaxMm = 3200;
    expect(alertesFormat(depasse).map((a) => a.code)).toEqual(['HORS_LAIZE']);
  });

  it('la longueur maximale contraint le grand côté', () => {
    const d = doc('BANDEROLE', 8000, 1000);
    d.contraintes.longueurMaxMm = 6000;
    expect(alertesFormat(d).map((a) => [a.code, a.severite])).toEqual([['HORS_LONGUEUR', 'critique']]);
  });
});

describe('alertes du préflight', () => {
  it('document de référence : exactement les alertes attendues, triées par sévérité', () => {
    expect(codes(reference(), { statutProfil: 'A_VALIDER' })).toEqual([
      'avertissement IMAGE_DPI_INSUFFISANT portrait',
      'avertissement ZONE_SECURITE mention',
      'avertissement OURLET mention',
      'avertissement OEILLET mention',
      'info PROFIL_A_VALIDER',
      'info ZONE_SECURITE logo',
      'info IMAGE_DPI_FAIBLE logo',
    ]);
    expect(bloquant(evaluer(reference()))).toBe(false);
  });

  it('un profil validé ne produit pas PROFIL_A_VALIDER', () => {
    expect(codes(reference(), { statutProfil: 'VALIDE' })).not.toContain('info PROFIL_A_VALIDER');
  });

  it('un élément qui sort du format est critique et bloque le PDF', () => {
    const d = reference();
    d.elements.push(texte('debord', 2950, 500));
    const a = evaluer(d);
    expect(a[0]).toMatchObject({ code: 'HORS_FORMAT', severite: 'critique', elementId: 'debord' });
    expect(bloquant(a)).toBe(true);
  });

  it('un élément invisible est ignoré', () => {
    const d = reference();
    d.elements.push({ ...texte('cache', 2950, 500), visible: false });
    expect(codes(d)).not.toContain('critique HORS_FORMAT cache');
  });

  it('avec un fond perdu, une image peut y déborder, pas un texte', () => {
    const d = doc('BANDEROLE', 3000, 1000);
    d.contraintes.fondPerduMm = 10;
    d.assets.push({ id: 'a', nom: 'a.jpg', mime: 'image/jpeg', largeurPx: 9000, hauteurPx: 3000 });
    d.elements.push(
      { id: 'fond', type: 'image', nom: 'fond', xMm: 1500, yMm: 500, largeurMm: 3020, hauteurMm: 1020, rotationDeg: 0, opacite: 1, verrouille: false, visible: true, image: { assetId: 'a', recadrage: { x: 0, y: 0, l: 1, h: 1 }, ajustement: 'cover' } },
      texte('bord', 1500, 5, 400, 30),
    );
    const c = codes(d);
    expect(c).not.toContain('critique HORS_FORMAT fond');
    expect(c).toContain('critique HORS_FORMAT bord');
  });

  it('une image absente ou d’exemple est critique', () => {
    const d = reference();
    expect(codes(d, { assetsDisponibles: new Set(['logo']) })).toContain('critique IMAGE_MANQUANTE portrait');
    d.assets[1].placeholder = true;
    expect(codes(d)).toContain('critique PLACEHOLDER logo');
  });

  it('police absente ou caractères manquants : critique (contrôle serveur)', () => {
    expect(codes(reference(), { policesDisponibles: new Set(['anton', 'bebas-neue']) })).toEqual(
      expect.arrayContaining(['critique POLICE_INDISPONIBLE nom', 'critique POLICE_INDISPONIBLE dates']),
    );
    const glyphes = (police: string, t: string) => (police === 'anton' ? [...t].filter((c) => c === 'M') : []);
    expect(codes(reference(), { glyphesManquants: glyphes })).toContain('critique POLICE_GLYPHES mention');
  });

  it('roll-up : un texte dans la bande du pied est signalé', () => {
    const d = doc('ROLL_UP', 850, 2000);
    d.elements.push(texte('bas', 425, 1960, 400, 60));
    expect(codes(d)).toContain('avertissement FOURREAU bas');
  });

  it('6 m en panneaux : un texte à cheval sur la jonction est signalé, pas un texte voisin', () => {
    const d = doc('BANDEROLE', 6000, 1000);
    d.elements.push(texte('milieu', 3000, 500, 600, 150), texte('gauche', 1500, 500, 600, 150));
    const c = codes(d);
    expect(c).toContain('avertissement PLIURE_PANNEAU milieu');
    expect(c).not.toContain('avertissement PLIURE_PANNEAU gauche');
  });

  it('un fond image en contain n’atteint pas le fond perdu (information)', () => {
    const d = doc('BANDEROLE', 3000, 1000);
    d.contraintes = { ...CONTRAINTES_NEUTRES, fondPerduMm: 10 };
    d.assets.push({ id: 'a', nom: 'a.jpg', mime: 'image/jpeg', largeurPx: 3000, hauteurPx: 3000 });
    d.fond = { type: 'image', assetId: 'a', ajustement: 'contain', couleur: '#FFFFFF' };
    expect(codes(d)).toContain('info FOND_PERDU_NON_COUVERT');
  });

  it('distance de lecture de 1 m : le logo devient insuffisant', () => {
    const d = reference();
    d.qualite.distanceLectureM = 1;
    expect(codes(d)).toContain('avertissement IMAGE_DPI_INSUFFISANT logo');
  });
});

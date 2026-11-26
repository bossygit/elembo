/**
 * Banner Studio, lot 3 — texte (styles, caractères, coupe), images (analyse, recadrage,
 * remplacement, définition), formes et décorations, fond.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { evaluer } from '../src/lib/banner/constraints';
import * as op from '../src/lib/banner/edition';
import { DECORATIONS, placementForme } from '../src/lib/banner/formes';
import { analyserImage, aNormaliser, refusFichier, tailleReecriture, typeReel } from '../src/lib/banner/images';
import { placementImage } from '../src/lib/banner/layout';
import { creerDocument, creerForme, creerImage, creerTexte, NATURES_DECORATION, type Asset, type DocumentBanner, type ElementForme, type ElementImage, type ElementTexte, type NatureForme } from '../src/lib/banner/model';
import { glyphesManquants, policesPour, variantesPossibles, type Mesureur } from '../src/lib/banner/polices';
import { dpiEffectif, dpiFond, largeurNetteMm } from '../src/lib/banner/quality';
import { auRapport, deplacerRecadrage, enFractions, normaliser, POIGNEES, recadrageVisible, tailleMin, tirerPoignee, zoomerRecadrage } from '../src/lib/banner/recadrage';
import { validerDocument } from '../src/lib/banner/schema';
import { creerStudio } from '../src/stores/banner-studio-store';

const mesurer: Mesureur = () => (t, corps) => [...t].length * 0.5 * corps;
const reference = (): DocumentBanner => JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/banner/document-reference.json'), 'utf8'));
const vierge = () => creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000 }, { id: () => 'd' });
const PHOTO: Asset = { id: 'photo', nom: 'photo.jpg', mime: 'image/jpeg', largeurPx: 4000, hauteurPx: 3000 };
const AUTRE: Asset = { id: 'autre', nom: 'autre.png', mime: 'image/png', largeurPx: 1000, hauteurPx: 1000 };
const valide = (d: DocumentBanner) => expect(validerDocument(d)).toMatchObject({ ok: true });

const avecPhoto = (p: Partial<ElementImage> = {}) => {
  const d = op.avecAsset(vierge(), PHOTO);
  const e = creerImage(d, PHOTO, { id: () => 'i' });
  return op.ajouter(d, { ...e, image: { ...e.image, ajustement: 'cover' }, ...p });
};
const image = (d: DocumentBanner) => op.trouver(d, 'i') as ElementImage;
const avecTexte = (texte: Partial<ElementTexte['texte']> = {}) => {
  const d = vierge();
  const t = creerTexte(d, 'ABCD', { id: () => 't' });
  return op.ajouter(d, op.ajusterCadre({ ...t, texte: { ...t.texte, corpsMm: 100, interligne: 1, ...texte } }, mesurer));
};
const texte = (d: DocumentBanner) => op.trouver(d, 't') as ElementTexte;

describe('texte', () => {
  it('interligne et interlettrage changent le cadre, dans leurs bornes', () => {
    let d = op.poserTexte(avecTexte(), 't', { contenu: 'AB\nCD', interligne: 1.5, interlettrageEm: 0.1 }, mesurer);
    expect([texte(d).largeurMm, texte(d).hauteurMm]).toEqual([110, 300]); // 2 × 50 + 1 × 10 ; 2 × 150
    d = op.poserTexte(d, 't', { interligne: 99, interlettrageEm: -9 }, mesurer);
    expect(texte(d).texte).toMatchObject({ interligne: 3, interlettrageEm: -0.2 });
    valide(d);
  });

  it('changer de police retire le gras ou l’italique qu’elle n’a pas', () => {
    const d = op.poserTexte(avecTexte({ policeId: 'montserrat', graisse: 700, italique: true }), 't', { policeId: 'anton' }, mesurer);
    expect(texte(d).texte).toMatchObject({ policeId: 'anton', graisse: 400, italique: false });
    expect(variantesPossibles({ policeId: 'anton', graisse: 400 })).toEqual({ gras: false, normal: true, italique: false });
    expect(variantesPossibles({ policeId: 'playfair-display', graisse: 400 })).toEqual({ gras: true, normal: true, italique: true });
  });

  it('français et lingala : chaque police annonce ce qu’elle ne contient pas', () => {
    const francais = 'Élève, « cœur » d’été à Noël — 10 000 € où ça ?';
    for (const p of policesPour('é')) expect(glyphesManquants(p.id, francais).filter((c) => c !== ' '), p.id).toEqual([]);
    expect(glyphesManquants('dm-serif-display', 'Mɔtɔ ya Nzámbe ɛ')).toEqual(['ɔ', 'ɛ']);
    expect(glyphesManquants('montserrat', 'Mɔtɔ́ ɛ́')).toEqual([]);
    expect(policesPour('ɛ ɔ').map((p) => p.id).sort()).toEqual(['anton', 'great-vibes', 'montserrat']);
    expect(glyphesManquants('anton', 'a😀\n😀')).toEqual(['😀']);
    expect(policesPour('😀')).toEqual([]);
  });

  it('un caractère absent est une alerte critique', () => {
    const d = op.poserTexte(avecTexte({ policeId: 'oswald' }), 't', { contenu: 'ɛ' }, mesurer);
    const a = evaluer(d, { glyphesManquants }).find((x) => x.code === 'POLICE_GLYPHES');
    expect(a).toMatchObject({ severite: 'critique', elementId: 't' });
    expect(a!.message).toContain('ɛ');
  });

  it('nettoie la typographie collée depuis un traitement de texte', () => {
    expect(op.nettoyerTexte('été')).toBe('été'); // accent composé
    expect(op.nettoyerTexte('10 000 F​­')).toBe('10 000 F');
    expect(op.nettoyerTexte('a b')).toBe('a\nb');
  });

  it('couper aux marges : lignes explicites, mots entiers, espaces conservés', () => {
    const m = (l: string) => l.length * 10;
    expect(op.couperLignes('un deux trois quatre', 100, m)).toBe('un deux\ntrois\nquatre');
    expect(op.couperLignes('anticonstitutionnellement oui', 100, m)).toBe('anticonstitutionnellement\noui');
    expect(op.couperLignes('a\n\nb', 100, m)).toBe('a\n\nb');
    const long = op.poserTexte(avecTexte({ alignement: 'left' }), 't', { contenu: Array(20).fill('MOT').join(' ') }, mesurer); // 79 × 50 mm
    const zone = { x: 50, y: 50, largeur: 2900, hauteur: 900 };
    const d = op.couperTexte(long, 't', zone, mesurer);
    expect(texte(d).texte.contenu.split('\n')).toHaveLength(2);
    expect(texte(d).largeurMm).toBeLessThanOrEqual(2900);
    expect(texte(d).xMm - texte(d).largeurMm / 2).toBeGreaterThanOrEqual(50);
    expect(op.couperTexte(d, 't', zone, mesurer)).toBe(d);
    valide(d);
  });

  it('l’alerte d’un texte sans nom propre le cite', () => {
    const d = op.poserTexte(avecTexte(), 't', { contenu: 'Papa Joseph Malonga nous a quittés '.repeat(4) }, mesurer);
    expect(evaluer(d).find((a) => a.elementId === 't')!.message).toContain('« Papa Joseph Malonga nous a…');
  });
});

/* ------------------------------------------------------------------ images -- */

const octets = (...parties: (number[] | string)[]) => new Uint8Array(parties.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const segment = (marque: number, contenu: Uint8Array) => [0xff, marque, (contenu.length + 2) >> 8, (contenu.length + 2) & 255, ...contenu];
const SOF = (composantes = 3) => segment(0xc0, octets([8, 0, 100, 0, 200, composantes], Array(composantes * 3).fill(0)));
const SOS = segment(0xda, octets([0]));
const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat()]);
const exif = (orientation: number, petit = false) => segment(0xe1, petit
  ? octets('Exif', [0, 0], 'II', [42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0])
  : octets('Exif', [0, 0], 'MM', [0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0]));
const icc = (nom: string) => segment(0xe2, octets('ICC_PROFILE', [0, 1, 1], Array(128).fill(0), nom));
const chunk = (nom: string, contenu: Uint8Array = new Uint8Array()) => [0, 0, contenu.length >> 8, contenu.length & 255, ...octets(nom), ...contenu, 0, 0, 0, 0];
const png = (...chunks: number[][]) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat()]);

describe('analyse d’un fichier image', () => {
  it('JPEG ordinaire : gardé tel quel', () => {
    const a = analyserImage(jpeg(exif(1), icc('sRGB IEC61966-2.1'), SOF(), SOS));
    expect(a).toMatchObject({ type: 'image/jpeg', orientation: 1, cmjn: false, profilEtranger: false, complet: true });
    expect(aNormaliser(a)).toBe(false);
    expect(aNormaliser(analyserImage(jpeg(SOF(), SOS)))).toBe(false);
  });

  it('orientation EXIF, gros et petit boutiste', () => {
    for (const petit of [false, true]) for (let o = 1; o <= 8; o++) {
      const a = analyserImage(jpeg(exif(o, petit), SOF(), SOS));
      expect(a.orientation).toBe(o);
      expect(aNormaliser(a)).toBe(o !== 1);
    }
    expect(analyserImage(jpeg(exif(9), SOF(), SOS)).orientation).toBe(1);
  });

  it('CMJN et profils de couleur étrangers sont réécrits en sRVB', () => {
    expect(aNormaliser(analyserImage(jpeg(SOF(4), SOS)))).toBe(true);
    expect(aNormaliser(analyserImage(jpeg(icc('Display P3'), SOF(), SOS)))).toBe(true);
    const srgb = octets('s\0R\0G\0B\0'); // description en UTF-16
    expect(analyserImage(jpeg(segment(0xe2, octets('ICC_PROFILE', [0, 1, 1], [...srgb])), SOF(), SOS)).profilEtranger).toBe(false);
  });

  it('en-tête tronqué ou incohérent : réécrit plutôt que deviné, jamais d’exception', () => {
    for (const o of [jpeg([0xff, 0xe1, 0xff, 0xff]), jpeg([0xff, 0, 0, 0, 0]), jpeg(exif(6))]) expect(aNormaliser(analyserImage(o))).toBe(true);
    for (const o of [jpeg(), jpeg([0, 0, 0, 0])]) expect(refusFichier(10, o)).toMatch(/non pris en charge/);
    const complet = jpeg(exif(6), SOF(), SOS);
    for (let n = 0; n <= complet.length; n++) expect(() => analyserImage(complet.slice(0, n))).not.toThrow();
  });

  it('PNG : animé refusé, profil étranger réécrit, sRGB déclaré gardé', () => {
    const ihdr = chunk('IHDR', new Uint8Array(13));
    expect(aNormaliser(analyserImage(png(ihdr, chunk('sRGB', octets([0])), chunk('IDAT'))))).toBe(false);
    expect(aNormaliser(analyserImage(png(ihdr, chunk('iCCP', octets('Photoshop ICC profile', [0, 0])), chunk('IDAT'))))).toBe(true);
    expect(refusFichier(100, png(ihdr, chunk('acTL', new Uint8Array(8)), chunk('IDAT')))).toMatch(/animée/);
  });

  it('WEBP : accepté et converti, animé refusé', () => {
    const webp = (drapeaux: number) => octets('RIFF', [0, 0, 0, 0], 'WEBPVP8X', [10, 0, 0, 0, drapeaux, 0, 0, 0]);
    expect(typeReel(webp(0))).toBe('image/webp');
    expect(aNormaliser(analyserImage(webp(0x10)))).toBe(true);
    expect(refusFichier(100, webp(0x10))).toBeNull();
    expect(refusFichier(100, webp(0x02))).toMatch(/animée/);
  });

  it('une image réécrite tient dans un canvas iOS', () => {
    expect(tailleReecriture(4032, 3024)).toEqual({ largeur: 4032, hauteur: 3024 });
    const t = tailleReecriture(8000, 6000);
    expect(t.largeur * t.hauteur).toBeLessThanOrEqual(16_777_216);
    expect(t.largeur / t.hauteur).toBeCloseTo(4 / 3, 2);
  });
});

describe('recadrage', () => {
  const min = tailleMin(PHOTO);
  const dedans = (r: { x: number; y: number; l: number; h: number }) => r.x >= 0 && r.y >= 0 && r.x + r.l <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9 && r.l > 0 && r.h > 0;

  it('déplacer reste dans l’image', () => {
    expect(deplacerRecadrage({ x: 0.2, y: 0.2, l: 0.5, h: 0.5 }, 1, -1)).toEqual({ x: 0.5, y: 0, l: 0.5, h: 0.5 });
  });

  it('tirer une poignée laisse fixe le bord opposé', () => {
    const r = { x: 0.2, y: 0.2, l: 0.4, h: 0.4 };
    expect(tirerPoignee(r, 'e', 0.1, 9, null, min)).toEqual({ x: 0.2, y: 0.2, l: 0.5, h: 0.4 });
    expect(tirerPoignee(r, 'no', 0.1, 0.1, null, min)).toEqual({ x: 0.3, y: 0.3, l: 0.3, h: 0.3 });
    expect(tirerPoignee(r, 'se', 9, 9, null, min)).toEqual({ x: 0.2, y: 0.2, l: 0.8, h: 0.8 });
    expect(tirerPoignee(r, 'e', -9, 0, null, min).l).toBe(min.l);
  });

  it('propriétés : toujours dans l’image, rapport tenu, 2 000 gestes tirés au hasard', () => {
    let graine = 7;
    const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) {
      const l = 0.05 + hasard() * 0.9;
      const h = 0.05 + hasard() * 0.9;
      let r = normaliser({ x: hasard() * (1 - l), y: hasard() * (1 - h), l, h });
      const rapport = hasard() < 0.5 ? null : 0.3 + hasard() * 2;
      if (rapport) r = auRapport(r, rapport);
      const s = tirerPoignee(r, POIGNEES[Math.floor(hasard() * 8)], hasard() * 2 - 1, hasard() * 2 - 1, rapport, min);
      expect(dedans(s)).toBe(true);
      if (rapport) expect(Math.abs(s.l / s.h - rapport) / rapport).toBeLessThan(1e-3);
      expect(dedans(zoomerRecadrage(s, hasard() * 5, min))).toBe(true);
    }
  });

  it('la fenêtre s’ouvre sur ce qui est visible', () => {
    const d = avecPhoto({ largeurMm: 600, hauteurMm: 600 });
    expect(recadrageVisible(image(d), PHOTO)).toEqual({ x: 0.125, y: 0, l: 0.75, h: 1 });
  });

  it('garder le cadre : seul le contenu change', () => {
    const avant = avecPhoto({ largeurMm: 600, hauteurMm: 600, rotationDeg: 30 });
    const d = op.poserRecadrage(avant, 'i', { x: 0, y: 0, l: 0.375, h: 0.5 }, true);
    expect(image(d)).toMatchObject({ largeurMm: 600, hauteurMm: 600, xMm: image(avant).xMm, image: { recadrage: { l: 0.375 } } });
    valide(d);
  });

  it('recadrage libre : même échelle, et ce qui reste ne bouge pas (rotation comprise)', () => {
    for (const rotationDeg of [0, 35, -90]) {
      const avant = avecPhoto({ largeurMm: 800, hauteurMm: 600, rotationDeg });
      const d = op.poserRecadrage(avant, 'i', { x: 0.5, y: 0, l: 0.5, h: 0.5 }, false);
      expect(image(d)).toMatchObject({ largeurMm: 400, hauteurMm: 300 });
      // Un même pixel de la photo est au même endroit de la banderole avant et après.
      const lieu = (e: ElementImage, px: number, py: number) => {
        const p = placementImage(e, PHOTO);
        const x = p.image.x + px * p.echelle;
        const y = p.image.y + py * p.echelle;
        const a = (e.rotationDeg * Math.PI) / 180;
        return [e.xMm + x * Math.cos(a) - y * Math.sin(a), e.yMm + x * Math.sin(a) + y * Math.cos(a)];
      };
      lieu(image(d), 3000, 700).forEach((v, k) => expect(v).toBeCloseTo(lieu(image(avant), 3000, 700)[k], 0));
      valide(d);
    }
  });

  it('rapport à l’écran : un carré reste carré en pixels', () => {
    const r = auRapport({ x: 0, y: 0, l: 1, h: 1 }, enFractions(1, PHOTO));
    expect(r.l * PHOTO.largeurPx).toBeCloseTo(r.h * PHOTO.hauteurPx, 0);
  });

  it('une image verrouillée ne se recadre pas, ne se remplace pas, ne passe pas en fond', () => {
    const d = avecPhoto({ verrouille: true });
    expect(op.poserRecadrage(d, 'i', { x: 0, y: 0, l: 0.5, h: 0.5 }, true)).toBe(d);
    expect(op.remplacerImage(d, 'i', AUTRE)).toBe(d);
    expect(op.mettreEnFond(d, 'i')).toBe(d);
  });
});

describe('images du document', () => {
  it('remplacer garde le cadre, remet le recadrage à zéro et retire l’image devenue inutile', () => {
    const avant = op.poserRecadrage(avecPhoto(), 'i', { x: 0.1, y: 0.1, l: 0.5, h: 0.5 }, true);
    const d = op.remplacerImage(avant, 'i', AUTRE);
    expect(image(d)).toMatchObject({ xMm: image(avant).xMm, largeurMm: image(avant).largeurMm, nom: 'autre.png', image: { assetId: 'autre', recadrage: { x: 0, y: 0, l: 1, h: 1 } } });
    expect(d.assets.map((a) => a.id)).toEqual(['autre']);
    valide(d);
  });

  it('une image partagée par deux cadres n’est retirée qu’avec le dernier', () => {
    const d = op.dupliquer(avecPhoto(), 'i', 'j');
    expect(op.supprimer(d, 'i').assets).toHaveLength(1);
    expect(op.supprimer(op.supprimer(d, 'i'), 'j').assets).toHaveLength(0);
  });

  it('recadrer baisse la définition ; la largeur nette le dit', () => {
    const d = avecPhoto({ largeurMm: 1016, hauteurMm: 762 }); // 4000 px sur 40 pouces
    expect(dpiEffectif(image(d), PHOTO)).toBe(100);
    expect(dpiEffectif(image(op.poserRecadrage(d, 'i', { x: 0, y: 0, l: 0.5, h: 0.5 }, true)), PHOTO)).toBe(50);
    expect(largeurNetteMm(image(d), PHOTO, 100)).toBeCloseTo(1016);
  });

  it('la distance de lecture change les seuils', () => {
    const d = { ...avecPhoto({ largeurMm: 1016, hauteurMm: 762 }) };
    const codes = (x: DocumentBanner) => evaluer(x).map((a) => a.code).filter((c) => c.startsWith('IMAGE_DPI'));
    expect(codes(op.poserDistance(d, 1))).toEqual(['IMAGE_DPI_INSUFFISANT']);
    expect(codes(op.poserDistance(d, 3))).toEqual(['IMAGE_DPI_FAIBLE']);
    const neutre = { ...d, contraintes: { ...d.contraintes, dpiMin: 30, dpiRecommande: 72 } };
    expect(codes(op.poserDistance(neutre, 10))).toEqual([]);
  });
});

describe('fond', () => {
  it('image de fond : posée, ajustée, retirée ; la couleur reste dessous', () => {
    let d = op.poserImageFond(op.poserCouleurFond(vierge(), '#0F6B4C'), PHOTO);
    expect(d.fond).toEqual({ type: 'image', assetId: 'photo', ajustement: 'cover', couleur: '#0F6B4C' });
    valide(d);
    d = op.poserCouleurFond(op.poserAjustementFond(d, 'contain'), '#FFFFFF');
    expect(d.fond).toMatchObject({ type: 'image', ajustement: 'contain', couleur: '#FFFFFF' });
    d = op.retirerImageFond(d);
    expect([d.fond, d.assets]).toEqual([{ type: 'couleur', couleur: '#FFFFFF' }, []]);
  });

  it('changer d’image de fond retire l’ancienne', () => {
    expect(op.poserImageFond(op.poserImageFond(vierge(), PHOTO), AUTRE).assets.map((a) => a.id)).toEqual(['autre']);
  });

  it('une image posée peut devenir le fond', () => {
    const d = op.mettreEnFond(avecPhoto(), 'i');
    expect(d.elements).toEqual([]);
    expect(d.fond).toMatchObject({ type: 'image', assetId: 'photo' });
    valide(d);
  });

  it('la définition du fond est contrôlée, fond perdu compris', () => {
    const d = op.poserImageFond(vierge(), PHOTO); // 3000 mm pour 4000 px : 34 dpi
    expect(dpiFond(d, PHOTO)).toBe(34);
    expect(evaluer(d)).toContainEqual(expect.objectContaining({ code: 'IMAGE_DPI_INSUFFISANT', elementId: null }));
    expect(dpiFond({ ...d, contraintes: { ...d.contraintes, fondPerduMm: 500 } }, PHOTO)).toBe(25);
    expect(evaluer(d, { assetsDisponibles: new Set() }).map((a) => a.code)).toContain('IMAGE_MANQUANTE');
  });
});

describe('formes et décorations', () => {
  const forme = (nature: NatureForme) => creerForme(vierge(), nature, { id: () => 'f' });

  it('chaque décoration du modèle a son tracé, et réciproquement', () => {
    expect(DECORATIONS.map((d) => d.id).sort()).toEqual([...NATURES_DECORATION].sort());
  });

  it('tracés : commandes absolues M L C Z, fermés, dans leur cadre', () => {
    for (const d of DECORATIONS) {
      expect(d.trace, d.id).toMatch(/^[MLCZ0-9 .\-]+$/);
      expect(d.trace.endsWith('Z')).toBe(true);
      const n = d.trace.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(n.length % 2).toBe(0);
      n.forEach((v, i) => {
        // Les points de contrôle peuvent dépasser un peu ; la courbe, elle, reste dans le cadre.
        const max = i % 2 ? d.hauteur : d.largeur;
        expect(v, `${d.id} ${v}`).toBeGreaterThanOrEqual(-7);
        expect(v, `${d.id} ${v}`).toBeLessThanOrEqual(max + 7);
      });
    }
  });

  it('toutes les natures donnent un document valide, dans le format, même en portrait', () => {
    for (const [l, h] of [[3000, 1000], [850, 2000]]) {
      const doc = creerDocument({ support: 'ROLL_UP', largeurMm: l, hauteurMm: h }, { id: () => 'd' });
      for (const n of ['rect', 'ellipse', ...NATURES_DECORATION] as NatureForme[]) {
        const e = creerForme(doc, n, { id: () => 'f' });
        valide(op.ajouter(doc, e));
        expect(e.largeurMm, n).toBeLessThanOrEqual(l);
      }
    }
  });

  it('une décoration garde ses proportions', () => {
    const e = forme('ruban');
    const r = op.redimensionne(e, 2, 1, mesurer);
    expect(r.largeurMm / r.hauteurMm).toBeCloseTo(e.largeurMm / e.hauteurMm, 2);
    expect(r.largeurMm).toBe(e.largeurMm * 2);
    expect(op.redimensionne(forme('rect'), 2, 1, mesurer).hauteurMm).toBe(300);
  });

  it('le contour est dessiné à l’intérieur : la taille affichée est la taille imprimée', () => {
    const e: ElementForme = { ...forme('rect'), largeurMm: 400, hauteurMm: 200, forme: { nature: 'rect', fond: null, contour: '#000000', epaisseurMm: 20, rayonMm: 50 } };
    const p = placementForme(e);
    expect(p.cadre).toEqual({ x: -190, y: -90, largeur: 380, hauteur: 180 });
    expect(p.rayonMm).toBe(40);
    expect(placementForme({ ...e, forme: { ...e.forme, epaisseurMm: 900 } }).epaisseurMm).toBe(100);
    expect(placementForme({ ...e, forme: { ...e.forme, contour: null, fond: '#FFFFFF' } }).cadre.largeur).toBe(400);
  });

  it('décoration dans un cadre quelconque : échelle uniforme, centrée', () => {
    const p = placementForme({ ...forme('etoile'), largeurMm: 400, hauteurMm: 200 });
    expect(p.decoration).toMatchObject({ echelle: 2, x: -100, y: -100 });
  });

  it('une forme ne peut pas devenir invisible ; un contour activé se voit', () => {
    const d = op.ajouter(vierge(), forme('rect'));
    expect(op.poserForme(d, 'f', { fond: null })).toBe(d);
    const c = op.poserForme(d, 'f', { contour: '#000000' });
    expect((op.trouver(c, 'f') as ElementForme).forme.epaisseurMm).toBeGreaterThan(0);
    valide(op.poserForme(c, 'f', { fond: null, rayonMm: 1e9, epaisseurMm: 1e9 }));
  });

  it('changer de format met contours et arrondis à l’échelle', () => {
    let d = op.ajouter(vierge(), forme('rect'));
    d = op.poserForme(d, 'f', { contour: '#000000', epaisseurMm: 20, rayonMm: 40 });
    expect((op.trouver(op.poserFormat(d, 1500, 500, mesurer), 'f') as ElementForme).forme).toMatchObject({ epaisseurMm: 10, rayonMm: 20 });
  });
});

describe('store', () => {
  const studio = () => {
    let n = 0;
    return creerStudio({ mesurer, enregistrer: async () => true, id: () => `id${++n}` });
  };

  it('importer deux fois la même image ne la référence qu’une fois', () => {
    vi.useFakeTimers();
    const s = studio();
    s.getState().ajouterImage(PHOTO);
    s.getState().ajouterImage(PHOTO);
    expect(s.getState().document.assets).toHaveLength(1);
    expect(s.getState().document.elements).toHaveLength(2);
    vi.useRealTimers();
  });

  it('supprimer puis annuler rend l’image', () => {
    vi.useFakeTimers();
    const s = studio();
    s.getState().ajouterImage(PHOTO);
    s.getState().supprimer();
    expect(s.getState().document.assets).toEqual([]);
    s.getState().annuler();
    expect(s.getState().document.assets).toEqual([PHOTO]);
    valide(s.getState().document);
    vi.useRealTimers();
  });

  it('une police qui n’a pas pu être chargée est une alerte critique, levée si elle revient', () => {
    vi.useFakeTimers();
    const s = studio();
    s.getState().ajouterTexte();
    const codes = () => s.getState().alertes.map((a) => a.code);
    s.getState().declarerPolice('montserrat', false);
    expect(codes()).toContain('POLICE_INDISPONIBLE');
    s.getState().declarerPolice('montserrat', true);
    expect(codes()).not.toContain('POLICE_INDISPONIBLE');
    s.getState().poserTexte(s.getState().selection!, { policeId: 'police-inconnue' });
    expect(codes()).toContain('POLICE_INDISPONIBLE');
    vi.useRealTimers();
  });

  it('on ne recadre que ce qui est présent et déverrouillé', () => {
    vi.useFakeTimers();
    const s = studio();
    s.getState().chargementFini();
    s.getState().ajouterImage(PHOTO);
    const id = s.getState().selection!;
    s.getState().ouvrirRecadrage(id);
    expect(s.getState().recadrage).toBeNull();
    s.getState().declarerImage('photo');
    s.getState().ouvrirRecadrage(id);
    expect(s.getState().recadrage).toBe(id);
    vi.useRealTimers();
  });

  it('couleurs proposées : celles du document, sans doublon', () => {
    const c = op.couleursDocument(reference());
    expect(new Set(c).size).toBe(c.length);
    expect(c.length).toBeLessThanOrEqual(8);
    for (const x of c) expect(x).toMatch(/^#[0-9A-F]{6}$/);
  });
});

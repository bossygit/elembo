/**
 * Banner Studio, lot 5 — PDF de production (audit §7.9) et finalisation. Le stockage et la base sont
 * simulés ; le rendu, lui, est réel : vraies polices, vraies images, vrai PDF relu.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluer, PROFILS_PUBLICS, resoudreContraintes } from '../src/lib/banner/constraints';
import { ajusterCadre } from '../src/lib/banner/edition';
import { dimensionsImage } from '../src/lib/banner/images';
import { creerDocument, creerForme, creerTexte, type Asset, type DocumentBanner, type ElementImage, type StyleTexte } from '../src/lib/banner/model';
import { glyphesManquants, POLICES } from '../src/lib/banner/polices';
import { documentDepuisModele, MODELES_STUDIO } from '../src/lib/banner/templates';
import { ficheProduction } from '../src/server/banner/fiche';
import { embarquerPngOpaque } from '../src/server/banner/png';
import { chargerPoliceTtf, clePolice, composer, mesureurServeur, type PoliceChargee } from '../src/server/banner/polices';
import { cheminSvg, planDePages, PT_PAR_MM, rendrePdf } from '../src/server/banner/rendu';
import { verifierPdf } from '../src/server/banner/verification';

const LOGO = new Uint8Array(readFileSync(join(process.cwd(), 'tests/fixtures/logo-transparent.png')));
const JPEG = new Uint8Array(readFileSync(join(process.cwd(), 'public/mockups/tableau-interieur.jpg')));
const taille = dimensionsImage(JPEG)!;
const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');
const ASSET_LOGO: Asset = { id: 'logo', nom: 'logo.png', mime: 'image/png', largeurPx: 900, hauteurPx: 900, sha256: sha(LOGO) };
const ASSET_PHOTO: Asset = { id: 'photo', nom: 'photo.jpg', mime: 'image/jpeg', largeurPx: taille.largeur, hauteurPx: taille.hauteur, sha256: sha(JPEG) };
const FICHIERS = new Map([['logo', LOGO], ['photo', JPEG]]);

let polices: Map<string, PoliceChargee>;
beforeEach(() => { polices = new Map(); });

function vierge(largeurMm = 3000, hauteurMm = 1000, finition: 'SANS' | 'OEILLETS' | 'OURLETS_OEILLETS' = 'OEILLETS'): DocumentBanner {
  return creerDocument({ support: 'BANDEROLE', largeurMm, hauteurMm, finition, contraintes: resoudreContraintes(PROFILS_PUBLICS.BANDEROLE, finition) }, { id: () => 'doc', maintenant: () => new Date('2026-11-25T10:00:00Z') });
}
async function texte(doc: DocumentBanner, contenu: string, style: Partial<StyleTexte> = {}) {
  const e = creerTexte(doc, contenu, { id: () => `t${doc.elements.length}` });
  e.texte = { ...e.texte, ...style };
  polices.set(clePolice(e.texte), await chargerPoliceTtf(e.texte));
  doc.elements.push(ajusterCadre(e, mesureurServeur(polices)));
}
function image(doc: DocumentBanner, asset: Asset, p: Partial<ElementImage> = {}) {
  if (!doc.assets.some((a) => a.id === asset.id)) doc.assets.push(asset);
  doc.elements.push({ id: `i${doc.elements.length}`, type: 'image', nom: asset.nom, xMm: 600, yMm: 500, largeurMm: 600, hauteurMm: 600, rotationDeg: 0, opacite: 1, verrouille: false, visible: true, image: { assetId: asset.id, recadrage: { x: 0, y: 0, l: 1, h: 1 }, ajustement: 'cover' }, ...p });
}
async function complet(largeurMm = 3000, hauteurMm = 1000) {
  const d = vierge(largeurMm, hauteurMm);
  await texte(d, 'Papa Joseph Malonga', { policeId: 'dm-serif-display', graisse: 400, corpsMm: 100 });
  await texte(d, 'Hommage', { policeId: 'cormorant-garamond', graisse: 400, italique: true, corpsMm: 70 });
  image(d, ASSET_LOGO);
  image(d, ASSET_PHOTO, { rotationDeg: 15 });
  return d;
}
const controler = async (d: DocumentBanner, images: number) => {
  const r = await rendrePdf(d, FICHIERS);
  return { r, v: await verifierPdf(r.octets, d, r.plan, { polices: r.polices.length, images }) };
};
/** Flux de dessin de toutes les pages, décompressés. */
async function operateurs(octets: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(octets);
  let s = '';
  for (const page of pdf.getPages()) {
    const c = page.node.Contents();
    const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
    for (const r of refs) s += inflateSync(Buffer.from((pdf.context.lookup(r) as PDFRawStream).contents)).toString('latin1');
  }
  return s;
}

describe('géométrie des pages (§7.9)', () => {
  it.each([
    [1000, 1000, [[1000, 1000]]],
    [3000, 1000, [[3000, 1000]]],
    [5000, 1000, [[5000, 1000]]],
    [850, 2000, [[850, 2000]]],
    [6000, 1000, [[3010, 1000], [3010, 1000]]],
    [1000, 6000, [[1000, 3010], [1000, 3010]]],
    [12_000, 1500, [[4013.3, 1500], [4013.3, 1500], [4013.3, 1500]]],
  ])('%i × %i mm', async (l, h, attendu) => {
    const { r, v } = await controler(vierge(l, h), 0);
    expect(v).toMatchObject({ ok: true, ecarts: [] });
    expect(v.pages.map((p) => [p.largeurMm, p.hauteurMm])).toEqual(attendu);
    expect(r.userUnit).toBe(1);
  });

  it('3 × 1 m : 8 503,94 × 2 834,65 pt', async () => {
    const pdf = await PDFDocument.load((await rendrePdf(vierge(), FICHIERS)).octets);
    const { width, height } = pdf.getPage(0).getMediaBox();
    expect(width).toBeCloseTo(8503.94, 1);
    expect(height).toBeCloseTo(2834.65, 1);
  });

  it('panneaux : recouvrement de 20 mm, toute la longueur couverte', () => {
    const plan = planDePages(vierge(6000, 1000));
    expect(plan.map((p) => [p.page, p.axe, p.debutMm])).toEqual([[1, 'x', 0], [2, 'x', 2990]]);
    expect(plan[1].debutMm + plan[1].largeurMm).toBe(6000);
  });

  it('fond perdu : TrimBox au format fini, BleedBox et page agrandies', async () => {
    const d = vierge();
    d.contraintes.fondPerduMm = 10;
    const { r, v } = await controler(d, 0);
    expect(v).toMatchObject({ ok: true, pages: [{ largeurMm: 3000, hauteurMm: 1000 }] });
    const page = (await PDFDocument.load(r.octets)).getPage(0);
    expect(page.getBleedBox().width / PT_PAR_MM).toBeCloseTo(3020, 1);
    expect(page.getTrimBox().x / PT_PAR_MM).toBeCloseTo(10, 1);
  });

  it('page unique : UserUnit, dimensions réelles exactes', async () => {
    const d = vierge(6000, 1000);
    d.contraintes.modeGrandFormat = 'PAGE_UNIQUE_USERUNIT';
    const { r, v } = await controler(d, 0);
    expect(r).toMatchObject({ userUnit: 2 });
    expect(v).toMatchObject({ ok: true, pages: [{ largeurMm: 6000, hauteurMm: 1000 }] });
  });

  it('format excessif : refus explicite, aucun PDF, et l’éditeur prévient déjà', async () => {
    for (const [l, h] of [[25_000, 1000], [6000, 6000], [20_000, 5500]]) {
      const d = vierge(l, h);
      await expect(rendrePdf(d, FICHIERS)).rejects.toMatchObject({ code: 'FORMAT_SUR_DEVIS' });
      expect(evaluer(d)).toContainEqual(expect.objectContaining({ code: 'FORMAT_SUR_DEVIS', severite: 'critique' }));
    }
  });
});

describe('polices', () => {
  it('chaque lettre de chaque variante survit au sous-ensemble', async () => {
    const lettres = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÀÂÉÈÊËÎÏÔÙÛÜÇàâéèêëîïôùûüçœŒ«»—–…’“”€°·&!?.,;:()-+%/@#'];
    for (const p of POLICES) {
      for (const v of p.variantes) {
        const d = vierge(20_000, 1000);
        const presents = lettres.filter((c) => glyphesManquants(p.id, c).length === 0);
        for (let i = 0; i < presents.length; i += 30) await texte(d, presents.slice(i, i + 30).join(''), { policeId: p.id, graisse: v.startsWith('700') ? 700 : 400, italique: v.endsWith('i'), corpsMm: 50 });
        // rendrePdf compare le tracé de chaque glyphe embarqué à celui de la police d'origine.
        await expect(rendrePdf(d, FICHIERS), `${p.id} ${v}`).resolves.toMatchObject({ polices: [`${p.id}-${v}`] });
      }
    }
  }, 60_000);

  it('un sous-ensemble altéré est refusé, au lieu de livrer un PDF où des lettres manquent', async () => {
    const d = vierge();
    await texte(d, 'Hommage', { policeId: 'cormorant-garamond', graisse: 400, italique: true });
    const creer = fontkit.create.bind(fontkit);
    // La police relue depuis le PDF est faussée ; celle d'origine, déjà chargée, reste juste.
    const espion = vi.spyOn(fontkit, 'create').mockImplementation(((o: Uint8Array) => {
      const f = creer(o) as unknown as { numGlyphs: number };
      return f.numGlyphs > 60 ? f : new Proxy(f, { get: (c, k) => (k === 'getGlyph' ? () => ({ path: { toSVG: () => '' } }) : Reflect.get(c, k)) });
    }) as never);
    await expect(rendrePdf(d, FICHIERS)).rejects.toMatchObject({ code: 'POLICE_INDISPONIBLE' });
    espion.mockRestore();
  });

  it('caractère absent, police inconnue : refus explicite', async () => {
    const d = vierge();
    await texte(d, 'abc', { policeId: 'dm-serif-display', graisse: 400 });
    for (const e of d.elements) if (e.type === 'texte') e.texte.contenu = 'Mɔtɔ';
    await expect(rendrePdf(d, FICHIERS)).rejects.toThrow(/ɔ/);
    for (const e of d.elements) if (e.type === 'texte') e.texte.policeId = '../../etc/passwd';
    await expect(rendrePdf(d, FICHIERS)).rejects.toMatchObject({ code: 'POLICE_INDISPONIBLE' });
  });

  it('largeurs crénées, identiques à celles mesurées dans Chrome (lot 0, lot 3)', async () => {
    const choix = { policeId: 'dm-serif-display', graisse: 400 as const };
    polices.set(clePolice(choix), await chargerPoliceTtf(choix));
    expect(mesureurServeur(polices)(choix)('Papa Joseph Malonga', 200)).toBeCloseTo(1868.2, 1);
  });

  it('le texte posé occupe exactement la largeur crénée, accents combinants et interlettrage compris', async () => {
    for (const [contenu, style] of [
      ['AVATAR To Ty W. V', { policeId: 'playfair-display', graisse: 400 as const }],
      ['Mɔ́tɔ ɛ́', { policeId: 'montserrat', graisse: 700 as const, interlettrageEm: 0.15 }],
      ['Officiel fi fl', { policeId: 'cormorant-garamond', graisse: 400 as const, italique: true }],
    ] as const) {
      const d = vierge();
      await texte(d, contenu, { corpsMm: 100, ...style });
      const e = d.elements[0];
      if (e.type !== 'texte') throw new Error('texte attendu');
      const ops = await operateurs((await rendrePdf(d, FICHIERS)).octets);
      const p = polices.get(clePolice(e.texte))!;
      const { glyphs } = composer(p, e.texte.contenu, e.texte);
      // Somme des avances naturelles et des ajustements TJ = largeur du cadre.
      const ajustements = [...ops.matchAll(/\[([^\]]*)\] TJ/g)].flatMap((m) => [...m[1].replace(/<[^>]*>/g, ' ').matchAll(/-?\d+(?:\.\d+)?/g)].map((x) => Number(x[0])));
      const naturelle = glyphs.reduce((s, g) => s + g.advanceWidth, 0) / p.police.unitsPerEm;
      const posee = (naturelle - ajustements.reduce((s, x) => s + x, 0) / 1000) * 100;
      expect(Math.abs(posee - e.largeurMm), contenu).toBeLessThan(0.2);
    }
  });
});

describe('images', () => {
  it('embarquées à leur définition d’origine, une seule fois chacune', async () => {
    const d = await complet();
    image(d, ASSET_LOGO, { xMm: 2000 });
    const { v } = await controler(d, 2);
    expect(v).toMatchObject({ ok: true, images: 2, polices: 2 });
  });

  it('JPEG : octets d’origine, sans recompression', async () => {
    const d = vierge();
    image(d, ASSET_PHOTO);
    const { octets } = await rendrePdf(d, FICHIERS);
    expect(Buffer.from(octets).includes(Buffer.from(JPEG))).toBe(true);
  });

  it('PNG opaque : données reprises telles quelles ; transparent, entrelacé, tronqué : laissés à pdf-lib', async () => {
    const pdf = await PDFDocument.create();
    const morceau = (nom: string, c: Buffer) => { const t = Buffer.alloc(4); t.writeUInt32BE(c.length); return Buffer.concat([t, Buffer.from(nom), c, Buffer.alloc(4)]); };
    const png = (couleur: number, entrelace = 0, extra: Buffer[] = []) => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = couleur; ihdr[12] = entrelace;
      return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), morceau('IHDR', ihdr), ...extra, morceau('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 0, 0, 255]))), morceau('IEND', Buffer.alloc(0))]));
    };
    const plte = morceau('PLTE', Buffer.from([255, 0, 0, 0, 0, 255]));
    const trns = morceau('tRNS', Buffer.from([0]));
    expect(embarquerPngOpaque(pdf, png(2))).toMatchObject({ width: 2, height: 1 });
    expect(embarquerPngOpaque(pdf, png(3, 0, [plte]))).not.toBeNull();
    for (const o of [png(6), png(4), png(2, 1), png(3), png(3, 0, [plte, trns]), png(2).slice(0, 60), LOGO]) expect(embarquerPngOpaque(pdf, o)).toBeNull();
  });

  it('refuse une image absente, illisible, aux mauvaises dimensions, ou d’exemple', async () => {
    const d = vierge();
    image(d, ASSET_PHOTO);
    await expect(rendrePdf(d, new Map())).rejects.toMatchObject({ code: 'IMAGE_MANQUANTE' });
    await expect(rendrePdf(d, new Map([['photo', new Uint8Array([1, 2, 3])]]))).rejects.toMatchObject({ code: 'IMAGE_ILLISIBLE' });
    d.assets[0] = { ...ASSET_PHOTO, largeurPx: 10 };
    await expect(rendrePdf(d, FICHIERS)).rejects.toMatchObject({ code: 'IMAGE_INCOHERENTE' });
    d.assets[0] = { ...ASSET_PHOTO, placeholder: true };
    await expect(rendrePdf(d, FICHIERS)).rejects.toMatchObject({ code: 'PLACEHOLDER' });
  });

  it('un élément masqué n’est ni dessiné ni exigé', async () => {
    const d = vierge();
    image(d, ASSET_PHOTO, { visible: false });
    expect((await controler(d, 0)).v.ok).toBe(true);
  });

  it('dimensions lues dans l’en-tête', () => {
    expect(dimensionsImage(LOGO)).toEqual({ largeur: 900, hauteur: 900 });
    expect(dimensionsImage(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('contenu du PDF', () => {
  it('aucun repère de production n’est dessiné', async () => {
    const avec = await complet();
    const sans = structuredClone(avec);
    sans.contraintes = { ...sans.contraintes, oeillets: { ...sans.contraintes.oeillets, actifs: false }, ourletMm: 0, margeSecuriteMm: 0 };
    avec.contraintes.ourletMm = 50;
    expect(await operateurs((await rendrePdf(avec, FICHIERS)).octets)).toBe(await operateurs((await rendrePdf(sans, FICHIERS)).octets));
  });

  it('deux rendus du même document : octets identiques', async () => {
    const d = await complet();
    expect(sha((await rendrePdf(d, FICHIERS)).octets)).toBe(sha((await rendrePdf(d, FICHIERS)).octets));
  });

  it('opacité, rotation, formes : tout est vectoriel', async () => {
    const d = vierge();
    for (const n of ['rect', 'ellipse', 'ligne', 'anneaux', 'coin'] as const) {
      const e = creerForme(d, n, { id: () => `f${d.elements.length}` });
      d.elements.push({ ...e, opacite: 0.5, rotationDeg: 30, forme: { ...e.forme, contour: '#000000', epaisseurMm: 10, rayonMm: 20 } });
    }
    const { r, v } = await controler(d, 0);
    expect(v.ok).toBe(true);
    const ops = await operateurs(r.octets);
    expect(ops).toMatch(/ gs/);
    expect(ops).toMatch(/ c\n/);
    expect(ops).not.toMatch(/ Do/);
  });

  it('décorations : chaque commande du tracé devient un opérateur', () => {
    expect(cheminSvg('M0 0L10 0C1 2 3 4 5 6Z').map(String)).toEqual(['0 0 m', '10 0 l', '1 2 3 4 5 6 c', 'h']);
  });

  it('les dix modèles sont rendus et vérifiés', async () => {
    for (const m of MODELES_STUDIO) {
      for (const e of m.document.elements) if (e.type === 'texte') polices.set(clePolice(e.texte), await chargerPoliceTtf(e.texte));
      const d = documentDepuisModele(m, {}, { id: 'p', creeLe: '2026-11-25T10:00:00.000Z', modifieLe: '2026-11-25T10:00:00.000Z' }, mesureurServeur(polices));
      d.assets = d.assets.map((a) => ({ ...ASSET_LOGO, id: a.id }));
      const r = await rendrePdf(d, new Map(d.assets.map((a) => [a.id, LOGO])));
      expect(await verifierPdf(r.octets, d, r.plan, { polices: r.polices.length, images: d.assets.length }), m.id).toMatchObject({ ok: true, ecarts: [] });
    }
  });
});

describe('vérification du PDF', () => {
  it('détecte pages, dimensions, polices et images inattendues', async () => {
    const d = await complet();
    const { octets, plan } = await rendrePdf(d, FICHIERS);
    const ecarts = async (p = plan, a = { polices: 2, images: 2 }) => (await verifierPdf(octets, d, p, a)).ecarts.join(' ; ');
    expect(await ecarts()).toBe('');
    expect(await ecarts([...plan, plan[0]])).toMatch(/1 page\(s\) au lieu de 2/);
    expect(await ecarts([{ ...plan[0], largeurMm: 2999 }])).toMatch(/MediaBox/);
    expect(await ecarts(plan, { polices: 3, images: 2 })).toMatch(/police/);
    expect(await ecarts(plan, { polices: 2, images: 1 })).toMatch(/image/);
  });

  it('détecte un contenu actif, et une police non embarquée', async () => {
    const d = vierge();
    const { octets, plan } = await rendrePdf(d, FICHIERS);
    const actif = await PDFDocument.load(octets);
    actif.catalog.set(PDFName.of('OpenAction'), actif.context.obj({}));
    expect((await verifierPdf(await actif.save(), d, plan, { polices: 0, images: 0 })).ecarts.join()).toMatch(/OpenAction/);
    const police = await PDFDocument.load(octets);
    police.getPage(0).drawText('x', { font: await police.embedFont(StandardFonts.Helvetica) });
    expect((await verifierPdf(await police.save(), d, plan, { polices: 1, images: 0 })).ok).toBe(false);
  });
});

describe('fiche de production', () => {
  it('dit ce que le PDF ne montre pas, sans prix ni coordonnées', async () => {
    const d = await complet(6000, 1000);
    const r = await rendrePdf(d, FICHIERS);
    const f = ficheProduction(d, r, { reference: 'DEV-1', version: 2, quantite: 3, empreinte: 'a'.repeat(64), alertes: evaluer(d) });
    for (const x of ['600 cm × 100 cm', 'Quantité : 3', 'Finition : Œillets', '2 pages', 'recouvrement de 20 mm', 'Page 2 : 3010 mm', 'RVB sRGB', 'tous les 500 mm', 'DM Serif Display', 'dpi à cette taille']) expect(f).toContain(x);
    expect(f).not.toMatch(/FCFA|prix|téléphone|@/i);
  });
});

/* ------------------------------------------------------------ finalisation -- */

const etat = vi.hoisted(() => ({
  objets: new Map<string, Uint8Array>(),
  lignes: [] as Record<string, unknown>[],
  demande: null as Record<string, unknown> | null,
  reservation: {} as Record<string, unknown>,
  termine: [] as Record<string, unknown>[],
  echecs: [] as string[],
  effaces: [] as string[],
  ecrireEchoue: null as string | null,
}));
vi.mock('@/server/devis/repository', () => ({ fichiersDuDevis: async () => etat.lignes }));
vi.mock('@/server/banner/repository', () => ({
  demandeDuDevis: async () => etat.demande,
  reserverVisuel: async () => etat.reservation,
  visuelParId: async () => ({ statut: 'RENDU', version: 1, avertissements: [{ severite: 'avertissement', message: 'm' }, { severite: 'info', message: 'i' }] }),
  terminerVisuel: async (p: Record<string, unknown>) => void etat.termine.push(p),
  echouerVisuel: async (_: string, e: string) => void etat.echecs.push(e),
  lireObjet: async (_: string, c: string) => etat.objets.get(c) ?? null,
  ecrireObjet: async (b: string, c: string, o: Uint8Array) => {
    if (etat.ecrireEchoue && c.endsWith(etat.ecrireEchoue)) throw new Error('stockage plein');
    etat.objets.set(`${b}:${c}`, o);
  },
  effacerObjets: async (_: string, c: string[]) => void etat.effaces.push(...c),
}));

describe('finalisation', () => {
  const DEVIS = 'devis-1';
  async function preparer(modifier: (d: DocumentBanner) => void = () => undefined) {
    const { finaliserVisuel } = await import('../src/server/banner/finaliser');
    const d = await complet();
    modifier(d);
    etat.objets.clear();
    Object.assign(etat, {
      lignes: [], termine: [], echecs: [], effaces: [], ecrireEchoue: null,
      reservation: { visuel_id: 'v', version: 1, etat: 'NOUVEAU', statut: 'EN_COURS' },
      demande: { largeur_m: 3, hauteur_m: 1, quantite: 2, support: 'BANDEROLE', finition: 'OEILLETS' },
    });
    const deposer = (nom: string, o: Uint8Array) => {
      const chemin = `devis/${DEVIS}/x-${nom}`;
      etat.objets.set(chemin, o);
      etat.lignes.push({ id: `f-${nom}`, nom, chemin, verifie: true, checksum: sha(o) });
    };
    deposer('projet-banner.json', new TextEncoder().encode(JSON.stringify(d)));
    deposer('studio-logo.png', LOGO);
    deposer('studio-photo.jpg', JPEG);
    deposer('apercu-banner.jpg', JPEG);
    return { finaliser: () => finaliserVisuel(DEVIS, 'DEV-TEST') };
  }
  const modifier = (nom: string, p: Record<string, unknown>) => { etat.lignes = etat.lignes.map((l) => (l.nom === nom ? { ...l, ...p } : l)); };
  type Termine = { statut: string; avertissements: { code: string }[]; fichiers: { role: string; nom: string; chemin: string; checksum: string }[]; projet: DocumentBanner; apercuChemin: string; preflight: Record<string, unknown>; checksumProduction: string };
  const dernier = () => etat.termine.at(-1) as unknown as Termine;
  const codes = () => dernier().avertissements.map((a) => a.code);

  it('rend, vérifie, dépose PDF, projet et fiche, puis enregistre', async () => {
    const { finaliser } = await preparer();
    expect(await finaliser()).toMatchObject({ etat: 'RENDU', version: 1 });
    const t = dernier();
    expect(t.fichiers.map((f) => [f.role, f.nom])).toEqual([['production', 'visuel-banner-v1.pdf'], ['projet', 'projet-banner-v1.json'], ['fiche', 'fiche-production-v1.txt']]);
    const pdf = etat.objets.get(`devis:devis/${DEVIS}/visuel-banner-v1.pdf`)!;
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(t.checksumProduction).toBe(sha(pdf));
    expect(t.apercuChemin).toBe(`visuels/${DEVIS}/apercu-v1.jpg`);
    expect(t.preflight).toMatchObject({ assets: { logo: 'f-studio-logo.png', photo: 'f-studio-photo.jpg' }, pages: [{ largeurMm: 3000, hauteurMm: 1000 }] });
    expect(etat.echecs).toEqual([]);
  });

  it('les contraintes du navigateur sont ignorées', async () => {
    const { finaliser } = await preparer((d) => { d.contraintes = { ...d.contraintes, margeSecuriteMm: 0, dpiMin: 30, oeillets: { ...d.contraintes.oeillets, actifs: false } }; });
    await finaliser();
    expect(dernier().projet.contraintes).toMatchObject({ margeSecuriteMm: 50, dpiMin: 72, oeillets: { actifs: true } });
  });

  it('un visuel qui ne correspond pas à la demande n’est pas rendu', async () => {
    for (const ecart of [{ largeur_m: 4 }, { support: 'BACHE' }, { finition: 'SANS' }]) {
      const { finaliser } = await preparer();
      etat.demande = { ...etat.demande, ...ecart };
      expect(await finaliser()).toMatchObject({ etat: 'A_REVOIR' });
      expect(codes()[0]).toBe('DOCUMENT_INCOHERENT');
      expect(dernier().fichiers).toEqual([]);
    }
  });

  it('image remplacée, non vérifiée, différente ou non normalisée : pas de PDF', async () => {
    let p = await preparer();
    etat.objets.set(`devis/${DEVIS}/x-studio-logo.png`, JPEG); // octets changés après vérification
    expect(await p.finaliser()).toMatchObject({ etat: 'A_REVOIR' });
    p = await preparer();
    modifier('studio-logo.png', { verifie: false });
    await p.finaliser();
    expect(codes()).toContain('IMAGE_MANQUANTE');
    p = await preparer((d) => { d.assets[0] = { ...d.assets[0], sha256: 'f'.repeat(64) }; });
    await p.finaliser();
    expect(codes()).toContain('IMAGE_REFUSEE');
    // JPEG avec orientation EXIF : le PDF l'ignorerait.
    const exif = new Uint8Array(Buffer.concat([Buffer.from(JPEG.subarray(0, 2)), Buffer.from([0xff, 0xe1, 0, 34]), Buffer.from('Exif\0\0MM'), Buffer.from([0, 42, 0, 0, 0, 8, 0, 1, 1, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]), Buffer.from(JPEG.subarray(2))]));
    p = await preparer((d) => { d.assets[1] = { ...d.assets[1], sha256: sha(exif) }; });
    etat.objets.set(`devis/${DEVIS}/x-studio-photo.jpg`, exif);
    modifier('studio-photo.jpg', { checksum: sha(exif) });
    await p.finaliser();
    expect(codes()).toContain('IMAGE_REFUSEE');
  });

  it('une alerte critique empêche le PDF', async () => {
    const { finaliser } = await preparer((d) => { d.elements[0].xMm = 2990; });
    expect(await finaliser()).toMatchObject({ etat: 'A_REVOIR', alertes: expect.arrayContaining([expect.objectContaining({ severite: 'critique' })]) });
    expect(codes()).toContain('HORS_FORMAT');
  });

  it('idempotence : projet déjà rendu ou en cours, rien n’est refait', async () => {
    const { finaliser } = await preparer();
    etat.reservation = { visuel_id: 'v', version: 4, etat: 'DEJA', statut: 'RENDU' };
    expect(await finaliser()).toEqual({ etat: 'RENDU', version: 4, alertes: [{ severite: 'avertissement', message: 'm' }] });
    etat.reservation = { visuel_id: 'v', version: 5, etat: 'EN_COURS', statut: 'EN_COURS' };
    expect(await finaliser()).toMatchObject({ etat: 'EN_COURS' });
    expect(etat.termine).toEqual([]);
  });

  it('panne de stockage : échec enregistré, aucun fichier orphelin', async () => {
    const { finaliser } = await preparer();
    etat.ecrireEchoue = 'fiche-production-v1.txt';
    await expect(finaliser()).rejects.toThrow('stockage plein');
    expect(etat.echecs).toEqual(['stockage plein']);
    expect([...etat.effaces].sort()).toEqual([`devis/${DEVIS}/projet-banner-v1.json`, `devis/${DEVIS}/visuel-banner-v1.pdf`]);
    expect(etat.termine).toEqual([]);
  });

  it('projet absent, altéré, d’un autre devis, ou demande ordinaire : refus clair', async () => {
    let p = await preparer();
    etat.lignes = etat.lignes.filter((l) => l.nom !== 'projet-banner.json');
    await expect(p.finaliser()).rejects.toMatchObject({ statut: 409 });
    p = await preparer();
    etat.objets.set(`devis/${DEVIS}/x-projet-banner.json`, new TextEncoder().encode('{}'));
    await expect(p.finaliser()).rejects.toMatchObject({ statut: 409 });
    p = await preparer();
    modifier('projet-banner.json', { chemin: 'devis/autre/x' });
    await expect(p.finaliser()).rejects.toMatchObject({ statut: 409 });
    p = await preparer();
    etat.demande = null;
    await expect(p.finaliser()).rejects.toMatchObject({ statut: 409 });
  });
});

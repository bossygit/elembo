/**
 * Banner Studio — modèle de document et validation stricte.
 * Le document de référence (`tests/fixtures/banner/document-reference.json`) doit se valider.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  creerDocument, creerForme, creerImage, creerTexte, migrer, SCHEMA_DOCUMENT, VERSION_DOCUMENT,
  type DocumentBanner,
} from '../src/lib/banner/model';
import { BORNES, lireDocument, validerDocument } from '../src/lib/banner/schema';

const REFERENCE = readFileSync(join(process.cwd(), 'tests/fixtures/banner/document-reference.json'), 'utf8');
const reference = (): DocumentBanner => JSON.parse(REFERENCE);

let compteur = 0;
const fabrique = { id: () => `id-${++compteur}`, maintenant: () => new Date('2026-11-24T08:00:00Z') };
const chemins = (v: unknown) => {
  const r = validerDocument(v);
  return r.ok ? [] : r.erreurs.map((e) => e.chemin);
};

describe('fabriques', () => {
  it('creerDocument produit un document valide, daté et identifié', () => {
    const d = creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000, categorie: 'DEUIL' }, fabrique);
    expect(d.schema).toBe(SCHEMA_DOCUMENT);
    expect(d.version).toBe(VERSION_DOCUMENT);
    expect(d.creeLe).toBe('2026-11-24T08:00:00.000Z');
    expect(d.id).toMatch(/^id-\d+$/);
    expect(validerDocument(d)).toEqual({ ok: true, document: d });
  });

  it('les contraintes par défaut sont copiées, pas partagées', () => {
    const a = creerDocument({ support: 'BANDEROLE', largeurMm: 2000, hauteurMm: 1000 }, fabrique);
    const b = creerDocument({ support: 'BANDEROLE', largeurMm: 2000, hauteurMm: 1000 }, fabrique);
    a.contraintes.oeillets.actifs = true;
    expect(b.contraintes.oeillets.actifs).toBe(false);
  });

  it('texte, image et forme sont créés au centre et restent valides', () => {
    const d = creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000 }, fabrique);
    d.assets.push({ id: 'photo', nom: 'photo.jpg', mime: 'image/jpeg', largeurPx: 2000, hauteurPx: 1000 });
    const t = creerTexte(d, 'Bonne fête\nMaman', fabrique);
    const i = creerImage(d, d.assets[0], fabrique);
    const f = creerForme(d, 'ligne', fabrique);
    d.elements.push(t, i, f);
    expect([t.xMm, t.yMm]).toEqual([1500, 500]);
    expect(t.hauteurMm).toBeCloseTo(t.texte.corpsMm * 1.2 * 2);
    expect(i.largeurMm / i.hauteurMm).toBeCloseTo(2); // rapport de l'image conservé
    expect(f.forme.nature).toBe('ligne');
    expect(validerDocument(d).ok).toBe(true);
  });
});

describe('versions et lecture tolérante', () => {
  it('un document courant n’est pas migré', () => {
    const r = migrer(reference() as unknown as Record<string, unknown>);
    expect(r).toMatchObject({ ok: true, migre: false });
  });

  it('les migrations s’enchaînent jusqu’à la version courante', () => {
    const migrations = {
      1: (d: Record<string, unknown>) => ({ ...d, ajout: 'v2' }),
      2: (d: Record<string, unknown>) => ({ ...d, nom: `${d.nom} (v3)` }),
    };
    const r = migrer({ schema: SCHEMA_DOCUMENT, version: 1, nom: 'X' }, { migrations, versionCourante: 3 });
    expect(r).toEqual({ ok: true, migre: true, brut: { schema: SCHEMA_DOCUMENT, version: 3, nom: 'X (v3)', ajout: 'v2' } });
  });

  it('une étape de migration manquante, une version future ou un autre schéma sont refusés', () => {
    expect(migrer({ schema: SCHEMA_DOCUMENT, version: 1 }, { migrations: {}, versionCourante: 2 })).toEqual({ ok: false, erreur: 'VERSION_INCONNUE' });
    expect(migrer({ schema: SCHEMA_DOCUMENT, version: VERSION_DOCUMENT + 1 })).toEqual({ ok: false, erreur: 'VERSION_FUTURE' });
    expect(migrer({ schema: 'autre', version: 1 })).toEqual({ ok: false, erreur: 'SCHEMA_INCONNU' });
    expect(migrer({ schema: SCHEMA_DOCUMENT, version: '1' })).toEqual({ ok: false, erreur: 'VERSION_INCONNUE' });
  });

  it('le document de référence se lit depuis le JSON, et un aller-retour le conserve', () => {
    const r = lireDocument(REFERENCE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const encore = lireDocument(JSON.stringify(r.document));
    expect(encore.ok && encore.document).toEqual(r.document);
  });

  it('un JSON corrompu ou qui n’est pas un objet donne une erreur, jamais une exception', () => {
    expect(lireDocument('{"schema": "elembo.banner",')).toEqual({ ok: false, erreur: 'JSON_INVALIDE' });
    expect(lireDocument('[1, 2]')).toEqual({ ok: false, erreur: 'JSON_INVALIDE' });
    expect(lireDocument(null)).toEqual({ ok: false, erreur: 'JSON_INVALIDE' });
    expect(lireDocument({ ...reference(), version: 99 })).toEqual({ ok: false, erreur: 'VERSION_FUTURE' });
  });

  it('un document invalide renvoie les erreurs de validation', () => {
    const r = lireDocument({ ...reference(), nom: '' });
    expect(r).toMatchObject({ ok: false, erreur: 'DOCUMENT_INVALIDE' });
    expect(!r.ok && r.erreurs?.[0].chemin).toBe('document.nom');
  });
});

describe('validation stricte', () => {
  it('le document de référence est valide', () => {
    expect(validerDocument(reference()).ok).toBe(true);
  });

  it('refuse les clés inconnues, à la racine comme dans un élément', () => {
    expect(chemins({ ...reference(), prix: 12000 })).toContain('document.prix');
    const d = reference();
    (d.elements[0] as unknown as Record<string, unknown>).onclick = 'alert(1)';
    expect(chemins(d)).toContain('document.elements[0].onclick');
  });

  it('signale une clé obligatoire absente', () => {
    const d = reference() as unknown as Record<string, unknown>;
    delete d.fond;
    expect(chemins(d)).toContain('document.fond');
  });

  it('refuse les identifiants en double (éléments et images)', () => {
    const d = reference();
    d.elements[1].id = d.elements[0].id;
    d.assets.push({ ...d.assets[0] });
    expect(chemins(d)).toEqual(expect.arrayContaining(['document.elements[1].id', 'document.assets[2].id']));
  });

  it('refuse une image qui référence un asset inconnu, ou un recadrage qui sort de l’image', () => {
    const d = reference();
    const portrait = d.elements.find((e) => e.id === 'portrait')!;
    if (portrait.type !== 'image') throw new Error('portrait attendu');
    portrait.image.assetId = 'absent';
    portrait.image.recadrage = { x: 0.5, y: 0, l: 0.6, h: 1 };
    expect(chemins(d)).toEqual(expect.arrayContaining(['document.elements[1].image.assetId', 'document.elements[1].image.recadrage']));
  });

  it('borne les dimensions commerciales (0,2 à 50 m)', () => {
    expect(chemins({ ...reference(), dimensions: { largeurMm: 150, hauteurMm: 1000 } })).toContain('document.dimensions.largeurMm');
    expect(chemins({ ...reference(), dimensions: { largeurMm: 51_000, hauteurMm: 1000 } })).toContain('document.dimensions.largeurMm');
  });

  it('refuse couleurs, opacités, rotations et nombres hors bornes', () => {
    const d = reference();
    const nom = d.elements.find((e) => e.id === 'nom')!;
    if (nom.type !== 'texte') throw new Error('texte attendu');
    nom.texte.couleur = 'red';
    nom.opacite = 1.5;
    nom.rotationDeg = 400;
    nom.xMm = Number.NaN;
    expect(chemins(d)).toEqual(expect.arrayContaining([
      'document.elements[3].texte.couleur', 'document.elements[3].opacite', 'document.elements[3].rotationDeg', 'document.elements[3].xMm',
    ]));
  });

  it('refuse les caractères de contrôle, trop de lignes et une police mal nommée', () => {
    const d = reference();
    const t = d.elements.find((e) => e.id === 'dates')!;
    if (t.type !== 'texte') throw new Error('texte attendu');
    t.texte.contenu = `Bonjour\u0007${'\n.'.repeat(BORNES.lignesMax)}`;
    t.texte.policeId = '../polices/arial';
    const c = chemins(d);
    expect(c.filter((x) => x === 'document.elements[5].texte.contenu')).toHaveLength(2);
    expect(c).toContain('document.elements[5].texte.policeId');
  });

  it('refuse une forme sans fond ni contour, et un type d’élément inconnu', () => {
    const d = reference();
    const f = d.elements.find((e) => e.id === 'filet')!;
    if (f.type !== 'forme') throw new Error('forme attendue');
    f.forme.fond = null;
    (d.elements as unknown[]).push({ type: 'video', id: 'v' });
    expect(chemins(d)).toEqual(expect.arrayContaining(['document.elements[4].forme', 'document.elements[8].type']));
  });

  it('valide un fond image dont l’asset existe, et refuse celui qui n’existe pas', () => {
    expect(validerDocument({ ...reference(), fond: { type: 'image', assetId: 'portrait', ajustement: 'cover', couleur: '#000000' } }).ok).toBe(true);
    expect(chemins({ ...reference(), fond: { type: 'image', assetId: 'absent', ajustement: 'cover', couleur: '#000000' } })).toContain('document.fond.assetId');
  });

  it('borne le nombre d’éléments', () => {
    const d = reference();
    d.elements = Array.from({ length: BORNES.elementsMax + 1 }, (_, i) => ({ ...d.elements[4], id: `f${i}` }));
    expect(chemins(d)).toContain('document.elements');
  });

  it('refuse une catégorie, une finition ou un support hors catalogue', () => {
    expect(chemins({ ...reference(), categorie: 'NOEL', finition: 'AUTRE', support: 'AUTRE' })).toEqual(
      expect.arrayContaining(['document.categorie', 'document.finition', 'document.support']),
    );
  });
});

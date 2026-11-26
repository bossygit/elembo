/** Banner Studio, lot 2 — store de l'éditeur et stockage (repli mémoire, sans IndexedDB). */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentBanner } from '../src/lib/banner/model';
import { lireDocument, validerDocument } from '../src/lib/banner/schema';
import { assetsCites, enregistrerAsset, enregistrerProjet, lireAsset, lireProjetCourant } from '../src/lib/banner/stockage';
import { AUTOSAVE_MS, creerStudio } from '../src/stores/banner-studio-store';

const REFERENCE = readFileSync(join(process.cwd(), 'tests/fixtures/banner/document-reference.json'), 'utf8');
const reference = (): DocumentBanner => JSON.parse(REFERENCE);

function studio(enregistrer = vi.fn(async (doc: DocumentBanner) => validerDocument(doc).ok)) {
  let n = 0;
  let t = 1_700_000_000_000;
  const store = creerStudio({ mesurer: () => (x, c) => [...x].length * 0.5 * c, enregistrer, id: () => `id${++n}`, maintenant: () => (t += 1000) });
  return { store, enregistrer, s: () => store.getState() };
}
const photo = { id: 'photo', nom: 'photo.jpg', mime: 'image/jpeg' as const, largeurPx: 3000, hauteurPx: 2000 };

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe('édition', () => {
  it('ajouter sélectionne ; annuler et rétablir rejouent ; le document reste valide', () => {
    const { s } = studio();
    s().ajouterTexte();
    s().ajouterForme('rect');
    s().ajouterForme('ellipse');
    s().ajouterForme('ligne');
    expect(s().document.elements).toHaveLength(4);
    expect(s().selection).toBe(s().document.elements[3].id);
    expect(validerDocument(s().document)).toMatchObject({ ok: true });
    s().annuler();
    expect(s().document.elements).toHaveLength(3);
    expect(s().selection).toBeNull(); // l'élément sélectionné n'existe plus
    s().retablir();
    expect(s().document.elements).toHaveLength(4);
    for (let i = 0; i < 10; i++) s().annuler();
    expect(s().document.elements).toHaveLength(0);
  });

  it('une opération sans effet ne crée pas d’étape d’annulation', () => {
    const { s } = studio();
    s().ajouterTexte();
    const id = s().selection!;
    s().poserProprietes(id, { verrouille: true });
    const n = s().historique.passe.length;
    s().decaler(10, 0);
    s().supprimer();
    s().poserTexte(id, { contenu: 'X' });
    s().poserNom('   ');
    expect(s().historique.passe).toHaveLength(n);
    expect(s().document.elements).toHaveLength(1);
  });

  it('les flèches répétées ne font qu’une étape', () => {
    let t = 0;
    const store = creerStudio({ mesurer: () => (x, c) => [...x].length * 0.5 * c, enregistrer: async () => true, id: () => `i${Math.random()}`, maintenant: () => (t += 50) });
    store.getState().ajouterForme('rect');
    for (let i = 0; i < 8; i++) store.getState().decaler(10, 0);
    expect(store.getState().document.elements[0].xMm).toBe(1580);
    expect(store.getState().historique.passe).toHaveLength(2);
  });

  it('une image importée remplit son cadre, tient dans le format et n’est pas signalée manquante', () => {
    const { s } = studio();
    s().chargementFini();
    s().declarerImage('photo');
    expect(s().ajouterImage({ ...photo, largeurPx: 20_000, hauteurPx: 2000 })).toBe(true);
    const e = s().document.elements[0];
    expect(e.type === 'image' && e.image.ajustement).toBe('cover');
    expect(e.largeurMm).toBeLessThanOrEqual(2700);
    expect(s().alertes.map((a) => a.code)).not.toContain('IMAGE_MANQUANTE');
    expect(validerDocument(s().document)).toMatchObject({ ok: true });
  });

  it('les alertes suivent le document ; une image absente de l’appareil est critique une fois chargé', () => {
    const { s } = studio();
    s().ouvrir(lireDocument(reference()));
    expect(s().alertes.map((a) => a.code)).not.toContain('IMAGE_MANQUANTE'); // pas d'alerte pendant le chargement
    s().declarerImage('logo');
    s().chargementFini();
    expect(s().alertes.filter((a) => a.code === 'IMAGE_MANQUANTE').map((a) => a.elementId)).toEqual(['portrait']);
  });

  it('aligner se cale sur la zone de sécurité', () => {
    const { s } = studio();
    s().ajouterForme('rect');
    s().aligner('gauche');
    expect(s().document.elements[0].xMm).toBe(50 + 150);
  });

  it('un nouveau format remet la vue à l’échelle', () => {
    const { s } = studio();
    s().poserCadre({ largeur: 1000, hauteur: 600 });
    s().zoomer(4);
    expect(s().vueAjustee).toBe(false);
    s().poserFormat(6000, 1000);
    expect(s().vueAjustee).toBe(true);
    expect(s().vue.x).toBeCloseTo(32);
  });
});

describe('sauvegarde', () => {
  it('automatique, 800 ms après la dernière modification seulement', async () => {
    const { s, enregistrer } = studio();
    s().ajouterTexte();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    s().ajouterForme('rect');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    expect(enregistrer).not.toHaveBeenCalled();
    expect(s().sauvegarde).toBe('modifie');
    await vi.advanceTimersByTimeAsync(100);
    expect(enregistrer).toHaveBeenCalledTimes(1);
    expect(enregistrer.mock.calls[0][0].elements).toHaveLength(2);
    expect(s().sauvegarde).toBe('enregistre');
  });

  it('dit la vérité quand rien n’est conservé', async () => {
    const { s } = studio(vi.fn(async () => false));
    s().ajouterTexte();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(s().sauvegarde).toBe('memoire');
  });

  it('une modification pendant l’écriture n’est pas annoncée enregistrée, puis l’est', async () => {
    let finir: (() => void) | null = null;
    const ecrits: number[] = [];
    const { s } = studio(vi.fn((d: DocumentBanner) => {
      ecrits.push(d.elements.length);
      return new Promise<boolean>((ok) => { finir = () => ok(true); });
    }));
    s().ajouterTexte();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    s().ajouterForme('rect');
    finir!();
    await vi.advanceTimersByTimeAsync(0);
    expect(s().sauvegarde).toBe('modifie');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    finir!();
    await vi.advanceTimersByTimeAsync(0);
    expect(ecrits).toEqual([1, 2]);
    expect(s().sauvegarde).toBe('enregistre');
  });

  it('un projet illisible laisse un plan vierge, sous un autre identifiant, avec un message', () => {
    for (const brut of ['{', { ...reference(), version: 99 }, { ...reference(), nom: '' }, { schema: 'autre' }]) {
      const { s } = studio();
      s().ouvrir(lireDocument(brut));
      expect(s().message).toMatch(/conservé sur cet appareil/);
      expect(s().document.id).not.toBe(reference().id);
      expect(s().document.elements).toEqual([]);
    }
  });
});

describe('stockage sans IndexedDB', () => {
  it('édition en mémoire : relit ce qui a été écrit, mais annonce que rien n’est conservé', async () => {
    expect(await lireProjetCourant()).toBeNull();
    expect(await enregistrerProjet(reference())).toBe(false);
    const r = await lireProjetCourant();
    expect(r?.ok && r.document).toEqual(reference());
    expect(await enregistrerAsset('a', new Blob(['x']))).toBe(false);
    expect((await lireAsset('a'))?.size).toBe(1);
    expect(await lireAsset('absent')).toBeNull();
  });

  it('le ménage tient compte des images d’un projet même illisible', () => {
    expect(assetsCites(reference())).toEqual(['portrait', 'logo']);
    expect(assetsCites({ version: 99, assets: [{ id: 'x' }, null, { id: 3 }] })).toEqual(['x']);
    expect(assetsCites(null)).toEqual([]);
  });
});

// Tests de la persistance navigateur : projets, brouillon, panier (localStorage) et
// assets (IndexedDB → repli mémoire en Node).
//
// Aucun navigateur ici : `StorageLike` est injecté sous forme d'une `Map` en mémoire. Cela
// permet de tester exactement les règles qui comptent — tri, remplacement par id, limites,
// tolérance aux données corrompues et au quota — sans jsdom ni dépendance nouvelle.

import { describe, it, expect } from 'vitest';

import {
  storageNavigateur,
  listerProjets,
  sauverProjet,
  supprimerProjet,
  lireBrouillon,
  ecrireBrouillon,
  effacerBrouillon,
  listerPanier,
  ajouterAuPanier,
  retirerDuPanier,
  viderPanier,
  type ProjetSauvegarde,
  type StorageLike,
} from '../src/lib/projects/project-storage';
import {
  assetStoreDisponible,
  putAsset,
  getAsset,
  getAssetUrl,
  supprimerAsset,
  elaguerAssets,
} from '../src/lib/storage/asset-store';
import type { ConfiguratorConfig } from '../src/types/configurator';

/** Clés attendues — figées dans le test : les changer casserait les projets existants. */
const CLE_PROJETS = 'elembo.projets.v1';
const CLE_PANIER = 'elembo.panier.v1';
const CLE_BROUILLON = 'elembo.brouillon.v1';

/** `localStorage` en mémoire, avec deux pannes simulables (lecture et quota). */
class StockageMemoire implements StorageLike {
  readonly donnees = new Map<string, string>();
  echecEcriture = false;
  echecLecture = false;

  getItem(cle: string): string | null {
    if (this.echecLecture) throw new Error('lecture refusée (simulation)');
    return this.donnees.get(cle) ?? null;
  }

  setItem(cle: string, valeur: string): void {
    if (this.echecEcriture) throw new Error('quota dépassé (simulation)');
    this.donnees.set(cle, valeur);
  }

  removeItem(cle: string): void {
    this.donnees.delete(cle);
  }
}

function config(productId = 'tshirt-elembo'): ConfiguratorConfig {
  return { version: 2, productId, color: '#FFFFFF', side: 'front', elements: [] };
}

function projet(id: string, modifieLe: string, extra: Partial<ProjetSauvegarde> = {}): ProjetSauvegarde {
  return {
    id,
    nom: `Projet ${id}`,
    creeLe: '2026-01-01T00:00:00.000Z',
    modifieLe,
    config: config(),
    ...extra,
  };
}

/** Date ISO déterministe : sert au tri et aux limites (i = minutes). */
function dateIso(i: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
}

/** Configuration volontairement énorme (le contenu texte est le seul champ libre). */
function configVolumineuse(taille: number): ConfiguratorConfig {
  return {
    version: 3,
    productId: 'tshirt-elembo',
    color: '#FFFFFF',
    side: 'front',
    elements: [
      {
        id: 'text-001',
        type: 'text',
        content: 'A'.repeat(taille),
        fontId: 'inter',
        fontSize: 132,
        color: '#111111',
        fontWeight: 700,
        fontStyle: 'normal',
        letterSpacing: 0,
        lineHeight: 1.15,
        align: 'center',
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        side: 'front',
        z: 1,
        visible: true,
      },
    ],
  };
}

function lireTableau(stockage: StockageMemoire, cle: string): Record<string, unknown>[] {
  const texte = stockage.donnees.get(cle);
  if (!texte) return [];
  return JSON.parse(texte) as Record<string, unknown>[];
}

describe('projets — sauvegarde, lecture, remplacement, tri', () => {
  it('sauvegarde un projet et le relit à l’identique', () => {
    const stockage = new StockageMemoire();
    const p = projet('p1', '2026-03-01T10:00:00.000Z', {
      config: { ...config('tote-bag'), color: '#C62828' },
      prixFcfa: 7500,
    });

    expect(sauverProjet(p, stockage)).toBe(true);
    expect(stockage.donnees.has(CLE_PROJETS)).toBe(true);

    const liste = listerProjets(stockage);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toEqual(p);
  });

  it('remplace un projet de même id au lieu de le dupliquer', () => {
    const stockage = new StockageMemoire();
    sauverProjet(projet('p1', '2026-03-01T10:00:00.000Z', { nom: 'Ancien' }), stockage);
    sauverProjet(projet('p1', '2026-03-02T10:00:00.000Z', { nom: 'Nouveau' }), stockage);

    const liste = listerProjets(stockage);
    expect(liste).toHaveLength(1);
    expect(liste[0].nom).toBe('Nouveau');
    expect(liste[0].modifieLe).toBe('2026-03-02T10:00:00.000Z');
  });

  it('trie du plus récent au plus ancien, quel que soit l’ordre d’ajout', () => {
    const stockage = new StockageMemoire();
    sauverProjet(projet('a', '2026-03-01T10:00:00.000Z'), stockage);
    sauverProjet(projet('c', '2026-03-03T10:00:00.000Z'), stockage);
    sauverProjet(projet('b', '2026-03-02T10:00:00.000Z'), stockage);

    expect(listerProjets(stockage).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('limite la liste à 40 projets et sacrifie les plus anciens', () => {
    const stockage = new StockageMemoire();
    for (let i = 1; i <= 45; i += 1) {
      sauverProjet(projet(`p${String(i).padStart(3, '0')}`, dateIso(i)), stockage);
    }

    const liste = listerProjets(stockage);
    expect(liste).toHaveLength(40);
    expect(liste[0].id).toBe('p045');
    expect(liste[39].id).toBe('p006');
    expect(liste.some((p) => p.id === 'p005')).toBe(false);
  });

  it('refuse une entrée invalide à l’écriture sans jeter', () => {
    const stockage = new StockageMemoire();
    const sansId: ProjetSauvegarde = { id: '', nom: 'x', creeLe: '', modifieLe: '', config: config() };
    const sansProduit: ProjetSauvegarde = { ...projet('a', dateIso(1)), config: {} as ConfiguratorConfig };

    expect(sauverProjet(sansId, stockage)).toBe(false);
    expect(sauverProjet(sansProduit, stockage)).toBe(false);
    expect(ecrireBrouillon(sansProduit, stockage)).toBe(false);
    expect(ajouterAuPanier(sansProduit, stockage)).toBe(false);
    expect(listerProjets(stockage)).toEqual([]);
  });

  it('utilise les clés versionnées attendues pour les trois collections', () => {
    const stockage = new StockageMemoire();
    sauverProjet(projet('p1', dateIso(1)), stockage);
    ecrireBrouillon(projet('brouillon', dateIso(2)), stockage);
    ajouterAuPanier(projet('panier', dateIso(3)), stockage);

    expect([...stockage.donnees.keys()].sort()).toEqual([CLE_BROUILLON, CLE_PANIER, CLE_PROJETS].sort());
  });
});

describe('projets — suppression', () => {
  it('supprime un projet par id sans toucher aux autres', () => {
    const stockage = new StockageMemoire();
    sauverProjet(projet('a', dateIso(1)), stockage);
    sauverProjet(projet('b', dateIso(2)), stockage);

    supprimerProjet('a', stockage);

    expect(listerProjets(stockage).map((p) => p.id)).toEqual(['b']);
  });

  it('ne jette pas quand l’id est inconnu', () => {
    const stockage = new StockageMemoire();
    sauverProjet(projet('a', dateIso(1)), stockage);

    expect(() => supprimerProjet('inconnu', stockage)).not.toThrow();
    expect(listerProjets(stockage)).toHaveLength(1);
  });
});

describe('panier', () => {
  it('ajoute un projet et place le plus récent en tête', () => {
    const stockage = new StockageMemoire();
    expect(ajouterAuPanier(projet('a', dateIso(1)), stockage)).toBe(true);
    expect(ajouterAuPanier(projet('b', dateIso(2)), stockage)).toBe(true);

    expect(listerPanier(stockage).map((p) => p.id)).toEqual(['b', 'a']);
    expect(stockage.donnees.has(CLE_PANIER)).toBe(true);
  });

  it('remplace un doublon d’id et le repasse en tête', () => {
    const stockage = new StockageMemoire();
    ajouterAuPanier(projet('a', dateIso(1), { nom: 'Première version' }), stockage);
    ajouterAuPanier(projet('b', dateIso(2)), stockage);
    ajouterAuPanier(projet('a', dateIso(3), { nom: 'Version corrigée' }), stockage);

    const panier = listerPanier(stockage);
    expect(panier.map((p) => p.id)).toEqual(['a', 'b']);
    expect(panier[0].nom).toBe('Version corrigée');
  });

  it('limite le panier à 20 entrées, les plus récentes d’abord', () => {
    const stockage = new StockageMemoire();
    for (let i = 1; i <= 25; i += 1) {
      ajouterAuPanier(projet(`p${String(i).padStart(2, '0')}`, dateIso(i)), stockage);
    }

    const panier = listerPanier(stockage);
    expect(panier).toHaveLength(20);
    expect(panier[0].id).toBe('p25');
    expect(panier[19].id).toBe('p06');
    expect(panier.some((p) => p.id === 'p05')).toBe(false);
  });

  it('retire un projet du panier', () => {
    const stockage = new StockageMemoire();
    ajouterAuPanier(projet('a', dateIso(1)), stockage);
    ajouterAuPanier(projet('b', dateIso(2)), stockage);

    retirerDuPanier('a', stockage);

    expect(listerPanier(stockage).map((p) => p.id)).toEqual(['b']);
  });

  it('vide le panier', () => {
    const stockage = new StockageMemoire();
    ajouterAuPanier(projet('a', dateIso(1)), stockage);

    viderPanier(stockage);

    expect(listerPanier(stockage)).toEqual([]);
    expect(stockage.donnees.has(CLE_PANIER)).toBe(false);
  });

  it('refuse un projet trop lourd et retire sa version antérieure du panier', () => {
    const stockage = new StockageMemoire();
    expect(ajouterAuPanier(projet('lourd', dateIso(1)), stockage)).toBe(true);

    const tropLourd = projet('lourd', dateIso(2), { config: configVolumineuse(500_000) });
    expect(ajouterAuPanier(tropLourd, stockage)).toBe(false);

    // « Retire l'élément » : l'ancienne version légère du même id ne doit pas rester.
    expect(listerPanier(stockage)).toEqual([]);
    expect(stockage.donnees.get(CLE_PANIER)).toBe('[]');
  });
});

describe('brouillon', () => {
  it('écrit, relit et efface le brouillon', () => {
    const stockage = new StockageMemoire();
    const brouillon = projet('brouillon', dateIso(1), { nom: 'En cours' });

    expect(ecrireBrouillon(brouillon, stockage)).toBe(true);
    expect(stockage.donnees.has(CLE_BROUILLON)).toBe(true);
    expect(lireBrouillon(stockage)).toEqual(brouillon);

    effacerBrouillon(stockage);
    expect(lireBrouillon(stockage)).toBeNull();
    expect(stockage.donnees.has(CLE_BROUILLON)).toBe(false);
  });

  it('remplace le brouillon précédent (une seule entrée persistée)', () => {
    const stockage = new StockageMemoire();
    ecrireBrouillon(projet('v1', dateIso(1)), stockage);
    ecrireBrouillon(projet('v2', dateIso(2)), stockage);

    expect(lireBrouillon(stockage)?.id).toBe('v2');

    // Le brouillon est un OBJET unique, pas une liste : deux écritures ne doivent pas
    // produire deux entrées.
    const brut = JSON.parse(stockage.donnees.get(CLE_BROUILLON) ?? 'null') as unknown;
    expect(Array.isArray(brut)).toBe(false);
    expect((brut as { id: string }).id).toBe('v2');
  });
});

describe('lecture tolérante', () => {
  it('renvoie liste vide / null quand le JSON est corrompu', () => {
    const stockage = new StockageMemoire();
    stockage.donnees.set(CLE_PROJETS, '{{{');
    stockage.donnees.set(CLE_PANIER, '{{{');
    stockage.donnees.set(CLE_BROUILLON, '{{{');

    expect(listerProjets(stockage)).toEqual([]);
    expect(listerPanier(stockage)).toEqual([]);
    expect(lireBrouillon(stockage)).toBeNull();
  });

  it('renvoie liste vide / null quand la forme est inattendue', () => {
    const stockage = new StockageMemoire();
    stockage.donnees.set(CLE_PROJETS, '{"projets":[]}');
    stockage.donnees.set(CLE_PANIER, '"du texte"');
    stockage.donnees.set(CLE_BROUILLON, '[]');

    expect(listerProjets(stockage)).toEqual([]);
    expect(listerPanier(stockage)).toEqual([]);
    expect(lireBrouillon(stockage)).toBeNull();
  });

  it('ignore les entrées invalides et les doublons d’id', () => {
    const stockage = new StockageMemoire();
    stockage.donnees.set(
      CLE_PROJETS,
      JSON.stringify([
        { id: 42, config: config() }, // id non string
        { nom: 'sans id', config: config() },
        { id: 'sans-config', config: null },
        { id: 'sans-produit', config: { version: 2, color: '#fff', side: 'front', elements: [] } },
        { id: 'valide', config: { productId: 'x' }, nom: 'Bon projet', creeLe: '', modifieLe: dateIso(1) },
        { id: 'valide', config: { productId: 'x' }, nom: 'Doublon ignoré', creeLe: '', modifieLe: dateIso(2) },
      ]),
    );

    const liste = listerProjets(stockage);
    expect(liste).toHaveLength(1);
    expect(liste[0].id).toBe('valide');
    expect(liste[0].nom).toBe('Bon projet');
    expect(liste[0].config.productId).toBe('x');
  });

  it('tolère un getItem qui jette (stockage restreint)', () => {
    const stockage = new StockageMemoire();
    stockage.echecLecture = true;

    expect(listerProjets(stockage)).toEqual([]);
    expect(listerPanier(stockage)).toEqual([]);
    expect(lireBrouillon(stockage)).toBeNull();
  });

  it('répond de façon neutre hors navigateur (SSR, aucun stockage injecté)', () => {
    expect(storageNavigateur()).toBeNull();
    expect(listerProjets()).toEqual([]);
    expect(listerPanier()).toEqual([]);
    expect(lireBrouillon()).toBeNull();
    expect(sauverProjet(projet('p1', dateIso(1)))).toBe(false);
    expect(ecrireBrouillon(projet('b1', dateIso(1)))).toBe(false);
    expect(ajouterAuPanier(projet('p2', dateIso(1)))).toBe(false);
    expect(() => {
      supprimerProjet('p1');
      retirerDuPanier('p2');
      effacerBrouillon();
      viderPanier();
    }).not.toThrow();
  });
});

describe('quota dépassé', () => {
  it('renvoie false pour chaque écriture, sans exception', () => {
    const stockage = new StockageMemoire();
    stockage.echecEcriture = true;

    expect(() => sauverProjet(projet('a', dateIso(1)), stockage)).not.toThrow();
    expect(sauverProjet(projet('a', dateIso(1)), stockage)).toBe(false);
    expect(ecrireBrouillon(projet('b', dateIso(1)), stockage)).toBe(false);
    expect(ajouterAuPanier(projet('c', dateIso(1)), stockage)).toBe(false);

    expect(listerProjets(stockage)).toEqual([]);
    expect(lireBrouillon(stockage)).toBeNull();
    expect(listerPanier(stockage)).toEqual([]);
  });

  it('les suppressions restent silencieuses quand l’écriture échoue', () => {
    const stockage = new StockageMemoire();
    stockage.echecEcriture = true;

    expect(() => {
      supprimerProjet('a', stockage);
      retirerDuPanier('a', stockage);
    }).not.toThrow();
  });

  it('redevient fonctionnel une fois le quota libéré', () => {
    const stockage = new StockageMemoire();
    stockage.echecEcriture = true;
    expect(sauverProjet(projet('a', dateIso(1)), stockage)).toBe(false);

    stockage.echecEcriture = false;
    expect(sauverProjet(projet('a', dateIso(1)), stockage)).toBe(true);
    expect(listerProjets(stockage)).toHaveLength(1);
  });
});

describe('aperçus — plafond de 400 000 caractères', () => {
  it('conserve un aperçu de 400 000 caractères (limite incluse)', () => {
    const stockage = new StockageMemoire();
    const apercu = 'A'.repeat(400_000);

    expect(sauverProjet(projet('a', dateIso(1), { apercu }), stockage)).toBe(true);
    expect(listerProjets(stockage)[0].apercu).toHaveLength(400_000);
  });

  it('omet le champ apercu au-delà de 400 000 caractères (le projet reste sauvegardé)', () => {
    const stockage = new StockageMemoire();
    const apercu = 'A'.repeat(400_001);

    expect(sauverProjet(projet('a', dateIso(1), { apercu }), stockage)).toBe(true);

    const [brut] = lireTableau(stockage, CLE_PROJETS);
    expect('apercu' in brut).toBe(false);
    expect(listerProjets(stockage)[0].apercu).toBeUndefined();
    expect(listerProjets(stockage)[0].id).toBe('a');
  });

  it('applique la même règle au brouillon', () => {
    const stockage = new StockageMemoire();
    const brouillon = projet('b', dateIso(1), { apercu: 'B'.repeat(400_001) });

    expect(ecrireBrouillon(brouillon, stockage)).toBe(true);
    expect(lireBrouillon(stockage)?.apercu).toBeUndefined();
    expect(lireBrouillon(stockage)?.id).toBe('b');
  });
});

// Le reste couvre le repli mémoire d'IndexedDB : en environnement Node, `indexedDB` est
// absent, exactement comme côté SSR ou en navigation privée. Les assets doivent rester
// utilisables pour la session, sans jamais jeter.
describe('asset-store — repli mémoire hors navigateur', () => {
  it('signale que la persistance durable (IndexedDB) est indisponible', () => {
    expect(assetStoreDisponible()).toBe(false);
  });

  it('stocke, relit et supprime un asset en mémoire', async () => {
    const blob = new Blob(['logo'], { type: 'image/png' });
    const id = await putAsset(blob, { name: 'logo.png', width: 512, height: 256 });
    if (id === null) throw new Error('un id est attendu');

    const asset = await getAsset(id);
    expect(asset).not.toBeNull();
    expect(asset?.name).toBe('logo.png');
    expect(asset?.type).toBe('image/png');
    expect(asset?.width).toBe(512);
    expect(asset?.height).toBe(256);
    expect(asset?.blob.size).toBe(4);

    await supprimerAsset(id);
    expect(await getAsset(id)).toBeNull();
  });

  it('élague les assets qui ne sont plus référencés', async () => {
    const a = await putAsset(new Blob(['a'], { type: 'image/png' }), { name: 'a.png', width: 1, height: 1 });
    const b = await putAsset(new Blob(['b'], { type: 'image/png' }), { name: 'b.png', width: 1, height: 1 });
    if (a === null || b === null) throw new Error('deux ids sont attendus');

    await elaguerAssets([a]);
    expect(await getAsset(a)).not.toBeNull();
    expect(await getAsset(b)).toBeNull();

    await supprimerAsset(a);
  });

  it('renvoie null pour un id inconnu et accepte un blob invalide sans jeter', async () => {
    expect(await getAsset('inconnu')).toBeNull();
    expect(await getAssetUrl('inconnu')).toBeNull();
    expect(await putAsset(null as unknown as Blob, { name: 'x.png', width: 1, height: 1 })).toBeNull();
  });

  it('met en cache l’URL d’objet par id', async () => {
    const id = await putAsset(new Blob(['img'], { type: 'image/png' }), { name: 'i.png', width: 2, height: 2 });
    if (id === null) throw new Error('un id est attendu');

    const premiere = await getAssetUrl(id);
    if (typeof URL.createObjectURL !== 'function') {
      // Environnement sans support des object URLs : on exige seulement l'absence d'exception.
      expect(premiere).toBeNull();
    } else {
      expect(premiere).toMatch(/^blob:/);
      expect(await getAssetUrl(id)).toBe(premiere);
    }

    await supprimerAsset(id);
  });
});

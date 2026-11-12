// Mug Elembo dans l'atelier 3D : conformité du GLB, procédés propres au mug, zone
// imprimable, bascule de produit dans le store, commande bloquée tant que l'atelier n'a pas
// validé, et lien de la boutique vers le configurateur.

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CATALOG,
  DEFAULT_PRODUCT_ID,
  ELEMBO_MUG_ZONES,
  MUG_PRODUCT_ID,
  getPrintArea,
  getProductById,
  productSides,
  validateProduct,
} from '../src/lib/products/catalog';
import {
  empechementsCommande,
  profilParDefautDuProduit,
  profilParId,
  profilsDuProduit,
  validerProfils,
  zoneCommandable,
} from '../src/lib/products/production';
import { useConfiguratorStore } from '../src/stores/configurator-store';
import { PRODUITS_VITRINE } from '../src/lib/commerce/catalogue';
import { buildProductionSheet, productionSheetText } from '../src/lib/order/order';
import type { Measurer } from '../src/lib/canvas/design-canvas';

const parseur = (await import('../scripts/glb-zones.mjs')) as unknown as {
  readGlb: (path: string) => { json: GlbJson; bin: Buffer };
  accessorData: (glb: { json: GlbJson; bin: Buffer }, index: number) => Float32Array;
};
type GlbJson = {
  nodes: { name: string; mesh?: number; children?: number[]; extras?: Record<string, unknown> }[];
  meshes: { name: string; primitives: { material: number; attributes: Record<string, number> }[] }[];
  materials: { name: string; alphaMode?: string }[];
};

const GLB_PATH = 'public/models/elembo-mug/elembo-mug.glb';
const glb = parseur.readGlb(GLB_PATH);
const mug = getProductById(MUG_PRODUCT_ID)!;
const tshirt = getProductById(DEFAULT_PRODUCT_ID)!;
const zonesJson = JSON.parse(readFileSync('assets/3d/elembo-mug/zones.json', 'utf8')) as {
  colors: { name: string; hex: string }[];
  print_surface: { width_mm: number; height_mm: number };
};

describe('mug Elembo : GLB réel et catalogue', () => {
  it('le catalogue du configurateur contient le mug, au même identifiant que la vitrine', () => {
    expect(mug).toBeDefined();
    expect(CATALOG.some((p) => p.id === MUG_PRODUCT_ID)).toBe(true);
    expect(PRODUITS_VITRINE.some((p) => p.id === MUG_PRODUCT_ID)).toBe(true);
    expect(validateProduct(mug)).toEqual({ ok: true, errors: [] });
  });

  it('la surface d’impression déclarée existe dans le fichier, avec UV0 (visuel) et UV1 (émail)', () => {
    const nom = ELEMBO_MUG_ZONES.wrap!.mesh;
    const noeud = glb.json.nodes.find((n) => n.name === nom);
    expect(noeud, `nœud ${nom} absent du GLB`).toBeDefined();
    const primitive = glb.json.meshes[noeud!.mesh!].primitives[0];
    expect(Object.keys(primitive.attributes)).toEqual(expect.arrayContaining(['TEXCOORD_0', 'TEXCOORD_1']));
    const materiau = glb.json.materials[primitive.material];
    expect(materiau.name).toBe('MAT_MUG_PRINT');
    expect(materiau.alphaMode).toBe('BLEND');
  });

  it('les UV d’impression couvrent exactement 0..1 (tour complet)', () => {
    const noeud = glb.json.nodes.find((n) => n.name === 'MUG_PRINT_SURFACE')!;
    const uv = parseur.accessorData(glb, glb.json.meshes[noeud.mesh!].primitives[0].attributes.TEXCOORD_0);
    let umin = Infinity;
    let umax = -Infinity;
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i < uv.length; i += 2) {
      umin = Math.min(umin, uv[i]);
      umax = Math.max(umax, uv[i]);
      vmin = Math.min(vmin, uv[i + 1]);
      vmax = Math.max(vmax, uv[i + 1]);
    }
    expect([umin, umax, vmin, vmax].map((v) => +v.toFixed(3))).toEqual([0, 1, 0, 1]);
  });

  it('les matériaux colorables existent tous et n’incluent jamais celui de l’impression', () => {
    const noms = glb.json.materials.map((m) => m.name);
    for (const nom of mug.fabricMaterials!) expect(noms, `matériau ${nom} absent`).toContain(nom);
    expect(mug.fabricMaterials).not.toContain('MAT_MUG_PRINT');
  });

  it('la texture de la zone a les dimensions physiques du fichier (257,6 × 80 mm)', () => {
    const t = ELEMBO_MUG_ZONES.wrap!.textureCm;
    expect(t.w * 10).toBeCloseTo(zonesJson.print_surface.width_mm, 1);
    expect(t.h * 10).toBeCloseTo(zonesJson.print_surface.height_mm, 1);
  });

  it('porte les mêmes couleurs que le modèle', () => {
    expect(mug.colors.map((c) => c.hex.toUpperCase())).toEqual(zonesJson.colors.map((c) => c.hex.toUpperCase()));
  });

  it('expose une seule zone, le pourtour, et se commande en quantité seule', () => {
    expect(productSides(mug)).toEqual(['wrap']);
    expect(mug.tailles).toBe(false);
    expect(mug.support).toBe('mug');
    expect(mug.venteEnLigne).toBe(false);
  });
});

describe('mug Elembo : procédés de production', () => {
  it('le fichier de profils reste valide', () => {
    expect(validerProfils()).toEqual([]);
  });

  it('le mug ne voit que ses procédés, le T-shirt ne voit pas ceux du mug', () => {
    expect(profilsDuProduit(mug).map((p) => p.id)).toEqual(['sublimation-mug', 'sublimation-mug-tour']);
    expect(profilsDuProduit(tshirt).some((p) => p.id.startsWith('sublimation-mug'))).toBe(false);
    expect(profilParDefautDuProduit(mug).id).toBe('sublimation-mug');
    expect(profilParDefautDuProduit(tshirt).id).toBe('dtf');
  });

  it('un procédé textile demandé pour un mug retombe sur le procédé du mug', () => {
    expect(profilParId('dtf', mug).id).toBe('sublimation-mug');
  });

  it('la zone imprimable est centrée sur la face visible (U = 0,5), dans le pourtour', () => {
    for (const profil of profilsDuProduit(mug)) {
      const area = getPrintArea(mug, 'wrap', profil.id)!;
      expect(area).not.toBeNull();
      expect(area.x + area.w / 2).toBeCloseTo(0.5, 4);
      expect(area.x).toBeGreaterThan(0);
      expect(area.x + area.w).toBeLessThan(1);
      expect(area.y + area.h).toBeLessThanOrEqual(1);
      // Isotropie : le ratio en cm est celui de la texture (un cercle reste un cercle).
      expect(area.cmWidth / area.cmHeight).toBeCloseTo((area.w * 25.76) / (area.h * 8), 2);
    }
    expect(getPrintArea(mug, 'wrap', 'sublimation-mug')).toMatchObject({ cmWidth: 20, cmHeight: 7.2 });
  });

  it('le tour complet laisse libre la zone de l’anse (couture à U = 0 / 1)', () => {
    const area = getPrintArea(mug, 'wrap', 'sublimation-mug-tour')!;
    // zone d'exclusion de l'anse : U < 0,035 et U > 0,965 (assets/3d/elembo-mug/zones.json)
    expect(area.x).toBeGreaterThanOrEqual(0.035);
    expect(area.x + area.w).toBeLessThanOrEqual(0.965);
  });

  it('commande bloquée tant que l’atelier n’a pas validé la sublimation sur mug', () => {
    const profil = profilParDefautDuProduit(mug);
    expect(zoneCommandable(profil, 'wrap')).toBe(false);
    expect(empechementsCommande(profil, ['wrap']).length).toBeGreaterThan(0);
  });
});

describe('mug Elembo : store du configurateur', () => {
  const store = () => useConfiguratorStore.getState();

  beforeEach(() => {
    store().reset();
    store().setProduct(DEFAULT_PRODUCT_ID);
    store().setProfile('dtf');
  });

  it('passer au mug choisit son procédé, sa zone et sa première couleur', () => {
    store().setProduct(MUG_PRODUCT_ID);
    expect(store().productId).toBe(MUG_PRODUCT_ID);
    expect(store().profileId).toBe('sublimation-mug');
    expect(store().side).toBe('wrap');
    expect(store().color).toBe(mug.colors[0].hex);
  });

  it('un procédé textile est refusé sur le mug', () => {
    store().setProduct(MUG_PRODUCT_ID);
    store().setProfile('dtf');
    expect(store().profileId).toBe('sublimation-mug');
    store().setProfile('sublimation-mug-tour');
    expect(store().profileId).toBe('sublimation-mug-tour');
  });

  it('revenir au T-shirt rend son procédé textile par défaut', () => {
    store().setProduct(MUG_PRODUCT_ID);
    store().setProduct(DEFAULT_PRODUCT_ID);
    expect(store().profileId).toBe('dtf');
    expect(store().side).toBe('front');
  });

  it('un texte posé sur le mug reste dans la zone imprimable et se sérialise sur le pourtour', () => {
    store().setProduct(MUG_PRODUCT_ID);
    const id = store().addText({ content: 'MAMAN' });
    const el = store().elements.find((e) => e.id === id)!;
    expect(el.side).toBe('wrap');
    const config = store().serialize();
    expect(config.productId).toBe(MUG_PRODUCT_ID);
    expect(config.profileId).toBe('sublimation-mug');
    expect(config.elements[0]).toMatchObject({ side: 'wrap', type: 'text', content: 'MAMAN' });
  });

  it('recharger un projet de mug restaure produit, procédé et éléments', () => {
    store().setProduct(MUG_PRODUCT_ID);
    store().addText({ content: 'Bonne fête' });
    const config = store().serialize();
    store().reset();
    store().setProduct(DEFAULT_PRODUCT_ID);
    const resultat = store().loadConfig(config);
    expect(resultat.ok).toBe(true);
    expect(store().productId).toBe(MUG_PRODUCT_ID);
    expect(store().profileId).toBe('sublimation-mug');
    expect(store().elements).toHaveLength(1);
  });

  it('un projet de mug portant un procédé textile retombe sur la sublimation, avec un avertissement', () => {
    const resultat = store().loadConfig({
      version: 3,
      productId: MUG_PRODUCT_ID,
      color: '#F4F1EA',
      side: 'wrap',
      profileId: 'dtf',
      elements: [],
    });
    expect(resultat.ok).toBe(true);
    expect(store().profileId).toBe('sublimation-mug');
    expect(resultat.warnings.join(' ')).toMatch(/non applicable/);
  });
});

describe('mug Elembo : boutique', () => {
  it('la fiche « Mug personnalisé » ouvre l’atelier 3D sur le mug, plus WhatsApp', () => {
    const fiche = PRODUITS_VITRINE.find((p) => p.id === MUG_PRODUCT_ID)!;
    expect(fiche.href).toBe(`/personnalisation?produit=${MUG_PRODUCT_ID}`);
    expect(fiche.href).not.toMatch(/wa\.me/);
    expect(fiche.cta).toBe('Personnaliser en 3D');
  });
});

describe('mug Elembo : fiche et fichier de production', () => {
  const mesureur: Measurer = (text, font) => text.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16) * 0.55;

  it('produit un seul fichier wrap.png, à 300 dpi des dimensions imprimables (20 × 7,2 cm)', () => {
    const fiche = buildProductionSheet({
      reference: 'ELB-TEST-MUG',
      product: mug,
      color: '#F4F1EA',
      lines: [{ size: 'TU', quantity: 2 }],
      city: 'brazzaville',
      unitPriceFcfa: null,
      profileId: 'sublimation-mug',
      measure: mesureur,
      elements: [
        {
          id: 'text-001', type: 'text', content: 'MAMAN', fontId: 'anton', fontSize: 132, color: '#110D15',
          fontWeight: 700, fontStyle: 'normal', letterSpacing: 0, lineHeight: 1.15, align: 'center',
          x: 0, y: 0, scale: 1, rotation: 0, side: 'wrap', z: 1, visible: true,
        },
      ],
    });
    expect(fiche.faces.map((f) => f.fichier)).toEqual(['wrap.png']);
    expect(fiche.faces[0].zoneCm).toEqual({ w: 20, h: 7.2 });
    // 20 cm et 7,2 cm à 300 dpi : 2362 × 850 px, ratio conservé.
    expect(fiche.faces[0].pixels).toEqual({ w: 2362, h: 850 });
    expect(fiche.tailleEtQuantite.total).toBe(2);
    expect(productionSheetText(fiche)).toMatch(/Sublimation/);
  });
});


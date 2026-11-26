// Casquette Elembo dans l'atelier 3D : conformité du GLB (surfaces d'impression, UV, matériaux),
// zones des procédés réellement posées sur le tissu, procédés propres à la casquette, bascule de
// produit dans le store, commande bloquée tant que l'atelier n'a pas validé, fiche boutique et
// fichier de production.

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CAP_PRODUCT_ID,
  CATALOG,
  DEFAULT_PRODUCT_ID,
  ELEMBO_CAP_ZONES,
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
import type { Side } from '../src/types/configurator';
import { SIDE_FILE } from '../src/types/configurator';

const parseur = (await import('../scripts/glb-zones.mjs')) as unknown as {
  readGlb: (path: string) => Glb;
  accessorData: (glb: Glb, index: number) => Float32Array;
};
type Glb = { json: GlbJson; bin: Buffer };
type GlbJson = {
  nodes: { name: string; mesh?: number }[];
  meshes: { name: string; primitives: { material: number; indices?: number; attributes: Record<string, number> }[] }[];
  materials: { name: string; alphaMode?: string }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number }[];
  bufferViews: { byteOffset?: number }[];
};

const GLB_PATH = 'public/models/elembo-casquette/elembo-casquette.glb';
const glb = parseur.readGlb(GLB_PATH);
const casquette = getProductById(CAP_PRODUCT_ID)!;
const tshirt = getProductById(DEFAULT_PRODUCT_ID)!;
const mug = getProductById(MUG_PRODUCT_ID)!;
const ZONES_CASQUETTE: Side[] = ['cap-front', 'cap-left', 'cap-right', 'cap-back', 'visor'];
const zonesJson = JSON.parse(readFileSync('assets/3d/elembo-casquette/zones.json', 'utf8')) as {
  colors: { name: string; hex: string }[];
  fabric_materials: string[];
  zones: Record<
    string,
    {
      mesh: string;
      material: string;
      texture_cm: [number, number];
      isotropie: { anisotropie_p95: number; echelle_p05: number; echelle_p95: number };
    }
  >;
};

function indices(index: number): Uint32Array {
  const acc = glb.json.accessors[index];
  const offset = (glb.json.bufferViews[acc.bufferView].byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = new Uint32Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    out[i] = acc.componentType === 5125 ? glb.bin.readUInt32LE(offset + i * 4) : glb.bin.readUInt16LE(offset + i * 2);
  }
  return out;
}

function primitiveDe(mesh: string) {
  const noeud = glb.json.nodes.find((n) => n.name === mesh);
  expect(noeud, `nœud ${mesh} absent du GLB`).toBeDefined();
  return glb.json.meshes[noeud!.mesh!].primitives[0];
}

/** Triangles de la surface d'impression, en UV glTF (V = 0 en haut de l'image). */
function trianglesUv(mesh: string): number[][] {
  const primitive = primitiveDe(mesh);
  const uv = parseur.accessorData(glb, primitive.attributes.TEXCOORD_0);
  const idx = indices(primitive.indices!);
  const tris: number[][] = [];
  for (let i = 0; i < idx.length; i += 3) {
    tris.push([0, 1, 2].flatMap((k) => [uv[idx[i + k] * 2], uv[idx[i + k] * 2 + 1]]));
  }
  return tris;
}

function dansUnTriangle(tris: number[][], x: number, y: number): boolean {
  return tris.some(([ax, ay, bx, by, cx, cy]) => {
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    return !(neg && pos);
  });
}

describe('casquette Elembo : GLB réel et catalogue', () => {
  it('le catalogue du configurateur contient la casquette, au même identifiant que la vitrine', () => {
    expect(casquette).toBeDefined();
    expect(CATALOG.some((p) => p.id === CAP_PRODUCT_ID)).toBe(true);
    expect(PRODUITS_VITRINE.some((p) => p.id === CAP_PRODUCT_ID)).toBe(true);
    expect(validateProduct(casquette)).toEqual({ ok: true, errors: [] });
  });

  it('expose cinq zones propres, se commande en quantité seule et hors vente en ligne', () => {
    expect(productSides(casquette)).toEqual(ZONES_CASQUETTE);
    expect(casquette.support).toBe('casquette');
    expect(casquette.tailles).toBe(false);
    expect(casquette.venteEnLigne).toBe(false);
    expect(casquette.priceFcfa ?? null).toBeNull();
  });

  it('chaque surface d’impression existe, avec UV0 (visuel), UV1 (sergé) et un matériau transparent propre', () => {
    const materiaux = new Set<string>();
    for (const side of ZONES_CASQUETTE) {
      const zone = ELEMBO_CAP_ZONES[side]!;
      const attendu = zonesJson.zones[side];
      expect(zone.mesh).toBe(attendu.mesh);
      const primitive = primitiveDe(zone.mesh);
      expect(Object.keys(primitive.attributes)).toEqual(expect.arrayContaining(['TEXCOORD_0', 'TEXCOORD_1']));
      const materiau = glb.json.materials[primitive.material];
      expect(materiau.name).toBe(attendu.material);
      expect(materiau.alphaMode).toBe('BLEND');
      materiaux.add(materiau.name);
    }
    // Une texture par zone : jamais deux zones sur le même matériau.
    expect(materiaux.size).toBe(ZONES_CASQUETTE.length);
  });

  it('les UV d’impression restent dans 0..1 et la texture a les dimensions physiques du fichier', () => {
    for (const side of ZONES_CASQUETTE) {
      const zone = ELEMBO_CAP_ZONES[side]!;
      const uv = parseur.accessorData(glb, primitiveDe(zone.mesh).attributes.TEXCOORD_0);
      for (const v of uv) {
        expect(v).toBeGreaterThanOrEqual(-1e-4);
        expect(v).toBeLessThanOrEqual(1 + 1e-4);
      }
      expect([zone.textureCm.w, zone.textureCm.h]).toEqual(zonesJson.zones[side].texture_cm);
    }
  });

  it('les UV sont isotropes : 1 cm de visuel = 1 cm de tissu, à 8 % près sur 95 % de la surface', () => {
    for (const side of ZONES_CASQUETTE) {
      const iso = zonesJson.zones[side].isotropie;
      expect(iso.anisotropie_p95, side).toBeLessThan(1.08);
      expect(iso.echelle_p05, side).toBeGreaterThan(0.95);
      expect(iso.echelle_p95, side).toBeLessThan(1.05);
    }
  });

  it('les matériaux colorables existent tous et n’incluent jamais ceux de l’impression', () => {
    const noms = glb.json.materials.map((m) => m.name);
    expect(casquette.fabricMaterials).toEqual(zonesJson.fabric_materials);
    for (const nom of casquette.fabricMaterials!) expect(noms, `matériau ${nom} absent`).toContain(nom);
    expect(casquette.fabricMaterials!.some((m) => m.startsWith('MAT_CAP_PRINT'))).toBe(false);
  });

  it('porte les mêmes couleurs que le modèle', () => {
    expect(casquette.colors.map((c) => c.hex.toUpperCase())).toEqual(zonesJson.colors.map((c) => c.hex.toUpperCase()));
  });

  it('a ses propres fichiers de production et ses gabarits', () => {
    expect(ZONES_CASQUETTE.map((s) => SIDE_FILE[s])).toEqual([
      'cap-front.png',
      'cap-left.png',
      'cap-right.png',
      'cap-back.png',
      'visor.png',
    ]);
    for (const side of ZONES_CASQUETTE) expect(() => readFileSync(`public/zones/${side}.png`)).not.toThrow();
  });
});

describe('casquette Elembo : procédés de production', () => {
  it('le fichier de profils reste valide', () => {
    expect(validerProfils()).toEqual([]);
  });

  it('la casquette ne voit que ses procédés, et ceux-ci restent hors du T-shirt et du mug', () => {
    expect(profilsDuProduit(casquette).map((p) => p.id)).toEqual(['broderie-casquette', 'transfert-casquette']);
    expect(profilParDefautDuProduit(casquette).id).toBe('broderie-casquette');
    for (const autre of [tshirt, mug]) {
      expect(profilsDuProduit(autre).some((p) => p.id.endsWith('-casquette'))).toBe(false);
    }
    expect(profilParId('dtf', casquette).id).toBe('broderie-casquette');
  });

  it('chaque zone imprimable de chaque procédé est entièrement posée sur le tissu', () => {
    for (const profil of profilsDuProduit(casquette)) {
      for (const side of ZONES_CASQUETTE) {
        const area = getPrintArea(casquette, side, profil.id)!;
        expect(area, `${profil.id}/${side}`).not.toBeNull();
        // Centrée horizontalement, isotrope (un cercle reste un cercle).
        expect(area.x + area.w / 2).toBeCloseTo(0.5, 4);
        const t = ELEMBO_CAP_ZONES[side]!.textureCm;
        expect(area.cmWidth / area.cmHeight).toBeCloseTo((area.w * t.w) / (area.h * t.h), 2);
        // Grille de 7 × 7 points de la zone : chacun tombe dans un triangle de la surface.
        const tris = trianglesUv(ELEMBO_CAP_ZONES[side]!.mesh);
        for (let i = 0; i <= 6; i++) {
          for (let j = 0; j <= 6; j++) {
            const x = area.x + 1e-3 + ((area.w - 2e-3) * i) / 6;
            const y = area.y + 1e-3 + ((area.h - 2e-3) * j) / 6;
            expect(dansUnTriangle(tris, x, y), `${profil.id}/${side} : point (${x.toFixed(3)}, ${y.toFixed(3)}) hors tissu`).toBe(true);
          }
        }
      }
    }
  });

  it('commande bloquée tant que l’atelier n’a pas validé broderie et transfert', () => {
    for (const profil of profilsDuProduit(casquette)) {
      expect(zoneCommandable(profil, 'cap-front')).toBe(false);
      expect(empechementsCommande(profil, ['cap-front']).length).toBeGreaterThan(0);
    }
  });
});

describe('casquette Elembo : store du configurateur', () => {
  const store = () => useConfiguratorStore.getState();

  beforeEach(() => {
    store().reset();
    store().setProduct(DEFAULT_PRODUCT_ID);
    store().setProfile('dtf');
  });

  it('passer à la casquette choisit la broderie, le panneau avant et sa première couleur', () => {
    store().setProduct(CAP_PRODUCT_ID);
    expect(store().productId).toBe(CAP_PRODUCT_ID);
    expect(store().profileId).toBe('broderie-casquette');
    expect(store().side).toBe('cap-front');
    expect(store().color).toBe(casquette.colors[0].hex);
  });

  it('un procédé textile est refusé sur la casquette', () => {
    store().setProduct(CAP_PRODUCT_ID);
    store().setProfile('dtf');
    expect(store().profileId).toBe('broderie-casquette');
    store().setProfile('transfert-casquette');
    expect(store().profileId).toBe('transfert-casquette');
  });

  it('un texte posé sur la visière se sérialise sur la visière, et le projet se recharge', () => {
    store().setProduct(CAP_PRODUCT_ID);
    store().setSide('visor');
    const id = store().addText({ content: 'BRAZZA' });
    expect(store().elements.find((e) => e.id === id)!.side).toBe('visor');
    const config = store().serialize();
    expect(config.elements[0]).toMatchObject({ side: 'visor', type: 'text', content: 'BRAZZA' });
    store().reset();
    store().setProduct(DEFAULT_PRODUCT_ID);
    const resultat = store().loadConfig(config);
    expect(resultat.ok).toBe(true);
    expect(store().productId).toBe(CAP_PRODUCT_ID);
    expect(store().profileId).toBe('broderie-casquette');
    expect(store().elements).toHaveLength(1);
  });
});

describe('casquette Elembo : boutique', () => {
  it('la fiche « Casquette personnalisée » est une fiche textile configurable en 3D sur la casquette', () => {
    const fiche = PRODUITS_VITRINE.find((p) => p.id === CAP_PRODUCT_ID)!;
    expect(fiche.famille).toBe('textile');
    expect(fiche.href).toBe(`/textile/${CAP_PRODUCT_ID}`);
    expect(fiche.fiche?.configurable3D).toBe(true);
    expect(fiche.fiche?.produit3DId).toBe(CAP_PRODUCT_ID);
    expect(fiche.fiche?.couleurs.map((c) => c.hex)).toEqual(casquette.colors.map((c) => c.hex));
    expect(() => readFileSync(`public${fiche.image!.src}`)).not.toThrow();
  });
});

describe('casquette Elembo : fiche et fichier de production', () => {
  const mesureur: Measurer = (text, font) => text.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16) * 0.55;

  it('produit cap-front.png à 300 dpi de la zone brodée (11 × 5,5 cm)', () => {
    const fiche = buildProductionSheet({
      reference: 'ELB-TEST-CAP',
      product: casquette,
      color: '#1B1B1D',
      lines: [{ size: 'TU', quantity: 3 }],
      city: 'brazzaville',
      unitPriceFcfa: null,
      profileId: 'broderie-casquette',
      measure: mesureur,
      elements: [
        {
          id: 'text-001', type: 'text', content: 'ELEMBO', fontId: 'anton', fontSize: 132, color: '#FF5A12',
          fontWeight: 700, fontStyle: 'normal', letterSpacing: 0, lineHeight: 1.15, align: 'center',
          x: 0.5, y: 0.5, scale: 1, rotation: 0, side: 'cap-front', z: 1, visible: true,
        },
      ],
    });
    expect(fiche.faces.map((f) => f.fichier)).toEqual(['cap-front.png']);
    expect(fiche.faces[0].zoneCm).toEqual({ w: 11, h: 5.5 });
    // 11 cm et 5,5 cm à 300 dpi : 1299 × 650 px.
    expect(fiche.faces[0].pixels).toEqual({ w: 1299, h: 650 });
    expect(fiche.tailleEtQuantite.total).toBe(3);
    const texte = productionSheetText(fiche);
    expect(texte).toMatch(/Broderie/);
    expect(texte).toMatch(/cap-front, cap-left, cap-right, cap-back, visor/);
  });
});

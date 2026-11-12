import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ELEMBO_TSHIRT_ZONES, getProductById } from '../src/lib/products/catalog';
import { SIDES, SIDE_LABELS } from '../src/types/configurator';

// Vérifie le MODÈLE 3D RÉEL (pas la documentation) : noms de nœuds, matériaux, jeux d'UV,
// métadonnées et repères. Le parseur est le même que celui utilisé pour l'intégration
// (`scripts/glb-zones.mjs`) : une divergence entre le GLB et le catalogue échoue ici.
const chemin = join(process.cwd(), 'public', 'models', 'elembo-tshirt', 'elembo-tshirt.glb');

type Glb = {
  json: {
    nodes: { name: string; mesh?: number; extras?: Record<string, unknown> }[];
    meshes: { name: string; primitives: { material?: number; attributes: Record<string, number> }[] }[];
    materials: { name: string }[];
    extensionsRequired?: string[];
    animations?: unknown[];
    cameras?: unknown[];
    accessors: { componentType: number; count: number; type: string; bufferView?: number }[];
    bufferViews: { byteOffset?: number; byteStride?: number }[];
    buffers: { byteLength: number }[];
  };
  bin: Buffer;
};

type Description = {
  nodes: { name: string; mesh: string | null; primitives: { material: string | null; attributes: string[] }[] }[];
  materials: string[];
  rootExtras: {
    elembo_version?: number;
    units?: string;
    colors?: Record<string, string>;
    fabric_materials?: string[];
  } | null;
  zones: Record<
    string,
    {
      node: string;
      material: string;
      textureCm: { w: number; h: number };
      uvBox: { umin: number; umax: number; vmin: number; vmax: number };
      axisTopCm: number;
      surfaceCm: { left: number; right: number; top: number; bottom: number };
    }
  >;
};

const parseur = (await import('../scripts/glb-zones.mjs')) as unknown as {
  readGlb: (p: string) => Glb;
  describeGlb: (p: string) => Description;
};

const glb = parseur.readGlb(chemin);
const description = parseur.describeGlb(chemin);
const product = getProductById('tshirt-basic')!;

/** Clé de zone dans les extras du GLB : `left-sleeve` (app) → `left_sleeve` (GLB). */
const cleGlb = (side: string) => side.replace('-', '_');

describe('modèle 3D Elembo : structure réelle du GLB', () => {
  it('contient le nœud racine et les cinq surfaces d’impression', () => {
    const noms = description.nodes.map((n) => n.name);
    expect(noms).toEqual(
      expect.arrayContaining([
        'ELEMBO_TSHIRT',
        'TSHIRT_BODY',
        'TSHIRT_FRONT_PRINT',
        'TSHIRT_BACK_PRINT',
        'TSHIRT_LEFT_SLEEVE_PRINT',
        'TSHIRT_RIGHT_SLEEVE_PRINT',
        'TSHIRT_COLLAR_PRINT',
      ]),
    );
  });

  it('déclare les matériaux du tissu et un matériau d’impression par zone', () => {
    expect(description.materials).toEqual(
      expect.arrayContaining(['FABRIC', 'FABRIC_RIB']),
    );
    for (const zone of Object.values(ELEMBO_TSHIRT_ZONES)) {
      expect(description.materials).toContain(`PRINT_${zone!.mesh.replace('TSHIRT_', '').replace('_PRINT', '')}`);
    }
  });

  it('TSHIRT_BODY porte deux primitives (groupe + deux matériaux dans Three.js)', () => {
    const corps = glb.json.nodes.find((n) => n.name === 'TSHIRT_BODY')!;
    const primitive = glb.json.meshes[corps.mesh!];
    const materiaux = primitive.primitives.map((p) => glb.json.materials[p.material!].name).sort();
    expect(materiaux).toEqual(['FABRIC', 'FABRIC_RIB']);
  });

  it('les surfaces d’impression exposent UV0 (zone) et UV1 (maille/occlusion)', () => {
    for (const side of SIDES) {
      const nœud = description.nodes.find((n) => n.name === product.zones![side]!.mesh)!;
      expect(nœud, `nœud manquant pour ${side}`).toBeTruthy();
      expect(nœud.primitives[0].attributes).toEqual(expect.arrayContaining(['POSITION', 'NORMAL', 'TEXCOORD_0', 'TEXCOORD_1']));
    }
  });

  it('utilise les mètres, sans Draco, animation ni caméra', () => {
    expect(description.rootExtras?.units).toBe('meters');
    expect(description.rootExtras?.fabric_materials).toEqual(['FABRIC', 'FABRIC_RIB']);
    expect(description.rootExtras?.elembo_version).toBe(1);
    expect(glb.json.extensionsRequired ?? []).not.toContain('KHR_draco_mesh_compression');
    expect(glb.json.animations ?? []).toHaveLength(0);
    expect(glb.json.cameras ?? []).toHaveLength(0);
  });

  it('reste sous 3 Mo pour un chargement web raisonnable', () => {
    const taille = readFileSync(chemin).length;
    expect(taille).toBeLessThan(3 * 1024 * 1024);
    expect(glb.json.buffers[0].byteLength).toBeGreaterThan(1_000_000);
  });

  it('porte les mêmes couleurs que le catalogue', () => {
    const couleurs = description.rootExtras?.colors ?? {};
    expect(Object.values(couleurs)).toHaveLength(8);
    for (const couleur of product.colors) {
      expect(Object.values(couleurs).map((c) => c.toUpperCase())).toContain(couleur.hex.toUpperCase());
    }
  });
});

describe('modèle 3D Elembo : conformité avec le catalogue', () => {
  it('les noms de maillages du catalogue existent tous dans le fichier', () => {
    for (const side of SIDES) {
      const zone = product.zones![side]!;
      expect(description.nodes.some((n) => n.name === zone.mesh)).toBe(true);
      expect(zone.mesh).toMatch(/^TSHIRT_[A-Z_]+_PRINT$/);
    }
  });

  it('les dimensions de texture sont identiques à celles du GLB', () => {
    for (const side of SIDES) {
      const zone = product.zones![side]!;
      const mesure = description.zones[cleGlb(side)];
      expect(mesure, `extras absents pour ${side}`).toBeTruthy();
      expect(mesure.textureCm).toEqual({ w: zone.textureCm.w, h: zone.textureCm.h });
      expect(mesure.node).toBe(zone.mesh);
    }
  });

  it('les repères mesurés (creux du col, tête de manche) correspondent au catalogue', () => {
    // Valeurs en cm depuis le haut de la texture, sur l'axe médian.
    expect(description.zones.front.axisTopCm).toBeCloseTo(ELEMBO_TSHIRT_ZONES.front!.reperesCm.col!, 1);
    expect(description.zones.back.axisTopCm).toBeCloseTo(ELEMBO_TSHIRT_ZONES.back!.reperesCm.col!, 1);
    for (const side of ['left-sleeve', 'right-sleeve'] as const) {
      expect(description.zones[cleGlb(side)].axisTopCm).toBeCloseTo(ELEMBO_TSHIRT_ZONES[side]!.reperesCm.epaule!, 1);
    }
  });

  it('les UV des zones couvrent bien la texture (marges de pièce comprises)', () => {
    for (const side of SIDES) {
      const mesure = description.zones[cleGlb(side)];
      // Le patron occupe une sous-boîte : les UV ne vont pas nécessairement jusqu'à 0/1,
      // mais la zone d'impression du catalogue doit rester à l'intérieur.
      expect(mesure.uvBox.umin).toBeGreaterThanOrEqual(-0.01);
      expect(mesure.uvBox.umax).toBeLessThanOrEqual(1.01);
      expect(mesure.uvBox.vmin).toBeGreaterThanOrEqual(-0.01);
      expect(mesure.uvBox.vmax).toBeLessThanOrEqual(1.01);
    }
  });

  it('chaque zone a son matériau d’impression dédié (aucune texture partagée)', () => {
    const materiaux = SIDES.map((side) => description.zones[cleGlb(side)].material);
    expect(new Set(materiaux).size).toBe(5);
    expect(materiaux.every((m) => m.startsWith('PRINT_'))).toBe(true);
  });

  it('les libellés de zones couvrent les cinq parties du vêtement', () => {
    expect(SIDES.map((side) => SIDE_LABELS[side])).toEqual([
      'Face avant',
      'Face arrière',
      'Manche gauche',
      'Manche droite',
      'Intérieur du col',
    ]);
  });
});

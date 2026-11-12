// Scène du modèle Elembo à ZONES d'impression (technique 'zones').
//
// Le GLB expose cinq surfaces d'impression indépendantes — une par zone — chacune avec son
// maillage, son matériau et ses UV propres (TEXCOORD_0, isotropes). La couleur du vêtement
// est portée par les matériaux du tissu (`FABRIC`, `FABRIC_RIB`) ; les surfaces d'impression
// reçoivent une texture TRANSPARENTE composée par le Canvas 2D. Changer une zone ne touche
// donc jamais les autres, et changer la couleur ne touche jamais les visuels.
//
// Ce module ne fait que préparer la scène (clones de matériaux, repérage des surfaces) :
// la composition des textures reste dans src/lib/three/textures.ts, pilotée par React.

import * as THREE from 'three';
import type { Product } from '../products/catalog';
import type { Side } from '../../types/configurator';
import { SIDES } from '../../types/configurator';

export type ZoneScene = {
  root: THREE.Object3D;
  /** Matériaux du tissu : seuls eux portent la couleur du vêtement. */
  fabric: THREE.MeshStandardMaterial[];
  /** Matériau d'impression de chaque zone (texture transparente). */
  prints: Partial<Record<Side, THREE.MeshStandardMaterial>>;
  /** Maillage d'impression de chaque zone (diagnostic et tests). */
  meshes: Partial<Record<Side, THREE.Mesh>>;
};

/** Copie profonde de la scène ET de ses matériaux (cache GLTFLoader partagé). */
export function cloneSceneWithMaterials(scene: THREE.Object3D): THREE.Object3D {
  const root = scene.clone(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
  });
  return root;
}

/** Tous les matériaux d'un maillage, sous forme de tableau. */
export function materialsOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
}

/**
 * Prépare la scène du modèle à zones.
 *
 * @throws si une surface d'impression déclarée au catalogue est absente du GLB : mieux vaut
 *         une erreur explicite qu'une zone qui ne s'affiche jamais (et un visuel perdu).
 */
export function prepareZonesScene(scene: THREE.Object3D, product: Product): ZoneScene {
  const root = cloneSceneWithMaterials(scene);
  const fabric: THREE.MeshStandardMaterial[] = [];
  const prints: Partial<Record<Side, THREE.MeshStandardMaterial>> = {};
  const meshes: Partial<Record<Side, THREE.Mesh>> = {};
  const nomsTissu = new Set(product.fabricMaterials ?? []);

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const material of materialsOf(mesh)) {
      if (nomsTissu.has(material.name)) fabric.push(material);
    }
  });

  for (const side of SIDES) {
    const zone = product.zones?.[side];
    if (!zone) continue;
    const mesh = root.getObjectByName(zone.mesh) as THREE.Mesh | undefined;
    if (!mesh || !(mesh as THREE.Mesh).isMesh) continue;
    const material = materialsOf(mesh as THREE.Mesh)[0];
    if (!material) continue;
    preparerMateriauImpression(material, product.impressionBrillante === true);
    // Les surfaces d'impression sont des copies de la surface du tissu, décalées de 0,4 mm.
    // Les faire projeter une ombre produirait de l'acné d'ombre sur le tissu : elles
    // n'ombrent pas, elles ne reçoivent pas non plus (leur occlusion vient de l'UV 1).
    (mesh as THREE.Mesh).castShadow = false;
    (mesh as THREE.Mesh).receiveShadow = false;
    prints[side] = material;
    meshes[side] = mesh as THREE.Mesh;
  }

  if (!fabric.length) {
    throw new Error(
      `Aucun matériau de tissu trouvé (attendu : ${(product.fabricMaterials ?? []).join(', ') || 'non déclaré'})`,
    );
  }
  return { root, fabric, prints, meshes };
}

/**
 * Réglages de la matière d'impression : transparence, face avant seulement ; encre mate sur
 * textile, finition d'origine (émail brillant, vernis) quand l'impression est brillante.
 *
 * Le GLB est déjà en `alphaMode: BLEND` ; on force malgré tout les propriétés utiles et on
 * N'ÉCRASE PAS les textures de relief (normalMap / aoMap sur TEXCOORD_1) : l'encre suit
 * ainsi les plis du tissu.
 */
function preparerMateriauImpression(material: THREE.MeshStandardMaterial, brillante = false): void {
  material.color.set('#FFFFFF'); // la couleur du vêtement ne doit jamais teinter l'encre
  material.transparent = true;
  material.alphaTest = 0;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  // Textile : encre mate. Mug : la sublimation est sous l'émail, on garde le brillant du GLB.
  if (!brillante) material.roughness = Math.min(1, Math.max(0.7, material.roughness ?? 0.82));
  material.metalness = 0;
  // Les surfaces d'impression sont à 0,4 mm du tissu : sans décalage de profondeur, elles
  // scintillent selon l'angle de vue.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.needsUpdate = true;
}

/** Applique la couleur du vêtement aux SEULS matériaux du tissu. */
export function applyFabricColor(scene: ZoneScene, hex: string): void {
  for (const material of scene.fabric) material.color.set(hex);
}

/** Convertit un hex en nom lisible si le catalogue le connaît (diagnostic). */
export function colorName(product: Product, hex: string): string {
  return product.colors.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex;
}

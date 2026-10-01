// Accès aux nœuds du modèle 3D.
//
// Convention (documentée aussi dans public/models/README.md) : un modèle Elembo
// expose trois nœuds — « FrontPanel », « BackPanel » (qui reçoivent la texture du
// visuel) et « Body » (couleur unie). On cherche d'abord par NOM de nœud, puis en
// repli par nom de matériau, pour rester tolérant avec des modèles fournisseurs.

import * as THREE from 'three';
import type { Side } from '../../types/configurator';

export const PANEL_NODE: Record<Side | 'body', string> = {
  front: 'FrontPanel',
  back: 'BackPanel',
  body: 'Body',
};

export const PANEL_MATERIAL: Record<Side | 'body', string> = {
  front: 'elembo-front',
  back: 'elembo-back',
  body: 'elembo-body',
};

const FALLBACK_NAMES: Record<Side | 'body', RegExp> = {
  front: /front|avant/i,
  back: /back|arri/i,
  body: /body|sleeve|manche|torso/i,
};

/** Trouve le mesh d'un panneau : par nom de nœud, puis par nom de matériau, puis par motif. */
export function findPanelMesh(scene: THREE.Object3D, panel: Side | 'body'): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;

  scene.traverse((child) => {
    if (found || !(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    if (mesh.name === PANEL_NODE[panel]) {
      found = mesh;
      return;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((m) => m?.name === PANEL_MATERIAL[panel])) {
      found = mesh;
      return;
    }
    if (FALLBACK_NAMES[panel].test(mesh.name) || materials.some((m) => FALLBACK_NAMES[panel].test(m?.name ?? ''))) {
      found = mesh;
    }
  });

  return found;
}

/** Résumé lisible de la scène — sert aux diagnostics et aux tests d'intégration. */
export function describeModel(scene: THREE.Object3D): {
  nodes: string[];
  meshes: { name: string; material: string; hasMap: boolean }[];
} {
  const nodes: string[] = [];
  const meshes: { name: string; material: string; hasMap: boolean }[] = [];
  scene.traverse((child) => {
    if (!child.name) return;
    nodes.push(child.name);
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      meshes.push({
        name: mesh.name,
        material: material?.name ?? '(sans nom)',
        hasMap: Boolean((material as THREE.MeshStandardMaterial)?.map),
      });
    }
  });
  return { nodes, meshes };
}

/**
 * Prépare une copie de la scène pour un usage interactif : la scène issue du cache
 * GLTFLoader est partagée entre toutes les instances, donc on la clone avant de
 * toucher aux matériaux.
 */
export function cloneModelScene(scene: THREE.Object3D): THREE.Object3D {
  return scene.clone(true);
}

/**
 * Maillage principal du vêtement : celui qui porte le plus de triangles. Utilisé pour la
 * technique 'decal', où le modèle fournisseur est un maillage unique sans panneaux nommés.
 */
export function findGarmentMesh(scene: THREE.Object3D): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  let bestCount = 0;
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = mesh;
    }
  });
  return best;
}

/**
 * Tous les maillages du vêtement.
 *
 * Un modèle fournisseur peut en compter une dizaine (corps avant/arrière, manches,
 * col…) : la couleur doit être appliquée à CHACUN, sinon seul un morceau du vêtement
 * change de teinte.
 */
export function findGarmentMeshes(scene: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return meshes;
}

/**
 * Détecte une surface plate : quelques triangles formant un plan (sol, fond, ombre
 * portée livrés avec un modèle fournisseur, ou au contraire un panneau de vêtement).
 */
export function isFlatMesh(mesh: THREE.Mesh): boolean {
  const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
  const position = geometry?.attributes?.position as THREE.BufferAttribute | undefined;
  if (!position) return false;
  const triangles = ((geometry?.index?.count ?? position.count) || 0) / 3;
  if (triangles > 12) return false;
  const box = new THREE.Box3().setFromBufferAttribute(position);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest <= 0) return true;
  return Math.min(size.x, size.y, size.z) <= longest * 0.02;
}

/**
 * Boîte englobante du vêtement seul, pour le cadrage de la caméra.
 *
 * Un modèle fournisseur embarque souvent un sol ou un fond : le cadrer avec le vêtement
 * fait reculer la caméra et le produit paraît minuscule. On écarte donc les surfaces
 * plates **nettement plus grandes** que le reste — un vêtement entièrement fait de
 * panneaux plats (placeholder, produit plat) est conservé, sans quoi il n'y aurait plus
 * rien à cadrer. Renvoie `null` si la scène ne contient aucun maillage.
 */
export function garmentBox(scene: THREE.Object3D): THREE.Box3 | null {
  const entries: { box: THREE.Box3; flat: boolean; diagonal: number }[] = [];
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    entries.push({ box, flat: isFlatMesh(mesh), diagonal: box.getSize(new THREE.Vector3()).length() });
  });
  if (!entries.length) return null;

  const solides = entries.filter((e) => !e.flat);
  const reference = Math.max(...(solides.length ? solides : entries).map((e) => e.diagonal));
  // Un sol ou un fond fait facilement deux fois la taille du vêtement (mesuré : 2,6× sur
  // un modèle fournisseur) ; un panneau de vêtement, lui, ne dépasse pas le corps.
  const gardes = entries.filter((e) => !e.flat || e.diagonal <= reference * 2);

  const box = gardes[0].box.clone();
  for (const e of gardes.slice(1)) box.union(e.box);
  return box;
}

/**
 * Maillage sur lequel projeter le visuel : celui qui possède, au plus près du centre de
 * la zone d'impression, des sommets orientés dans la bonne direction.
 *
 * Indispensable pour les modèles à plusieurs maillages : projeter sur « le plus gros »
 * poserait le visuel sur le panneau arrière ou dans le vide.
 *
 * @param direction +1 pour la face avant, −1 pour l'arrière.
 */
export function findMeshForDecal(
  scene: THREE.Object3D,
  center: [number, number, number],
  direction: number,
): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  let bestDistance = Infinity;

  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    const normal = mesh.geometry.attributes.normal as THREE.BufferAttribute | undefined;
    if (!position) return;

    const step = Math.max(1, Math.floor(position.count / 4000));
    for (let i = 0; i < position.count; i += step) {
      if (normal && normal.getZ(i) * direction < 0.7) continue;
      const dx = position.getX(i) - center[0];
      const dy = position.getY(i) - center[1];
      const dz = position.getZ(i) - center[2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = mesh;
      }
    }
  });

  return best;
}

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

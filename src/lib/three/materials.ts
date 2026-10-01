// Matériaux des panneaux.
//
// Contrainte forte (§8) : changer la couleur ne doit PAS détruire les propriétés du
// matériau. On clone donc le matériau d'origine (pour ne pas muter l'objet partagé
// par le cache GLTFLoader) et on ne touche qu'à `color` / `map` ; roughness,
// metalness, normalMap, aoMap et les textures PBR restent en place, ce qui permettra
// de brancher un vrai modèle réaliste sans changer une ligne ici.

import * as THREE from 'three';
import type { PrintArea } from '../products/catalog';
import { printAreaRect } from '../canvas/design-canvas';

export type PanelMaterials = {
  front: THREE.MeshStandardMaterial | null;
  back: THREE.MeshStandardMaterial | null;
  body: THREE.MeshStandardMaterial | null;
};

/** Extrait le premier matériau d'un mesh (les GLB en exposent un par primitive). */
export function firstMaterial(mesh: THREE.Mesh | null): THREE.MeshStandardMaterial | null {
  if (!mesh) return null;
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (m as THREE.MeshStandardMaterial) ?? null;
}

/**
 * Clone un matériau pour un panneau donné en conservant toutes ses propriétés.
 * `map` n'est posée que si une texture est fournie.
 *
 * ⚠️ La texture d'un panneau porte DÉJÀ la couleur du vêtement (le Canvas 2D la
 * compose) : on passe donc '#FFFFFF' comme `hex` pour un panneau texturé, sinon
 * les deux se multiplieraient et un T-shirt noir rendrait le visuel noir. Les
 * propriétés PBR (roughness, metalness, normalMap, aoMap) ne sont jamais touchées.
 */
export function preparePanelMaterial(
  source: THREE.MeshStandardMaterial | null,
  hex: string,
  map: THREE.Texture | null,
): THREE.MeshStandardMaterial {
  const material = source
    ? (source.clone() as THREE.MeshStandardMaterial)
    : new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });

  material.name = source?.name ?? 'elembo-panel';
  material.color = new THREE.Color(hex);
  if (map) {
    material.map = map;
    // La composition inclut toujours le fond couleur du vêtement : la texture est
    // opaque, donc pas de transparence ni de tri à gérer côté WebGL.
    material.transparent = false;
    material.alphaTest = 0;
  } else {
    material.map = null;
    material.transparent = false;
    material.alphaTest = 0;
  }
  material.side = THREE.FrontSide;
  material.needsUpdate = true;
  return material;
}

/** Applique une couleur sans toucher au reste du matériau. */
export function applyColor(material: THREE.MeshStandardMaterial | null, hex: string): void {
  if (!material) return;
  material.color.set(hex);
}

/**
 * Applique la couleur du vêtement : elle va sur le corps (matériau sans texture) et
 * dans l'albédo des panneaux texturés, où elle est composée avec le visuel.
 */
export function applyGarmentColor(panels: PanelMaterials, hex: string): void {
  applyColor(panels.body, hex);
  applyColor(panels.front, '#FFFFFF');
  applyColor(panels.back, '#FFFFFF');
}

/**
 * Clone le matériau d'un vêtement fournisseur en conservant ses textures PBR
 * (normalMap, roughnessMap, aoMap) — la couleur du vêtement devient celle choisie par
 * l'utilisateur, appliquée au matériau.
 *
 * `map` :
 *  - une texture → albédo NEUTRALISÉ (voir neutralAlbedoTexture), pour retirer la couleur
 *    de l'auteur sans perdre le grain du tissu ;
 *  - `null` → on RETIRE l'albédo du fournisseur : la couleur choisie est alors exacte et
 *    un imprimé intégré par l'auteur du modèle disparaît (option `flatAlbedo`) ;
 *  - `undefined` → on garde l'albédo d'origine.
 */
export function prepareGarmentMaterial(
  source: THREE.MeshStandardMaterial | null,
  hex: string,
  map?: THREE.Texture | null,
  garderTexturesPbr = true,
): THREE.MeshStandardMaterial {
  const material = source
    ? (source.clone() as THREE.MeshStandardMaterial)
    : new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  if (map === null) material.map = null;
  else if (map) material.map = map;
  if (!garderTexturesPbr) {
    // Surface VIERGE : on retire aussi les textures du fournisseur. Un imprimé d'auteur
    // n'est pas seulement dans l'albédo — la gravure est aussi dans la texture de
    // normales (et souvent dans la rugosité), donc le motif resterait visible en relief.
    material.normalMap = null;
    material.roughnessMap = null;
    material.metalnessMap = null;
    material.aoMap = null;
    material.roughness = 0.72;
    material.metalness = 0;
  }
  material.color = new THREE.Color(hex);
  material.needsUpdate = true;
  return material;
}

/** Teinte le vêtement (technique 'decal') sans toucher à ses textures. */
export function applyColorToGarment(material: THREE.MeshStandardMaterial | null, hex: string): void {
  applyColor(material, hex);
}

/**
 * Rectangle de la zone d'impression en unités de texture (0..1), utile pour
 * positionner un décalque ou un guide côté Three.js si besoin plus tard.
 */
export function printAreaUv(area: PrintArea): { x: number; y: number; w: number; h: number } {
  const r = printAreaRect(area, 1);
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

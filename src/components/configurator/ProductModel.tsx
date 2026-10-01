'use client';

// ProductModel : charge le GLB et applique le visuel de deux façons selon la technique
// déclarée par le produit (voir src/lib/products/catalog.ts) :
//
//  'uv'    — le modèle expose des panneaux dédiés ; le visuel est composé dans la texture
//            du panneau (Canvas 2D) et affiché comme albédo du panneau.
//  'decal' — le modèle fournisseur est un maillage unique : le vêtement garde ses
//            matériaux PBR (baseColor/normal/ORM) et le visuel est PROJETÉ sur la surface
//            (décalque). La couleur du vêtement teinte l'albédo existant, donc le visuel
//            imprimé n'est jamais assombri.
//
// Dans les deux cas, Three.js ne compose rien : le Canvas 2D compose, Three.js affiche.

import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { decalFrame, getPrintArea, getProductById, resolveModelUrl } from '../../lib/products/catalog';
import { cloneModelScene, findGarmentMeshes, findMeshForDecal, findPanelMesh, garmentBox } from '../../lib/three/models';
import {
  applyColorToGarment,
  applyGarmentColor,
  firstMaterial,
  prepareGarmentMaterial,
  preparePanelMaterial,
} from '../../lib/three/materials';
import type { PanelMaterials } from '../../lib/three/materials';
import { getPanelEntry, neutralAlbedoTexture, panelKey, updatePanelTexture } from '../../lib/three/textures';
import { PREVIEW_TEXTURE_SIZE, compositionSize, elementsOfSide } from '../../lib/canvas/design-canvas';
import type { Box } from '../../lib/three/framing';
import { useElementImages } from './useElementImages';

const OTHER = { front: 'back', back: 'front' } as const;

/**
 * Les panneaux texturés (technique 'uv') sont blancs : leur couleur de vêtement est
 * composée dans la texture par le Canvas 2D, sinon couleur × texture assombrirait le
 * visuel imprimé. La technique 'decal', elle, teinte l'albédo du vêtement.
 */
const WHITE = '#FFFFFF';

type DebugWindow = Window & {
  __elembo3d?: {
    panels?: () => { cible: string; material: string; color: string; hasMap: boolean; hasNormalMap: boolean }[];
    textureStats?: () => { side: string; width?: number; height?: number; opaqueSamples: number; orangeSamples: number }[];
    print?: () => {
      technique: string;
      side: string;
      canvas: { width: number; height: number; orangeSamples: number } | null;
      decal: { position: number[]; scale: number[]; hasMap: boolean } | null;
    };
  };
};

export default function ProductModel({ onBounds }: { onBounds?: (box: Box) => void }) {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const side = useConfiguratorStore((s) => s.side);
  const elements = useConfiguratorStore((s) => s.elements);
  const measure = useConfiguratorStore((s) => s.measure);

  const product = getProductById(productId)!;
  const images = useElementImages(elements);
  const { scene } = useGLTF(resolveModelUrl(product));

  const area = getPrintArea(product, side);
  const isDecal = product.technique === 'decal';

  // Copie de la scène + préparation des matériaux : une seule fois par scène chargée.
  const { root, panels, garmentMeshes } = useMemo(() => {
    const cloned = cloneModelScene(scene);

    if (product.technique === 'uv') {
      const frontMesh = findPanelMesh(cloned, 'front');
      const backMesh = findPanelMesh(cloned, 'back');
      const bodyMesh = findPanelMesh(cloned, 'body');

      const prepared: PanelMaterials = {
        front: preparePanelMaterial(
          firstMaterial(frontMesh),
          WHITE,
          getPanelEntry(panelKey('front'), PREVIEW_TEXTURE_SIZE).texture,
        ),
        back: preparePanelMaterial(
          firstMaterial(backMesh),
          WHITE,
          getPanelEntry(panelKey('back'), PREVIEW_TEXTURE_SIZE).texture,
        ),
        body: preparePanelMaterial(firstMaterial(bodyMesh), '#FFFFFF', null),
      };

      if (frontMesh) frontMesh.material = prepared.front!;
      if (backMesh) backMesh.material = prepared.back!;
      if (bodyMesh) bodyMesh.material = prepared.body!;

      return { root: cloned, panels: prepared, garmentMeshes: [] as THREE.Mesh[] };
    }

    // Technique 'decal' : on garde les textures PBR du fournisseur (normal, rugosité,
    // occlusion) mais son albédo est NEUTRALISÉ — sinon la couleur de l'auteur (souvent
    // une teinte déjà colorée) rendrait tous les choix de couleur faux.
    //
    // IMPORTANT : un modèle fournisseur compte souvent PLUSIEURS maillages (corps
    // avant/arrière, manches, col). La couleur doit être appliquée à tous, sinon seule
    // une partie du vêtement change de teinte.
    const meshes = findGarmentMeshes(cloned);
    for (const m of meshes) {
      const isArray = Array.isArray(m.material);
      const sources = isArray ? (m.material as THREE.MeshStandardMaterial[]) : [m.material as THREE.MeshStandardMaterial];
      const tinted = sources.map((src) => {
        const image = src?.map?.image as CanvasImageSource | undefined;
        // `surface` : certains modèles fournisseurs portent un imprimé d'auteur, dans
        // l'albédo ET dans la texture de normales. Voir Product.surface.
        const surface = product.surface ?? 'vendor';
        const albedo =
          surface === 'vendor' ? (image ? neutralAlbedoTexture(image) : undefined) : null;
        return prepareGarmentMaterial(src, '#FFFFFF', albedo, surface !== 'blank');
      });
      m.material = isArray ? tinted : tinted[0];
    }
    return {
      root: cloned,
      panels: { front: null, back: null, body: null } as PanelMaterials,
      garmentMeshes: meshes,
    };
  }, [scene, product.technique, product.surface]);

  // Boîte englobante réelle du modèle : le viewer en déduit le cadrage (un modèle
  // fournisseur arrive dans ses propres unités, avec son propre décalage d'origine).
  useEffect(() => {
    if (!onBounds) return;
    root.updateWorldMatrix(true, true);
    const box = garmentBox(root) ?? new THREE.Box3().setFromObject(root);
    onBounds({
      min: box.min.toArray() as [number, number, number],
      max: box.max.toArray() as [number, number, number],
    });
  }, [root, onBounds]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Mutations impératives de three.js.
  //
  // `react-hooks/immutability` (règle issue du compilateur React) interdit de modifier
  // après le rendu une valeur calculée pendant le rendu. C'est exactement ce qu'impose
  // three.js : matériaux et textures sont des objets impératifs mis à jour hors React
  // (couleur, map, needsUpdate). La règle est donc désactivée ici, et seulement ici.
  // ─────────────────────────────────────────────────────────────────────────────
  /* eslint-disable react-hooks/immutability */

  // Couleur du vêtement : appliquée à TOUS les maillages du modèle.
  useEffect(() => {
    if (isDecal) {
      for (const mesh of garmentMeshes) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) applyColorToGarment(m as THREE.MeshStandardMaterial, color);
      }
      return;
    }
    applyGarmentColor(panels, color);
  }, [isDecal, garmentMeshes, panels, color]);

  // Composition Canvas 2D → texture affichée.
  useEffect(() => {
    // Seuls les éléments de la face courante entrent dans la texture : jamais de mélange
    // avant/arrière, ni dans l'aperçu ni dans la projection.
    const dessines = elementsOfSide(elements, side).map((element) => ({
      element,
      image: images.get(element.id) ?? null,
    }));

    if (isDecal) {
      // Un seul calque : la texture du décalque, transparente hors des éléments. Le
      // vêtement n'est pas touché (ni matériau ni texture).
      const space = area ? compositionSize(area) : null;
      if (area && space) {
        updatePanelTexture(panelKey(side), {
          size: space.width,
          height: space.height,
          area,
          elements: dessines,
          baseColor: null,
          showGuides: false,
          measure,
        });
      }
      return;
    }

    // Technique 'uv' : les deux panneaux reçoivent le fond couleur du vêtement, les
    // éléments ne sont composés que sur la face active.
    const inactive = OTHER[side];
    const inactiveArea = getPrintArea(product, inactive);

    if (area) {
      updatePanelTexture(panelKey(side), {
        size: PREVIEW_TEXTURE_SIZE,
        area,
        elements: dessines,
        baseColor: color,
        showGuides: false,
        measure,
      });
      panels[side]!.needsUpdate = true;
    }

    if (inactiveArea) {
      updatePanelTexture(panelKey(inactive), {
        size: PREVIEW_TEXTURE_SIZE,
        area: inactiveArea,
        elements: [],
        baseColor: color,
        showGuides: false,
        measure,
      });
      panels[inactive]!.needsUpdate = true;
    }
  }, [isDecal, product, side, elements, images, measure, color, panels, area, garmentMeshes]);

  /* eslint-enable react-hooks/immutability */

  // Décalque : cadre déduit du catalogue (cm → unités du modèle) et texture composée.
  const frame = area ? decalFrame(area, product.unitToCm) : null;
  const decalTexture = isDecal && area ? getPanelEntry(panelKey(side), compositionSize(area)).texture : null;

  /**
   * Décalque : projection du visuel sur la surface réelle du vêtement (DecalGeometry).
   *
   * Le maillage cible est celui qui porte la surface au centre de la zone : sur un
   * modèle à plusieurs maillages, prendre « le plus gros » poserait le visuel sur le
   * panneau arrière ou dans le vide.
   *
   * ATTENTION : `DecalGeometry` projette les sommets via `mesh.matrixWorld`. Le cadre du
   * catalogue est exprimé dans le repère D'AUTHORING du modèle (celui que mesure
   * scripts/decal-frame.mjs), il faut donc le convertir en coordonnées monde — sinon un
   * modèle dont la racine porte une rotation (exports Sketchfab) projette dans le vide.
   * La géométrie produite est en coordonnées monde : le décalque se rend à la racine.
   */
  const decalMesh = useMemo(() => {
    if (!isDecal || !frame || !garmentMeshes.length || !decalTexture) return null;
    const target = findMeshForDecal(root, frame.center, frame.rotationY === 0 ? 1 : -1);
    if (!target) return null;

    target.updateWorldMatrix(true, false);
    const position = new THREE.Vector3(...frame.center).applyMatrix4(target.matrixWorld);
    const rotation = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0, frame.rotationY, 0))
      .premultiply(target.getWorldQuaternion(new THREE.Quaternion()));
    const scale = target
      .getWorldScale(new THREE.Vector3())
      .multiply(new THREE.Vector3(frame.width, frame.height, frame.depth));

    const geometry = new DecalGeometry(
      target,
      position,
      new THREE.Euler().setFromQuaternion(rotation),
      scale,
    );
    const material = new THREE.MeshStandardMaterial({
      map: decalTexture,
      transparent: true,
      roughness: 0.85,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      depthWrite: false,
    });
    return new THREE.Mesh(geometry, material);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDecal, root, garmentMeshes, decalTexture, side, area, frame?.width, frame?.height, frame?.depth]);

  // Le décalque n'est plus utilisé : on libère sa géométrie (le matériau est à nous).
  useEffect(() => {
    if (!decalMesh) return;
    return () => {
      decalMesh.geometry.dispose();
      (decalMesh.material as THREE.Material).dispose();
    };
  }, [decalMesh]);

  // Expose un résumé lisible en développement (diagnostic, tests E2E).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as DebugWindow;
    w.__elembo3d = w.__elembo3d ?? {};

    w.__elembo3d.panels = () => {
      const list: { cible: string; material: string; color: string; hasMap: boolean; hasNormalMap: boolean }[] = [];
      if (isDecal) {
        garmentMeshes.forEach((mesh, i) => {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((m) => {
            const mat = m as THREE.MeshStandardMaterial;
            list.push({
              cible: `${mesh.name || 'mesh'}#${i}`,
              material: mat?.name || '(sans nom)',
              color: `#${mat?.color?.getHexString() ?? '000000'}`,
              hasMap: Boolean(mat?.map),
              hasNormalMap: Boolean(mat?.normalMap),
            });
          });
        });
        return list;
      }
      for (const s of ['front', 'back', 'body'] as const) {
        const m = panels[s];
        if (!m) continue;
        list.push({
          cible: s,
          material: m.name || '(sans nom)',
          color: `#${m.color.getHexString()}`,
          hasMap: Boolean(m.map),
          hasNormalMap: Boolean(m.normalMap),
        });
      }
      return list;
    };

    // Preuve que le visuel est bien DANS la texture utilisée par la 3D : on échantillonne
    // le canvas de la texture (pixels opaques et pixels du visuel).
    const sample = (key: string, label: string) => {
      const space = isDecal ? (area ? compositionSize(area) : { width: PREVIEW_TEXTURE_SIZE, height: PREVIEW_TEXTURE_SIZE }) : PREVIEW_TEXTURE_SIZE;
      const canvas = getPanelEntry(key, space).canvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { side: label, opaqueSamples: 0, orangeSamples: 0 };
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      let orange = 0;
      for (let i = 0; i < data.length; i += 4 * 41) {
        if (data[i + 3] > 8) opaque++;
        if (data[i] > 150 && data[i + 1] > 40 && data[i + 1] < 190 && data[i + 2] < 140) orange++;
      }
      return { side: label, width: canvas.width, height: canvas.height, opaqueSamples: opaque, orangeSamples: orange };
    };

    w.__elembo3d.textureStats = () =>
      isDecal ? [sample(panelKey(side), side)] : [sample(panelKey('front'), 'front'), sample(panelKey('back'), 'back')];

    w.__elembo3d.print = () => {
      const stats = w.__elembo3d!.textureStats!().find((s) => s.side === side) ?? null;
      return {
        technique: product.technique,
        side,
        canvas: stats ? { width: stats.width ?? 0, height: stats.height ?? 0, orangeSamples: stats.orangeSamples } : null,
        decal:
          isDecal && frame
            ? { position: frame.center, scale: [frame.width, frame.height, frame.depth], hasMap: Boolean(decalTexture) }
            : null,
      };
    };
  }, [isDecal, panels, garmentMeshes, side, area, frame, decalTexture, product.technique]);

  return (
    <>
      <primitive object={root as THREE.Object3D} />
      {decalMesh && <primitive object={decalMesh} />}
    </>
  );
}

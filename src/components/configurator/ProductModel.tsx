'use client';

// ProductModel : charge le GLB, clone la scène (le cache GLTFLoader est partagé),
// prépare les matériaux des trois panneaux et pousse le visuel composé en Canvas 2D
// dans la texture du panneau actif. Three.js ne compose rien : il affiche.

import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type * as THREE from 'three';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById, resolveModelUrl } from '../../lib/products/catalog';
import { cloneModelScene, findPanelMesh } from '../../lib/three/models';
import { applyGarmentColor, firstMaterial, preparePanelMaterial } from '../../lib/three/materials';
import type { PanelMaterials } from '../../lib/three/materials';
import { getPanelEntry, panelKey, updatePanelTexture } from '../../lib/three/textures';
import { PREVIEW_TEXTURE_SIZE } from '../../lib/canvas/design-canvas';
import { useDesignImage } from './useDesignImage';

const OTHER = { front: 'back', back: 'front' } as const;

/**
 * Les panneaux texturés sont blancs : leur couleur de vêtement est composée dans la
 * texture par le Canvas 2D (sinon couleur × texture assombrirait le visuel imprimé).
 */
const WHITE = '#FFFFFF';

type DebugWindow = Window & {
  __elembo3d?: {
    panels?: () => { side: string; material: string; color: string; hasMap: boolean }[];
    textureStats?: () => { side: string; size?: number; opaqueSamples: number; orangeSamples: number }[];
  };
};

export default function ProductModel() {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const side = useConfiguratorStore((s) => s.side);
  const design = useConfiguratorStore((s) => s.design);
  const transform = useConfiguratorStore((s) => s.transform);

  const product = getProductById(productId)!;
  const image = useDesignImage(design);
  const { scene } = useGLTF(resolveModelUrl(product));

  // Copie de la scène + préparation des matériaux : une seule fois par scène chargée.
  const { root, panels } = useMemo(() => {
    const root = cloneModelScene(scene);
    const frontMesh = findPanelMesh(root, 'front');
    const backMesh = findPanelMesh(root, 'back');
    const bodyMesh = findPanelMesh(root, 'body');

    const prepared: PanelMaterials = {
      // Panneaux : la couleur du vêtement est dans la texture (voir applyGarmentColor).
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
      body: preparePanelMaterial(firstMaterial(bodyMesh), color, null),
    };

    if (frontMesh) frontMesh.material = prepared.front!;
    if (backMesh) backMesh.material = prepared.back!;
    if (bodyMesh) bodyMesh.material = prepared.body!;

    return { root, panels: prepared };
    // `color` n'est volontairement pas une dépendance : la couleur du corps est
    // appliquée par l'effet ci-dessous, sans reconstruire les matériaux.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Mutations impératives de three.js.
  //
  // `react-hooks/immutability` (règle issue du compilateur React) interdit de
  // modifier après le rendu une valeur calculée pendant le rendu. C'est exactement
  // ce qu'impose three.js : les matériaux et textures sont des objets impératifs
  // que l'on met à jour (couleur, map, needsUpdate) sans passer par React. On
  // désactive donc la règle sur ces deux effets, et uniquement sur eux.
  // ─────────────────────────────────────────────────────────────────────────────
  /* eslint-disable react-hooks/immutability */

  // Couleur du vêtement : corps en direct, panneaux via leur albédo composé.
  useEffect(() => {
    applyGarmentColor(panels, color);
  }, [panels, color]);

  // Texture des DEUX faces : fond couleur du vêtement, visuel sur la face active.
  useEffect(() => {
    const inactive = OTHER[side];
    const activeArea = getPrintArea(product, side);
    const inactiveArea = getPrintArea(product, inactive);
    const assetSize = design ? { w: design.width, h: design.height } : undefined;

    if (activeArea) {
      updatePanelTexture(panelKey(side), {
        size: PREVIEW_TEXTURE_SIZE,
        area: activeArea,
        transform,
        design: image,
        assetSize,
        baseColor: color,
        showGuides: false,
      });
      panels[side]!.needsUpdate = true;
    }

    if (inactiveArea) {
      updatePanelTexture(panelKey(inactive), {
        size: PREVIEW_TEXTURE_SIZE,
        area: inactiveArea,
        transform,
        design: null,
        baseColor: color,
        showGuides: false,
      });
      panels[inactive]!.needsUpdate = true;
    }
  }, [product, side, transform, image, design, color, panels]);

  /* eslint-enable react-hooks/immutability */

  // Expose un résumé lisible en développement (diagnostic, tests E2E).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as DebugWindow;
    w.__elembo3d = w.__elembo3d ?? {};
    w.__elembo3d.panels = () =>
      (['front', 'back', 'body'] as const).map((s) => ({
        side: s,
        material: panels[s]?.name ?? '(absent)',
        color: `#${panels[s]?.color.getHexString() ?? '000000'}`,
        hasMap: Boolean(panels[s]?.map),
      }));
    // Preuve que le visuel est bien DANS la texture utilisée par la 3D : on
    // échantillonne le canvas de la texture (pixels opaques et pixels du visuel).
    w.__elembo3d.textureStats = () =>
      (['front', 'back'] as const).map((s) => {
        const canvas = panels[s]?.map?.image as HTMLCanvasElement | undefined;
        if (!canvas || typeof canvas.getContext !== 'function') return { side: s, opaqueSamples: 0, orangeSamples: 0 };
        const ctx = canvas.getContext('2d');
        if (!ctx) return { side: s, opaqueSamples: 0, orangeSamples: 0 };
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        let orange = 0;
        for (let i = 0; i < data.length; i += 4 * 41) {
          if (data[i + 3] > 8) opaque++;
          if (data[i] > 150 && data[i + 1] > 40 && data[i + 1] < 190 && data[i + 2] < 140) orange++;
        }
        return { side: s, size: canvas.width, opaqueSamples: opaque, orangeSamples: orange };
      });
  }, [panels]);

  return <primitive object={root as THREE.Object3D} />;
}

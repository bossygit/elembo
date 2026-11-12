'use client';

// ProductModel (technique 'zones') — rendu du T-shirt Elembo à cinq surfaces d'impression.
//
// Principe :
//   • la scène du GLB est clonée UNE FOIS, matériaux compris (le cache de `useGLTF` est
//     partagé : muter la scène d'origine contaminerait les autres instances) ;
//   • la couleur du vêtement va sur les seuls matériaux `FABRIC` / `FABRIC_RIB` ;
//   • chaque zone possède son canvas et sa CanvasTexture transparente (UV 0..1, glTF) ;
//   • à chaque modification, on ne redessine QUE les zones dont le contenu a changé.
//
// C'est ce qui garantit les deux exigences de la mission : synchro immédiate 2D → 3D, et
// zones totalement indépendantes (aucune texture commune, aucun mélange de visuels).

import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById, resolveModelUrl } from '../../lib/products/catalog';
import { SIDES } from '../../types/configurator';
import type { Side } from '../../types/configurator';
import { compositionSize, elementsOfSide } from '../../lib/canvas/design-canvas';
import { garmentBox } from '../../lib/three/models';
import { applyFabricColor, prepareZonesScene } from '../../lib/three/zones';
import type { ZoneScene } from '../../lib/three/zones';
import { getZoneEntry, updateZoneTexture } from '../../lib/three/textures';
import type { Box } from '../../lib/three/framing';
import { useElementImages, useTextFonts } from './useElementImages';

/**
 * Largeur du canvas de composition d'une zone. La hauteur suit le ratio physique de la
 * texture (compositionSize) : le visuel n'est jamais étiré. Le col est plus petit à
 * l'impression (12 × 6,7 cm) : inutile de lui allouer 1024 px de large.
 */
export function zonePreviewWidth(side: Side): number {
  return side === 'collar' ? 512 : 1024;
}

/** Espace de composition d'une zone pour son aperçu 3D. */
export function zonePreviewSpace(area: NonNullable<ReturnType<typeof getPrintArea>>): {
  width: number;
  height: number;
} {
  return compositionSize(area, zonePreviewWidth(area.side));
}

type DebugWindow = Window & {
  __elembo3d?: Record<string, unknown> & {
    zones?: () => {
      side: Side;
      mesh: string;
      material: string;
      texture: { width: number; height: number };
      elements: number;
      fabricColor: string;
    }[];
  };
};

export default function ZonesProductModel({ onBounds }: { onBounds?: (box: Box) => void }) {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const elements = useConfiguratorStore((s) => s.elements);
  const measure = useConfiguratorStore((s) => s.measure);

  const product = getProductById(productId)!;
  const { scene } = useGLTF(resolveModelUrl(product));
  const gl = useThree((s) => s.gl);
  const images = useElementImages(elements);
  const fontsVersion = useTextFonts(elements);

  // Scène préparée une seule fois par modèle chargé.
  const zoneScene: ZoneScene = useMemo(() => prepareZonesScene(scene, product), [scene, product]);

  // Boîte englobante réelle → cadrage caméra (le modèle est en mètres, centré).
  useEffect(() => {
    if (!onBounds) return;
    zoneScene.root.updateWorldMatrix(true, true);
    const box = garmentBox(zoneScene.root) ?? new THREE.Box3().setFromObject(zoneScene.root);
    onBounds({
      min: box.min.toArray() as [number, number, number],
      max: box.max.toArray() as [number, number, number],
    });
  }, [zoneScene, onBounds]);

  /* eslint-disable react-hooks/immutability */
  // Textures initiales : une par zone, transparente, branchée sur le matériau du GLB.
  useEffect(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    for (const zone of SIDES) {
      const area = getPrintArea(product, zone, profileId);
      const material = zoneScene.prints[zone];
      if (!area || !material) continue;
      const entry = getZoneEntry(zone, zonePreviewSpace(area));
      entry.texture.anisotropy = anisotropy;
      if (material.map !== entry.texture) {
        material.map = entry.texture;
        material.needsUpdate = true;
      }
    }
  }, [zoneScene, product, profileId, gl]);

  // Couleur du vêtement : deux matériaux de tissu, jamais les surfaces d'impression.
  useEffect(() => {
    applyFabricColor(zoneScene, color);
  }, [zoneScene, color]);

  // Composition des textures : seules les zones dont le contenu change sont redessinées.
  const signatures = useRef<Partial<Record<Side, string>>>({});
  useEffect(() => {
    const dessinesParZone = new Map<Side, ReturnType<typeof elementsOfSide>>();
    for (const zone of SIDES) dessinesParZone.set(zone, elementsOfSide(elements, zone));

    for (const zone of SIDES) {
      const area = getPrintArea(product, zone, profileId);
      const material = zoneScene.prints[zone];
      if (!area || !material) continue;
      const space = zonePreviewSpace(area);
      const deLaZone = dessinesParZone.get(zone) ?? [];
      const chargement = deLaZone
        .filter((el) => el.type === 'image' && el.visible !== false)
        .map((el) => (images.has(el.id) ? '1' : '0'))
        .join('');
      const signature = [
        JSON.stringify(deLaZone),
        area.x,
        area.y,
        area.w,
        area.h,
        space.width,
        space.height,
        fontsVersion,
        chargement,
      ].join('|');
      if (signatures.current[zone] === signature) continue;
      signatures.current[zone] = signature;

      updateZoneTexture(zone, space, {
        area,
        elements: deLaZone.map((element) => ({
          element,
          image: images.get(element.id) ?? null,
        })),
        // Texture transparente : la couleur du vêtement est portée par le TISSU, jamais
        // peinte dans les visuels imprimés.
        baseColor: null,
        showGuides: false,
        measure,
      });
      const entry = getZoneEntry(zone, space);
      if (material.map !== entry.texture) {
        material.map = entry.texture;
        material.needsUpdate = true;
      }
    }
  }, [zoneScene, product, profileId, elements, images, measure, fontsVersion]);

  // Diagnostic lisible (tests E2E, développement).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as DebugWindow;
    w.__elembo3d = w.__elembo3d ?? {};
    w.__elembo3d.zones = () =>
      SIDES.flatMap((zone) => {
        const material = zoneScene.prints[zone];
        const mesh = zoneScene.meshes[zone];
        if (!material || !mesh) return [];
        const area = getPrintArea(product, zone, profileId);
        const entry = area ? getZoneEntry(zone, zonePreviewSpace(area)) : null;
        return [
          {
            side: zone,
            mesh: mesh.name,
            material: material.name,
            texture: { width: entry?.canvas.width ?? 0, height: entry?.canvas.height ?? 0 },
            elements: elementsOfSide(elements, zone).filter((el) => el.visible !== false).length,
            fabricColor: `#${zoneScene.fabric[0]?.color.getHexString() ?? '000000'}`,
          },
        ];
      });
    // Preuve que le visuel composé est bien DANS la texture de la zone (et pas seulement
    // dans l'interface) : on échantillonne les pixels du canvas réel de la texture.
    w.__elembo3d.zoneStats = () =>
      SIDES.flatMap((zone) => {
        const area = getPrintArea(product, zone, profileId);
        if (!area) return [];
        const entry = getZoneEntry(zone, zonePreviewSpace(area));
        const data = entry.ctx.getImageData(0, 0, entry.canvas.width, entry.canvas.height).data;
        let alphaPixels = 0;
        const couleurs = new Set<string>();
        for (let i = 0; i < data.length; i += 4 * 97) {
          if (data[i + 3] > 8) {
            alphaPixels++;
            couleurs.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
          }
        }
        return [
          {
            side: zone,
            width: entry.canvas.width,
            height: entry.canvas.height,
            alphaPixels,
            couleurs: [...couleurs].slice(0, 8),
          },
        ];
      });
    return () => {
      const debug = (window as DebugWindow).__elembo3d;
      if (debug) {
        delete debug.zones;
        delete debug.zoneStats;
      }
    };
  }, [zoneScene, elements, product, profileId]);

  /* eslint-enable react-hooks/immutability */

  return <primitive object={zoneScene.root} />;
}

'use client';

// ProductViewer : scène Three.js — Canvas, caméra, éclairage studio, modèle, contrôles
// orbitaux, ombres douces, gestion du redimensionnement, chargement paresseux du GLB.
//
// Le rendu est strictement client : ce composant est importé en `ssr: false` par le
// configurateur, donc jamais évalué côté serveur (aucun accès à window/WebGL pendant
// le rendu serveur).
//
// Éclairage : un environnement de studio généré localement (RoomEnvironment, sans fichier
// HDR ni requête réseau) + des lumières douces + des ombres de contact. Le tone mapping
// est NEUTRAL — ACES désaturerait l'orange Elembo et les visuels vifs (integration-guide §8).
//
// Cadrage : la caméra s'adapte au modèle réel (unités et origine du fournisseur), voir
// src/lib/three/framing.ts. Chaque zone d'impression expose une VUE (azimut, inclinaison,
// distance, hauteur visée) : sélectionner une zone présente automatiquement la bonne
// partie du vêtement, en douceur.

import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, useProgress } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { describeModel } from '../../lib/three/models';
import { framingFor } from '../../lib/three/framing';
import type { Box, Framing } from '../../lib/three/framing';
import { getProductById } from '../../lib/products/catalog';
import type { ZoneModel } from '../../lib/products/catalog';
import type { Side } from '../../types/configurator';
import ProductModel from './ProductModel';

/** Vue de zone par défaut (produits sans zones) : face ou dos, cadrage complet. */
const VUE_PAR_DEFAUT: NonNullable<ZoneModel['vue']> = { azimut: 0, polaire: 90, distance: 1 };

const deg = (valeur: number) => (valeur * Math.PI) / 180;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Cadre la caméra sur le modèle, puis présente la ZONE sélectionnée — et seulement sur
 * demande (changement de zone ou vue initiale). L'utilisateur garde ensuite la main.
 *
 * L'orientation passe par l'ANGLE AZIMUTAL d'OrbitControls, jamais par la position brute :
 * déplacer `camera.position` en ligne droite passe par le centre du modèle (distance nulle)
 * et OrbitControls recompose ensuite sa position depuis ses coordonnées sphériques.
 */
function CameraRig({
  side,
  nonce,
  framing,
  controls,
  vue,
}: {
  side: Side;
  nonce: number;
  framing: Framing | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
  vue: ZoneModel['vue'] | null;
}) {
  const camera = useThree((s) => s.camera);
  const goal = useRef<{
    azimut: number;
    polaire: number;
    distance: number;
    cible: THREE.Vector3;
  }>({ azimut: 0, polaire: Math.PI / 2, distance: 3, cible: new THREE.Vector3() });
  const animating = useRef(false);
  const applied = useRef<Framing | null>(null);
  const lastNonce = useRef(nonce);

  // La caméra, les contrôles et leurs distances sont des objets three.js IMPÉRATIFS :
  // on les configure hors de React (comme les matériaux dans ProductModel). La règle
  // `react-hooks/immutability` du compilateur React interdit ces écritures, d'où sa
  // désactivation ici — et uniquement sur ce composant.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    const c = controls.current;
    if (!c || !framing) return;

    const [cx, cy, cz] = framing.center;
    const nouveauModele = applied.current !== framing;
    if (nouveauModele) {
      applied.current = framing;
      c.minDistance = Math.max(0.15, framing.minDistance * 0.4);
      c.maxDistance = framing.maxDistance;
      camera.near = Math.max(0.005, framing.distance / 400);
      camera.far = framing.distance * 10;
      camera.updateProjectionMatrix();
      c.target.set(cx, cy, cz);
      c.object.position.set(cx, cy + framing.height * 0.06, cz + framing.distance);
      c.update();
    }

    const vueZone = vue ?? VUE_PAR_DEFAUT;
    const cible = new THREE.Vector3(cx, cy + (vueZone.cibleY ?? 0) * framing.height, cz);
    goal.current = {
      azimut: deg(vueZone.azimut),
      polaire: clamp(deg(vueZone.polaire), 0.15, Math.PI - 0.15),
      distance: clamp(framing.distance * vueZone.distance, c.minDistance, c.maxDistance),
      cible,
    };

    // Première mise en place (ou nouveau modèle / vue initiale) : sans animation.
    // Changement de zone : animé pour guider le regard.
    const reset = nonce !== lastNonce.current;
    const instantane = nouveauModele || reset;
    lastNonce.current = nonce;
    if (instantane) {
      c.target.copy(cible);
      c.setAzimuthalAngle(goal.current.azimut);
      c.setPolarAngle(goal.current.polaire);
      const direction = new THREE.Vector3().setFromSphericalCoords(
        1,
        goal.current.polaire,
        goal.current.azimut,
      );
      c.object.position.copy(cible).addScaledVector(direction, goal.current.distance);
      c.update();
      animating.current = false;
    } else {
      animating.current = true;
    }
    // `side` n'est pas utilisé directement : la vue de la zone le remplace ; il force
    // simplement le recalcul quand le store change de zone.
  }, [framing, controls, camera, nonce, side, vue]);

  // L'utilisateur reprend la main dès qu'il touche la scène : l'animation s'arrête.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => {
      animating.current = false;
    };
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c || !animating.current || !framing) return;

    // Interpolation indépendante du framerate (ferme ~98 % de l'écart en 0,45 s).
    const k = 1 - Math.pow(0.0005, Math.min(0.05, delta));
    const g = goal.current;

    let deltaAz = g.azimut - c.getAzimuthalAngle();
    while (deltaAz > Math.PI) deltaAz -= 2 * Math.PI;
    while (deltaAz < -Math.PI) deltaAz += 2 * Math.PI;
    const azimut = c.getAzimuthalAngle() + deltaAz * k;
    const polaire = c.getPolarAngle() + (g.polaire - c.getPolarAngle()) * k;
    const distance = c.getDistance() + (g.distance - c.getDistance()) * k;

    c.target.lerp(g.cible, k);
    c.setAzimuthalAngle(azimut);
    c.setPolarAngle(polaire);
    const direction = new THREE.Vector3().setFromSphericalCoords(1, polaire, azimut);
    c.object.position.copy(c.target).addScaledVector(direction, distance);
    c.update();

    const fini =
      Math.abs(deltaAz) < 0.004 &&
      Math.abs(g.polaire - polaire) < 0.004 &&
      Math.abs(g.distance - distance) < framing.distance * 0.004 &&
      c.target.distanceTo(g.cible) < framing.distance * 0.004;
    if (fini) {
      c.target.copy(g.cible);
      c.setAzimuthalAngle(g.azimut);
      c.setPolarAngle(g.polaire);
      c.object.position
        .copy(g.cible)
        .addScaledVector(new THREE.Vector3().setFromSphericalCoords(1, g.polaire, g.azimut), g.distance);
      c.update();
      animating.current = false;
    }
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}

/**
 * Environnement de studio généré localement : aucun fichier HDR à télécharger, donc
 * l'aperçu fonctionne hors ligne. C'est lui qui donne le reflet satiné du coton sans
 * écraser les couleurs (contrairement à ACES).
 */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const environnement = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environnement;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      environnement.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  /* eslint-enable react-hooks/immutability */
  return null;
}

/** Évite l'écran vide si le GLB est absent ou illisible. */
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <mesh>
          <boxGeometry args={[0.82, 0.75, 0.2]} />
          <meshStandardMaterial color="#d4d4d4" wireframe />
        </mesh>
      );
    }
    return this.props.children;
  }
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <p className="rounded-full bg-encre px-4 py-2 text-sm font-medium text-creme">
        Chargement du modèle 3D… {Math.round(progress)} %
      </p>
    </div>
  );
}

type DebugWindow = Window & {
  __elembo3d?: Record<string, unknown> & {
    /** Réglage de la dernière vue demandée (diagnostic des changements de zone). */
    vue?: () => { side: string; azimut: number; polaire: number; distance: number } | null;
  };
};

export default function ProductViewer({ cameraNonce = 0 }: { cameraNonce?: number }) {
  const side = useConfiguratorStore((s) => s.side);
  const productId = useConfiguratorStore((s) => s.productId);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [framing, setFraming] = useState<Framing | null>(null);
  const framingRef = useRef<Framing | null>(null);
  const aspectRef = useRef(16 / 9);
  // Miroirs pour le diagnostic : `onCreated` n'est exécuté qu'une fois, il lui faut donc
  // une référence toujours à jour (écrite après le rendu, jamais pendant).
  useEffect(() => {
    framingRef.current = framing;
  }, [framing]);

  const product = getProductById(productId);
  const vue = product?.zones?.[side]?.vue ?? null;
  const vueRef = useRef(vue);
  useEffect(() => {
    vueRef.current = vue;
  }, [vue]);

  // Le modèle annonce sa boîte englobante réelle : on en déduit le cadrage.
  const handleBounds = useCallback((box: Box) => {
    setFraming(framingFor(box, 35, aspectRef.current));
  }, []);

  return (
    <div
      ref={(el) => {
        if (el && el.clientWidth > 0) aspectRef.current = el.clientWidth / Math.max(1, el.clientHeight);
      }}
      className="trame relative h-full w-full overflow-hidden rounded-[20px] bg-[#151119] lg:min-h-[380px]"
    >
      <Canvas
        shadows="basic"
        dpr={[1, 2]}
        camera={{ position: [0, 0.15, 3.4], fov: 35, near: 0.1, far: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.05,
        }}
        onCreated={({ gl, scene, camera }) => {
          if (process.env.NODE_ENV === 'production') return;
          // Point d'observation utilisé par les tests E2E et le diagnostic.
          const w = window as DebugWindow;
          w.__elembo3d = {
            ...(w.__elembo3d ?? {}),
            THREE,
            gl,
            scene,
            camera,
            info: () => ({
              triangles: gl.info.render.triangles ?? 0,
              calls: gl.info.render.calls,
            }),
            describe: () => describeModel(scene),
            cameraPos: () => camera.position.toArray().map((n) => Number(n.toFixed(3))),
            orbit: () => {
              const c = controls.current;
              if (!c) return null;
              return {
                azimut: Number(c.getAzimuthalAngle().toFixed(3)),
                polaire: Number(c.getPolarAngle().toFixed(3)),
                distance: Number(c.getDistance().toFixed(3)),
                cible: c.target.toArray().map((n) => Number(n.toFixed(3))),
              };
            },
            framing: () => {
              const f = framingRef.current;
              return f ? { center: f.center, distance: f.distance, radius: f.radius, height: f.height } : null;
            },
            vue: () => {
              const v = vueRef.current;
              if (!v) return null;
              return { side, azimut: v.azimut, polaire: v.polaire, distance: v.distance };
            },
            // Force un rendu dans une cible hors écran puis lit les pixels : preuve
            // visuelle que le visuel composé apparaît bien sur le modèle. On passe par
            // une cible de rendu car le tampon de l'écran est vidé après composition
            // (et donc illisible sans preserveDrawingBuffer).
            readPixels: () => {
              const canvas = gl.domElement;
              const target = new THREE.WebGLRenderTarget(canvas.width, canvas.height);
              const previous = gl.getRenderTarget();
              gl.setRenderTarget(target);
              gl.render(scene, camera);
              const buffer = new Uint8Array(canvas.width * canvas.height * 4);
              gl.readRenderTargetPixels(target, 0, 0, canvas.width, canvas.height, buffer);
              gl.setRenderTarget(previous);
              target.dispose();
              let opaque = 0;
              let orange = 0;
              let clair = 0;
              let sombres = 0;
              for (let i = 0; i < buffer.length; i += 4) {
                if (buffer[i + 3] > 10) opaque++;
                const luma = buffer[i] + buffer[i + 1] + buffer[i + 2];
                if (buffer[i] > 40 && buffer[i + 1] > 40 && buffer[i + 2] > 40) clair++;
                if (luma < 120) sombres++;
                // teinte du visuel en espace linéaire (rendu dans une cible)
                if (buffer[i] > 60 && buffer[i + 2] < 60 && buffer[i] > buffer[i + 1] * 2) orange++;
              }
              return { mode: 'render-target', width: canvas.width, height: canvas.height, opaque, clair, sombres, orange };
            },
          };
        }}
      >
        <StudioEnvironment />
        <hemisphereLight args={['#ffffff', '#d7d3cc', 0.55]} />
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
          shadow-camera-left={-((framing?.radius ?? 3) * 0.9)}
          shadow-camera-right={(framing?.radius ?? 3) * 0.9}
          shadow-camera-top={(framing?.radius ?? 3) * 0.9}
          shadow-camera-bottom={-((framing?.radius ?? 3) * 0.9)}
          shadow-camera-near={0.1}
          shadow-camera-far={(framing?.distance ?? 10) * 3}
        />
        <directionalLight position={[-4, 2.5, -3]} intensity={0.55} />
        <directionalLight position={[0, 3, -5]} intensity={0.35} />

        <Suspense fallback={null}>
          <ModelErrorBoundary>
            <ProductModel onBounds={handleBounds} />
          </ModelErrorBoundary>
        </Suspense>

        {framing && (
          <ContactShadows
            position={[framing.center[0], framing.groundY, framing.center[2]]}
            opacity={0.28}
            scale={framing.shadowScale}
            blur={2.6}
            far={framing.height * 0.5}
            resolution={512}
          />
        )}
        <CameraRig side={side} nonce={cameraNonce} framing={framing} controls={controls} vue={vue} />
        <OrbitControls
          ref={controls}
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          zoomSpeed={0.8}
          rotateSpeed={0.75}
          minDistance={framing?.minDistance ?? 1.7}
          maxDistance={framing?.maxDistance ?? 6}
          minPolarAngle={0.25}
          maxPolarAngle={2.7}
        />
      </Canvas>
      <LoadingOverlay />
    </div>
  );
}


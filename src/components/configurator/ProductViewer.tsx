'use client';

// ProductViewer : scène Three.js — Canvas, caméra, éclairage studio, modèle, contrôles
// orbitaux, ombres douces, gestion du redimensionnement, chargement paresseux du GLB.
//
// Le rendu est strictement client : ce composant est importé en `ssr: false` par le
// configurateur, donc jamais évalué côté serveur (aucun accès à window/WebGL pendant
// le rendu serveur).
//
// Éclairage : volontairement des LUMIÈRES (pas d'Environment HDR distant), pour que
// l'aperçu fonctionne hors ligne et sans dépendance externe. Pour passer à un vrai
// studio HDR plus tard : déposer un .hdr dans public/hdri/ et l'utiliser via
// <Environment files="/hdri/studio.hdr" /> — aucune autre modification nécessaire.

import { Component, Suspense, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls, useProgress } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { describeModel } from '../../lib/three/models';
import ProductModel from './ProductModel';

/**
 * Oriente le produit face à la caméra — et SEULEMENT sur demande (changement de face
 * ou vue initiale).
 *
 * On anime l'ANGLE AZIMUTAL via l'API d'OrbitControls, jamais la position brute :
 * déplacer `camera.position` en ligne droite passait par le centre du modèle (distance
 * nulle) et OrbitControls recomputait ensuite la position depuis ses propres
 * coordonnées sphériques, ce qui laissait la vue dans un état incohérent.
 */
function CameraRig({
  side,
  nonce,
  controls,
}: {
  side: 'front' | 'back';
  nonce: number;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const goal = useRef(0);
  const animating = useRef(false);
  const lastNonce = useRef(nonce);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;

    const initialRequested = lastNonce.current !== nonce;
    lastNonce.current = nonce;

    if (initialRequested) {
      // Retour à la vue de départ : position et cible d'origine, avec amortissement.
      c.reset();
      animating.current = false;
      return;
    }

    goal.current = side === 'front' ? 0 : Math.PI;
    animating.current = Math.abs(c.getAzimuthalAngle() - goal.current) > 0.02;
  }, [side, nonce, controls]);

  useFrame(() => {
    const c = controls.current;
    if (!c || !animating.current) return;

    const current = c.getAzimuthalAngle();
    let delta = goal.current - current;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    c.setAzimuthalAngle(current + delta * 0.15);
    c.update();

    if (Math.abs(delta) < 0.01) {
      c.setAzimuthalAngle(goal.current);
      c.update();
      animating.current = false;
    }
  });

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
          <boxGeometry args={[1, 1.2, 0.3]} />
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
      <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-neutral-600">
        Chargement du modèle 3D… {Math.round(progress)} %
      </p>
    </div>
  );
}

type DebugWindow = Window & { __elembo3d?: Record<string, unknown> };

export default function ProductViewer({ cameraNonce = 0 }: { cameraNonce?: number }) {
  const side = useConfiguratorStore((s) => s.side);
  const controls = useRef<OrbitControlsImpl | null>(null);

  return (
    <div className="relative h-full min-h-[380px] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-b from-neutral-50 to-white">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.15, 3.4], fov: 35, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true }}
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
              for (let i = 0; i < buffer.length; i += 4) {
                if (buffer[i + 3] > 10) opaque++;
                if (buffer[i] > 150 && buffer[i + 1] > 40 && buffer[i + 1] < 190 && buffer[i + 2] < 130) orange++;
              }
              return { mode: 'render-target', width: canvas.width, height: canvas.height, opaque, orange };
            },
          };
        }}
      >
        <hemisphereLight args={['#ffffff', '#d7d3cc', 0.75]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.15}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-4, 2.5, -3]} intensity={0.45} />

        <Suspense fallback={null}>
          <ModelErrorBoundary>
            <ProductModel />
          </ModelErrorBoundary>
        </Suspense>

        <ContactShadows position={[0, -0.72, 0]} opacity={0.32} scale={6} blur={2.8} far={2} />
        <CameraRig side={side} nonce={cameraNonce} controls={controls} />
        <OrbitControls
          ref={controls}
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.7}
          maxDistance={6}
          minPolarAngle={0.4}
          maxPolarAngle={2.5}
        />
      </Canvas>
      <LoadingOverlay />
    </div>
  );
}

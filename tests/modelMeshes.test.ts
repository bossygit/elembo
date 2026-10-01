import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findGarmentMeshes, findMeshForDecal, garmentBox } from '../src/lib/three/models';

/** Construit deux panneaux plats face à face (avant à Z=+1, arrière à Z=−1). */
function deuxPanneaux(): THREE.Object3D {
  const root = new THREE.Group();
  const plan = (z: number, nx: number, nz: number, nom: string) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, z, 1, -1, z, 1, 1, z, -1, 1, z], 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = nom;
    return mesh;
  };
  root.add(plan(1, 0, 1, 'avant'));
  root.add(plan(-1, 0, -1, 'arriere'));
  return root;
}

describe('sélection des maillages d’un modèle fournisseur', () => {
  it('liste tous les maillages du vêtement (et pas seulement le plus gros)', () => {
    const root = deuxPanneaux();
    const meshes = findGarmentMeshes(root);
    expect(meshes).toHaveLength(2);
    expect(meshes.map((m) => m.name).sort()).toEqual(['arriere', 'avant']);
  });

  it('choisit le maillage qui porte la surface, selon la face demandée', () => {
    const root = deuxPanneaux();
    const avant = findMeshForDecal(root, [0, 0, 0.9], 1);
    const arriere = findMeshForDecal(root, [0, 0, -0.9], -1);
    expect(avant?.name).toBe('avant');
    expect(arriere?.name).toBe('arriere');
  });

  it('ne se laisse pas piéger par un grand maillage mal orienté', () => {
    // Un sol horizontal (normales vers le haut) plus grand que les panneaux : il ne doit
    // jamais être choisi pour une impression sur la poitrine.
    const root = deuxPanneaux();
    const sol = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial(),
    );
    sol.name = 'sol';
    root.add(sol);
    expect(findMeshForDecal(root, [0, 0, 0.9], 1)?.name).toBe('avant');
    expect(findMeshForDecal(root, [0, 0, -0.9], -1)?.name).toBe('arriere');
  });

  it('renvoie null si aucun maillage ne fait face à la zone', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'seul';
    root.add(mesh); // normales vers +Z
    expect(findMeshForDecal(root, [0, 0, -5], -1)).toBeNull();
  });
});

describe('cadrage : ignorer les plans de décor', () => {
  it('exclut un sol livré avec le modèle', () => {
    const root = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5), new THREE.MeshStandardMaterial());
    corps.name = 'corps';
    root.add(corps);
    const sol = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial(),
    );
    sol.position.set(0, -1, 0);
    root.add(sol);

    const boite = garmentBox(root);
    expect(boite).not.toBeNull();
    // Sans exclusion la boîte ferait 30 unités de large : le vêtement paraîtrait minuscule.
    expect(boite!.max.x - boite!.min.x).toBeCloseTo(2, 5);
    expect(boite!.max.y - boite!.min.y).toBeCloseTo(2, 5);
  });

  it('garde le maillage réel, et conserve un produit entièrement plat', () => {
    const root = new THREE.Group();
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    cube.position.set(0, 3, 0);
    root.add(cube);
    expect(garmentBox(root)!.max.y).toBeCloseTo(3.5, 5);

    // Un vêtement fait uniquement de panneaux plats (le placeholder généré) ne doit pas
    // se retrouver sans cadrage : il n'y a rien de plus grand que lui à écarter.
    const toutPlat = new THREE.Group();
    const panneau = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshStandardMaterial());
    toutPlat.add(panneau);
    expect(garmentBox(toutPlat)!.max.y - garmentBox(toutPlat)!.min.y).toBeCloseTo(3, 5);
  });

  it('ne se laisse pas piéger par un plan vertical (fond)', () => {
    const root = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5), new THREE.MeshStandardMaterial());
    root.add(corps);
    const fond = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial());
    fond.position.set(0, 0, -6);
    root.add(fond);
    expect(garmentBox(root)!.min.z).toBeCloseTo(-0.25, 5);
    expect(garmentBox(root)!.max.z).toBeCloseTo(0.25, 5);
  });
});

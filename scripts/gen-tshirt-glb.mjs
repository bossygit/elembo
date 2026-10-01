// Générateur du modèle GLB placeholder Elembo — Node pur, aucune dépendance.
//
// Pourquoi un générateur maison : le configurateur a besoin d'un /models/.../tshirt.glb
// chargeable immédiatement, sans télécharger un modèle dont la licence est inconnue.
// Ce script écrit donc un T-shirt low-poly (torse + 2 manches) dont nous sommes
// propriétaires, avec une convention UV STABLE et documentée :
//
//   Nœud "FrontPanel"  → panneau avant, UV (0,0)-(1,1): u le long de +X, v le long de +Y
//   Nœud "BackPanel"   → panneau arrière, UV (0,0)-(1,1): u le long de -X (donc lisible
//                        de dos, non miroir), v le long de +Y
//   Nœud "Body"        → manches et tranches (couleur unie, sans motif)
//
// Le design utilisateur est composé en Canvas 2D dans l'espace UV du panneau, puis
// appliqué en texture sur FrontPanel / BackPanel. Remplacer ce placeholder par un
// modèle réel impose de respecter la même convention (voir public/models/README.md).
//
// Usage : node scripts/gen-tshirt-glb.mjs  →  public/models/tshirt/tshirt-placeholder.glb
//
// ATTENTION : ce fichier est un PLACEHOLDER de développement. Le modèle commercial est
// public/models/tshirt/tshirt.glb (modèle fournisseur, technique « decal ») — ne pas
// l'écraser avec ce générateur.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'models', 'tshirt', 'tshirt-placeholder.glb');

// ---------------------------------------------------------------- géométrie
// Repère : 1 unité ≈ 50 cm. Torse 1,0 × 1,2 × 0,3 ; manches 0,58 × 0,34 × 0,3.
const TORSO = { cx: 0, cy: 0, cz: 0, sx: 1.0, sy: 1.2, sz: 0.3 };
const SLEEVE = { sx: 0.58, sy: 0.34, sz: 0.3, cx: 0.79, cy: 0.3, cz: 0 };
const SLEEVE_OFFSETS = [-1, 1];

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Quad a→b→c→d (sens anti-horaire vu de la normale) avec ses 4 UV. */
function quad(a, b, c, d, uvs) {
  const n = normalize(cross(sub(b, a), sub(d, a)));
  return {
    positions: [a, b, c, d],
    normals: [n, n, n, n],
    uvs,
    // deux triangles : (0,1,2) et (0,2,3)
    indices: [0, 1, 2, 0, 2, 3],
  };
}

/** Les 6 faces d'une boîte, avec la convention UV d'Elembo pour avant/arrière. */
function box({ cx, cy, cz, sx, sy, sz }) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const UV_MIRROR = [[1, 0], [1, 1], [0, 1], [0, 0]]; // u le long de -X
  const FLAT = [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]];
  return {
    front: quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], UV),
    back: quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], UV_MIRROR),
    left: quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], FLAT),
    right: quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], FLAT),
    top: quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], FLAT),
    bottom: quad([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], FLAT),
  };
}

/** Accumulateur de sommets : positions + normales + uv + indices. */
function accumulator() {
  return { positions: [], normals: [], uvs: [], indices: [], verts: 0 };
}
function push(acc, q) {
  for (let i = 0; i < 4; i++) {
    acc.positions.push(...q.positions[i]);
    acc.normals.push(...q.normals[i]);
    acc.uvs.push(...q.uvs[i]);
  }
  for (const i of q.indices) acc.indices.push(acc.verts + i);
  acc.verts += 4;
}

const torso = box(TORSO);
const front = accumulator();
const back = accumulator();
const body = accumulator();

push(front, torso.front);
push(back, torso.back);
for (const face of ['left', 'right', 'top', 'bottom']) push(body, torso[face]);
for (const sign of SLEEVE_OFFSETS) {
  const s = box({ ...SLEEVE, cx: SLEEVE.cx * sign });
  for (const face of ['front', 'back', 'left', 'right', 'top', 'bottom']) push(body, s[face]);
}

// ------------------------------------------------------- sérialisation GLB
const NODES = [
  { name: 'FrontPanel', material: 'elembo-front', acc: front },
  { name: 'BackPanel', material: 'elembo-back', acc: back },
  { name: 'Body', material: 'elembo-body', acc: body },
];

const bufferViews = [];
const accessors = [];
const binParts = [];
let binLength = 0;

function addView(typedArray, target) {
  const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  const view = { buffer: 0, byteOffset: binLength, byteLength: bytes.length };
  if (target) view.target = target;
  bufferViews.push(view);
  binParts.push(bytes, Buffer.alloc(pad));
  binLength += bytes.length + pad;
  return bufferViews.length - 1;
}

function addAccessor(typedArray, type, components, target, withMinMax = false) {
  const viewIndex = addView(typedArray, target);
  const accessor = {
    bufferView: viewIndex,
    componentType: components.componentType,
    count: typedArray.length / components.size,
    type,
  };
  if (withMinMax) {
    const stride = components.size;
    const min = new Array(stride).fill(Infinity);
    const max = new Array(stride).fill(-Infinity);
    for (let i = 0; i < typedArray.length; i += stride) {
      for (let c = 0; c < stride; c++) {
        min[c] = Math.min(min[c], typedArray[i + c]);
        max[c] = Math.max(max[c], typedArray[i + c]);
      }
    }
    accessor.min = min;
    accessor.max = max;
  }
  accessors.push(accessor);
  return accessors.length - 1;
}

const meshes = [];
const nodes = [];

NODES.forEach((node, index) => {
  const positions = new Float32Array(node.acc.positions);
  const normals = new Float32Array(node.acc.normals);
  const uvs = new Float32Array(node.acc.uvs);
  const indices = new Uint16Array(node.acc.indices);

  const posAcc = addAccessor(positions, 'VEC3', { componentType: 5126, size: 3 }, 34962, true);
  const nrmAcc = addAccessor(normals, 'VEC3', { componentType: 5126, size: 3 }, 34962);
  const uvAcc = addAccessor(uvs, 'VEC2', { componentType: 5126, size: 2 }, 34962);
  // Les index DOIVENT être de type SCALAR en glTF 2.0 (pas « VEC1 ») : sinon le
  // loader construit une géométrie sans index et le maillage n'est jamais rendu.
  const idxAcc = addAccessor(indices, 'SCALAR', { componentType: 5123, size: 1 }, 34963);

  meshes.push({
    name: node.name,
    primitives: [
      {
        attributes: { POSITION: posAcc, NORMAL: nrmAcc, TEXCOORD_0: uvAcc },
        indices: idxAcc,
        material: index,
      },
    ],
  });
  nodes.push({ name: node.name, mesh: index });
  console.log(
    `  ${node.name.padEnd(11)} ${String(node.acc.verts).padStart(4)} sommets  ` +
      `${String(node.acc.indices.length / 3).padStart(4)} triangles`,
  );
});

const material = (name) => ({
  name,
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 0.85,
  },
  doubleSided: false,
});

const gltf = {
  asset: { version: '2.0', generator: 'Elembo placeholder generator (Smart Vision Congo)' },
  scene: 0,
  scenes: [{ name: 'ElemboTshirt', nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  materials: NODES.map((n) => material(n.material)),
  accessors,
  bufferViews,
  buffers: [{ byteLength: binLength }],
};

const bin = Buffer.concat(binParts, binLength);

// ------------------------------------------------- contrôle de conformité glTF
// Un fichier invalide se charge « presque » : c'est le pire des cas (scène vide sans
// erreur). On refuse donc d'écrire un GLB non conforme.
function validateGltf(doc) {
  const problems = [];
  const COMPONENT = { 5123: 'UNSIGNED_SHORT', 5125: 'UNSIGNED_INT' };
  doc.meshes.forEach((mesh, mi) => {
    const prim = mesh.primitives[0];
    const pos = doc.accessors[prim.attributes.POSITION];
    const idx = doc.accessors[prim.indices];
    if (!pos || pos.type !== 'VEC3' || pos.componentType !== 5126) {
      problems.push(`mesh ${mi} (${mesh.name}) : POSITION doit être VEC3/FLOAT`);
    }
    if (!pos.min || !pos.max) problems.push(`mesh ${mi} (${mesh.name}) : POSITION sans min/max (exigé par la spec)`);
    if (!idx || idx.type !== 'SCALAR') {
      problems.push(`mesh ${mi} (${mesh.name}) : les index doivent être de type SCALAR (reçu ${idx?.type})`);
    }
    if (!idx || !COMPONENT[idx.componentType]) {
      problems.push(`mesh ${mi} (${mesh.name}) : componentType d'index non supporté (${idx?.componentType})`);
    }
    for (const [name, acc] of Object.entries(prim.attributes)) {
      if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(name)) problems.push(`attribut inattendu : ${name}`);
      if (!doc.accessors[acc]?.count) problems.push(`mesh ${mi} : attribut ${name} vide`);
    }
    if (!doc.materials[prim.material]) problems.push(`mesh ${mi} : matériau ${prim.material} absent`);
  });
  if (problems.length) throw new Error(`GLB non conforme :\n  - ${problems.join('\n  - ')}`);
}
validateGltf(gltf);

const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
const json = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);
const binPad = (4 - (bin.length % 4)) % 4;
const binPadded = Buffer.concat([bin, Buffer.alloc(binPad)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4); // JSON
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binPadded.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // BIN

const glb = Buffer.concat([header, jsonHeader, json, binHeader, binPadded]);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, glb);
console.log(`\nécrit : ${OUT} (${(glb.length / 1024).toFixed(1)} Ko)`);

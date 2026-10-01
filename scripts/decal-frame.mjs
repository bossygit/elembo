// Calcule le cadre de projection (technique 'decal') d'un T-shirt à partir de son maillage :
// centre et profondeur de la surface avant/arrière dans la bande d'impression.
//
// Usage : node scripts/decal-frame.mjs <fichier.glb> [uniteEnCm] [largeurCm] [hauteurCm] [cmSousLeCol]
import { readFileSync } from 'node:fs';

const [, , file, uniteArg = '100', largeurArg = '21', hauteurArg = '30', sousColArg = '7'] = process.argv;
const unitToCm = Number(uniteArg);
const cmWidth = Number(largeurArg);
const cmHeight = Number(hauteurArg);
const cmBelowCollar = Number(sousColArg);

const buf = readFileSync(file);
const total = buf.readUInt32LE(8);
let off = 12, json = null, bin = null;
while (off < total) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const COMP = {
  5121: { s: 1, r: (o) => view.getUint8(o) },
  5123: { s: 2, r: (o) => view.getUint16(o, true) },
  5125: { s: 4, r: (o) => view.getUint32(o, true) },
  5126: { s: 4, r: (o) => view.getFloat32(o, true) },
};
const DIM = { SCALAR: 1, VEC2: 2, VEC3: 3 };
function acc(i) {
  const a = json.accessors[i], v = json.bufferViews[a.bufferView], c = COMP[a.componentType], d = DIM[a.type];
  const stride = v.byteStride ?? c.s * d, base = bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out = [];
  for (let k = 0; k < a.count; k++) {
    if (d === 1) out.push(c.r(base + k * stride));
    else out.push(Array.from({ length: d }, (_, j) => c.r(base + k * stride + j * c.s)));
  }
  return out;
}

// Boîte globale
const gMin = [Infinity, Infinity, Infinity], gMax = [-Infinity, -Infinity, -Infinity];
const meshes = json.meshes.map((m) => {
  const p = m.primitives[0];
  const positions = acc(p.attributes.POSITION);
  const normals = p.attributes.NORMAL ? acc(p.attributes.NORMAL) : null;
  const indices = p.indices !== undefined ? acc(p.indices) : positions.map((_, i) => i);
  for (const v of positions) for (let c = 0; c < 3; c++) { gMin[c] = Math.min(gMin[c], v[c]); gMax[c] = Math.max(gMax[c], v[c]); }
  // parent
  let parentIdx = -1;
  json.nodes.forEach((n, i) => { if ((n.children ?? []).includes(json.nodes.findIndex((x) => x.mesh === json.meshes.indexOf(m)))) parentIdx = i; });
  return { name: m.name, positions, normals, indices, parent: json.nodes[parentIdx]?.name ?? '' };
});

const size = [0, 1, 2].map((c) => gMax[c] - gMin[c]);
console.log(`boîte du modèle : ${size.map((v) => v.toFixed(3)).join(' × ')} (unités) → ${size.map((v) => (v * unitToCm).toFixed(1)).join(' × ')} cm`);
console.log(`haut du vêtement : Y = ${gMax[1].toFixed(3)} | bas : Y = ${gMin[1].toFixed(3)}\n`);

const uH = cmWidth / unitToCm;   // largeur du cadre en unités
const uV = cmHeight / unitToCm;
const centreY = gMax[1] - (cmBelowCollar + cmHeight / 2) / unitToCm;
console.log(`cadre ${cmWidth} × ${cmHeight} cm → ${uH.toFixed(4)} × ${uV.toFixed(4)} unités, centre Y = ${centreY.toFixed(4)}`);
console.log(`bande verticale analysée : Y de ${(centreY - uV / 2).toFixed(3)} à ${(centreY + uV / 2).toFixed(3)}\n`);

for (const face of ['AVANT', 'ARRIERE']) {
  const signe = face === 'AVANT' ? 1 : -1;
  const zs = [];
  const meshesFace = meshes.filter((m) => (signe > 0 ? /front/i.test(m.parent) || /front/i.test(m.name) : /back/i.test(m.parent) || /back/i.test(m.name)));
  const cibles = meshesFace.length ? meshesFace : meshes;
  for (const m of cibles) {
    if (!m.normals) continue;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      const n = [(m.normals[a][2] + m.normals[b][2] + m.normals[c][2]) / 3];
      if (signe > 0 ? n[0] < 0.7 : n[0] > -0.7) continue;
      const y = (m.positions[a][1] + m.positions[b][1] + m.positions[c][1]) / 3;
      const x = (m.positions[a][0] + m.positions[b][0] + m.positions[c][0]) / 3;
      if (Math.abs(y - centreY) > uV / 2 * 0.8) continue;
      if (Math.abs(x) > uH / 2) continue;
      for (const i of [a, b, c]) zs.push(m.positions[i][2] * signe);
    }
  }
  if (!zs.length) { console.log(`${face} : aucun triangle dans la bande (vérifier le nommage des nœuds)`); continue; }
  zs.sort((p, q) => p - q);
  const med = zs[Math.floor(zs.length / 2)];
  console.log(`${face} : ${zs.length} sommets | Z ${zs[0].toFixed(3)} → ${zs[zs.length - 1].toFixed(3)} | médiane ${med.toFixed(3)}`);
  console.log(`        cadre suggéré : center [0, ${centreY.toFixed(2)}, ${(med + 0.02 * signe).toFixed(3)}], rotationY ${signe > 0 ? 0 : 'Math.PI'}, depth ${(Math.abs(zs[zs.length - 1] - zs[0]) + 0.06).toFixed(2)}`);
}

// Rapport compact par maillage : parent, taille, boîte UV, boîte 3D.
// Usage : node scripts/glb-meshes.mjs <fichier.glb>
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
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
  5120: { s: 1, r: (o) => view.getInt8(o) },
  5121: { s: 1, r: (o) => view.getUint8(o) },
  5122: { s: 2, r: (o) => view.getInt16(o, true) },
  5123: { s: 2, r: (o) => view.getUint16(o, true) },
  5125: { s: 4, r: (o) => view.getUint32(o, true) },
  5126: { s: 4, r: (o) => view.getFloat32(o, true) },
};
const DIM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
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

// parent de chaque mesh
const parent = new Map();
(json.nodes ?? []).forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
const name = (i) => json.nodes[i]?.name ?? `#${i}`;

const gMin = [Infinity, Infinity, Infinity], gMax = [-Infinity, -Infinity, -Infinity];
console.log('mesh                     parent                 tri   UV u                UV v                3D taille');
json.meshes.forEach((m, i) => {
  const p = m.primitives[0];
  const pos = acc(p.attributes.POSITION);
  const uv = p.attributes.TEXCOORD_0 !== undefined ? acc(p.attributes.TEXCOORD_0) : null;
  const tri = p.indices !== undefined ? json.accessors[p.indices].count / 3 : pos.length / 3;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const v of pos) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], v[c]); mx[c] = Math.max(mx[c], v[c]); gMin[c] = Math.min(gMin[c], v[c]); gMax[c] = Math.max(gMax[c], v[c]); }
  let us = '—', vs = '—';
  if (uv) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const t of uv) { u0 = Math.min(u0, t[0]); u1 = Math.max(u1, t[0]); v0 = Math.min(v0, t[1]); v1 = Math.max(v1, t[1]); }
    us = `${u0.toFixed(3)}–${u1.toFixed(3)}`; vs = `${v0.toFixed(3)}–${v1.toFixed(3)}`;
  }
  // chaîne des parents du maillage (pour identifier les nœuds nommés du fournisseur)
  const chain = [];
  let cur = json.nodes.findIndex((n) => n.mesh === i);
  while (cur !== undefined && cur !== -1) { chain.unshift(name(cur)); cur = parent.get(cur) ?? -1; if (chain.length > 6) break; }
  console.log(
    `${(m.name ?? '').padEnd(24)} ${chain.slice(-2).join('/').padEnd(22)} ${String(Math.round(tri)).padStart(5)}  ${us.padEnd(19)} ${vs.padEnd(19)} ${[0,1,2].map((c) => (mx[c]-mn[c]).toFixed(3)).join(' × ')}`,
  );
});
console.log('\nboîte englobante du modèle :', [0,1,2].map((c) => (gMax[c]-gMin[c]).toFixed(3)).join(' × '));
console.log('min :', gMin.map((v) => v.toFixed(3)).join(', '), '| max :', gMax.map((v) => v.toFixed(3)).join(', '));

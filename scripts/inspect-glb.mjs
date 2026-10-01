// Analyse d'un GLB : structure + repérage DATA-DRIVEN des zones d'impression.
//
// Usage : node scripts/inspect-glb.mjs <fichier.glb>
//
// Pour intégrer un modèle réel (fournisseur) au configurateur, il faut connaître le
// rectangle UV de la face avant et de la face arrière. On le déduit du maillage :
// on sélectionne les triangles dont la normale pointe vers l'observateur (+Z / -Z) dans
// la hauteur du torse, et on prend la boîte englobante de leurs coordonnées UV.

import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage : node scripts/inspect-glb.mjs <fichier.glb>');
  process.exit(1);
}

const buf = readFileSync(path);
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);
if (magic !== 0x46546c67) throw new Error('pas un GLB');

let off = 12;
let json = null;
let bin = null;
while (off < total) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  if (type === 0x004e4942) bin = data;
  off += 8 + len;
}

console.log(`fichier : ${path}`);
console.log(`GLB v${version}, ${(total / 1024 / 1024).toFixed(1)} Mo`);
console.log(`générateur : ${json.asset?.generator ?? '?'}`);
console.log(`extensions : ${(json.extensionsUsed ?? []).join(', ') || 'aucune'}`);

console.log('\n--- scène ---');
for (const n of json.nodes ?? []) {
  const bits = [];
  if (n.mesh !== undefined) bits.push(`mesh#${n.mesh} "${json.meshes[n.mesh]?.name ?? ''}"`);
  if (n.translation) bits.push(`T[${n.translation.map((v) => v.toFixed(2))}]`);
  if (n.rotation) bits.push(`R[${n.rotation.map((v) => v.toFixed(2))}]`);
  if (n.scale) bits.push(`S[${n.scale.map((v) => v.toFixed(2))}]`);
  if (n.children) bits.push(`enfants[${n.children.join(',')}]`);
  console.log(`  nœud "${n.name ?? '(sans nom)'}" : ${bits.join(' ') || 'sans contenu'}`);
}

console.log('\n--- matériaux ---');
for (const m of json.materials ?? []) {
  const p = m.pbrMetallicRoughness ?? {};
  const has = (t) => (t?.index !== undefined ? `#${t.index}` : '—');
  console.log(
    `  "${m.name ?? '?'}" baseColor=${has(p.baseColorTexture)} metallicRoughness=${has(p.metallicRoughnessTexture)} normal=${has(m.normalTexture)} occlusion=${has(m.occlusionTexture)} emissive=${has(m.emissiveTexture)}`,
  );
}

console.log('\n--- images ---');
(json.images ?? []).forEach((img, i) => {
  const bv = json.bufferViews[img.bufferView];
  console.log(`  #${i} ${img.mimeType} ${img.name ?? ''} (${(bv.byteLength / 1024 / 1024).toFixed(2)} Mo)`);
});

// ------------------------------------------------------------------ décodage
const COMPONENT = {
  5120: { size: 1, read: (dv, o) => dv.getInt8(o) },
  5121: { size: 1, read: (dv, o) => dv.getUint8(o) },
  5122: { size: 2, read: (dv, o) => dv.getInt16(o, true) },
  5123: { size: 2, read: (dv, o) => dv.getUint16(o, true) },
  5125: { size: 4, read: (dv, o) => dv.getUint32(o, true) },
  5126: { size: 4, read: (dv, o) => dv.getFloat32(o, true) },
};
const DIMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// `bin` est une sous-vue de `buf` : les décalages des bufferViews sont relatifs au
// début du chunk BIN, il faut donc ajouter bin.byteOffset pour atteindre les octets.
const fileView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

function readAccessor(index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const comp = COMPONENT[acc.componentType];
  const dims = DIMS[acc.type];
  const stride = view.byteStride ?? comp.size * dims;
  const base = bin.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    if (dims === 1) {
      out.push(comp.read(fileView, base + i * stride));
    } else {
      const vec = [];
      for (let c = 0; c < dims; c++) vec.push(comp.read(fileView, base + i * stride + c * comp.size));
      out.push(vec);
    }
  }
  return out;
}

console.log('\n--- maillages ---');
const stats = [];
json.meshes?.forEach((mesh, mi) => {
  mesh.primitives.forEach((prim, pi) => {
    const attrs = Object.keys(prim.attributes).join(', ');
    const pos = json.accessors[prim.attributes.POSITION];
    const tri = prim.indices !== undefined ? json.accessors[prim.indices].count / 3 : pos.count / 3;
    console.log(`  mesh#${mi} "${mesh.name ?? ''}" prim#${pi} : ${pos.count} sommets, ${tri} triangles, attributs [${attrs}]`);
    stats.push({ mi, pi, prim });
  });
});

// ------------------------------------------------- zones d'impression déduites
console.log('\n--- zones d’impression déduites du maillage ---');
for (const { mi, pi, prim } of stats) {
  const positions = readAccessor(prim.attributes.POSITION);
  const uvs = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(prim.attributes.TEXCOORD_0) : null;
  const normals = prim.attributes.NORMAL !== undefined ? readAccessor(prim.attributes.NORMAL) : null;
  if (!uvs || !normals) {
    console.log(`  mesh#${mi} prim#${pi} : pas d'UV ou pas de normales — non exploitable`);
    continue;
  }
  const indices = prim.indices !== undefined ? readAccessor(prim.indices) : positions.map((_, i) => i);

  const box = (arr) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const v of arr) for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], v[c] ?? 0);
      max[c] = Math.max(max[c], v[c] ?? 0);
    }
    return { min, max };
  };
  const pb = box(positions);
  const taille = [0, 1, 2].map((c) => pb.max[c] - pb.min[c]);
  console.log(`  mesh#${mi} prim#${pi} : boîte ${taille.map((v) => v.toFixed(3)).join(' × ')} (X × Y × Z)`);
  console.log(`     Y de ${pb.min[1].toFixed(3)} à ${pb.max[1].toFixed(3)} | Z de ${pb.min[2].toFixed(2)} à ${pb.max[2].toFixed(2)}`);

  for (const [label, test] of [
    ['AVANT (+Z)', (n) => n[2] > 0.7],
    ['ARRIÈRE (−Z)', (n) => n[2] < -0.7],
  ]) {
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    let triCount = 0;
    const yMin = pb.min[1] + taille[1] * 0.3;
    const yMax = pb.min[1] + taille[1] * 0.85;
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t], b = indices[t + 1], c = indices[t + 2];
      const na = normals[a], nb = normals[b], nc = normals[c];
      if (!test(na) || !test(nb) || !test(nc)) continue;
      const y = (positions[a][1] + positions[b][1] + positions[c][1]) / 3;
      const x = (positions[a][0] + positions[b][0] + positions[c][0]) / 3;
      if (y < yMin || y > yMax) continue;
      if (Math.abs(x) > taille[0] * 0.3) continue; // torse seulement
      triCount++;
      for (const idx of [a, b, c]) {
        uMin = Math.min(uMin, uvs[idx][0]); uMax = Math.max(uMax, uvs[idx][0]);
        vMin = Math.min(vMin, uvs[idx][1]); vMax = Math.max(vMax, uvs[idx][1]);
      }
    }
    if (!triCount) {
      console.log(`     ${label} : aucun triangle trouvé`);
      continue;
    }
    console.log(`     ${label} : ${triCount} triangles | UV u ${uMin.toFixed(3)}–${uMax.toFixed(3)} | v ${vMin.toFixed(3)}–${vMax.toFixed(3)}`);
  }

  // --- sonde de surface : où se trouve la poitrine, et quelle est sa profondeur ?
  // Sert à placer un décalque (projection du visuel sur la surface réelle).
  const H = taille[1];
  const bandes = [
    ['haut poitrine', pb.min[1] + H * 0.72],
    ['centre poitrine', pb.min[1] + H * 0.6],
    ['bas poitrine', pb.min[1] + H * 0.48],
  ];
  for (const face of ['AVANT', 'ARRIÈRE']) {
    const test = face === 'AVANT' ? (n) => n[2] > 0.7 : (n) => n[2] < -0.7;
    const signe = face === 'AVANT' ? 1 : -1;
    console.log(`   ${face} — profondeur de la surface (Z) :`);
    for (const [nom, yCible] of bandes) {
      const zs = [];
      for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (!test(normals[a]) || !test(normals[b]) || !test(normals[c])) continue;
        const y = (positions[a][1] + positions[b][1] + positions[c][1]) / 3;
        const x = (positions[a][0] + positions[b][0] + positions[c][0]) / 3;
        if (Math.abs(y - yCible) > H * 0.04 || Math.abs(x) > 2) continue;
        for (const idx of [a, b, c]) zs.push(positions[idx][2] * signe);
      }
      if (!zs.length) {
        console.log(`     ${nom} (y≈${yCible.toFixed(1)}) : aucun triangle au centre`);
        continue;
      }
      zs.sort((p, q) => p - q);
      const med = zs[Math.floor(zs.length / 2)];
      console.log(
        `     ${nom} (y≈${yCible.toFixed(1)}) : Z ${signe > 0 ? '' : 'inversé '}${zs[0].toFixed(2)} → ${zs[zs.length - 1].toFixed(2)} | médiane ${med.toFixed(2)}`,
      );
    }
  }
}


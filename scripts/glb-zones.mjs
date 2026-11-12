// Inspecte un GLB à zones d'impression (modèle Elembo) : noms réels des nœuds, maillages,
// matériaux, jeux d'UV, et repères de chaque zone mesurés dans ses UV.
//
//   node scripts/glb-zones.mjs public/models/elembo-tshirt/elembo-tshirt.glb
//
// Repère « haut » d'une zone : le point le plus haut de la surface sur l'axe médian
// (u ≈ 0,5) — creux du col pour l'avant et le dos, tête de manche pour les manches. Les
// valeurs sont exprimées en centimètres depuis le bord haut de la texture de la zone,
// convention glTF (v vers le bas), et servent à placer les zones de production
// (src/lib/products/production.ts).

import { readFileSync } from 'node:fs';

export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un GLB');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  return { json, bin };
}

export function accessorData({ json, bin }, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const offset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  if (acc.componentType !== 5126) throw new Error('accesseur non flottant');
  const stride = view.byteStride ?? comps * 4;
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < comps; c++) out[i * comps + c] = bin.readFloatLE(offset + i * stride + c * 4);
  }
  return out;
}

export function describeGlb(path) {
  const glb = readGlb(path);
  const { json } = glb;
  const nodes = json.nodes.map((n) => ({
    name: n.name,
    mesh: n.mesh !== undefined ? json.meshes[n.mesh].name : null,
    extras: n.extras ?? null,
    primitives:
      n.mesh !== undefined
        ? json.meshes[n.mesh].primitives.map((p) => ({
            material: json.materials[p.material]?.name ?? null,
            attributes: Object.keys(p.attributes),
            texCoord0: p.attributes.TEXCOORD_0,
          }))
        : [],
  }));
  const zones = {};
  for (const n of nodes) {
    if (!n.extras?.zone) continue;
    const uv = accessorData(glb, n.primitives[0].texCoord0);
    let top = Infinity;
    let umin = Infinity;
    let umax = -Infinity;
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i < uv.length; i += 2) {
      const u = uv[i];
      const v = uv[i + 1];
      umin = Math.min(umin, u);
      umax = Math.max(umax, u);
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
      if (Math.abs(u - 0.5) < 0.02) top = Math.min(top, v);
    }
    const h = n.extras.print_height_cm;
    const w = n.extras.print_width_cm;
    zones[n.extras.zone] = {
      node: n.name,
      material: n.primitives[0].material,
      textureCm: { w, h },
      uvBox: { umin: +umin.toFixed(4), umax: +umax.toFixed(4), vmin: +vmin.toFixed(4), vmax: +vmax.toFixed(4) },
      // haut de la surface sur l'axe médian, en cm depuis le haut de la texture
      axisTopCm: +(top * h).toFixed(2),
      surfaceCm: { left: +(umin * w).toFixed(2), right: +(umax * w).toFixed(2), top: +(vmin * h).toFixed(2), bottom: +(vmax * h).toFixed(2) },
    };
  }
  return {
    nodes: nodes.map(({ name, mesh, primitives }) => ({ name, mesh, primitives: primitives.map(({ material, attributes }) => ({ material, attributes })) })),
    materials: json.materials.map((m) => m.name),
    rootExtras: json.nodes.find((n) => n.name === 'ELEMBO_TSHIRT')?.extras ?? null,
    zones,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(describeGlb(process.argv[2] ?? 'public/models/elembo-tshirt/elembo-tshirt.glb'), null, 2));
}

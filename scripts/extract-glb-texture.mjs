// Extrait une image intégrée d'un GLB (par index ou par nom) vers un fichier.
// Usage : node scripts/extract-glb-texture.mjs <fichier.glb> <sortie.jpg|png> [index|nomPartiel]
import { readFileSync, writeFileSync } from 'node:fs';

const [, , file, out, cible = '0'] = process.argv;
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

const images = json.images ?? [];
const parNom = Number.isNaN(Number(cible))
  ? images.findIndex((im) => (im.name ?? '').toLowerCase().includes(cible.toLowerCase()))
  : Number(cible);
const image = images[parNom];
if (!image) {
  console.error(`image « ${cible} » introuvable. Disponibles :`, images.map((im, i) => `${i}:${im.name}`).join(', '));
  process.exit(1);
}
const view = json.bufferViews[image.bufferView];
const debut = view.byteOffset ?? 0;
writeFileSync(out, bin.subarray(debut, debut + view.byteLength));
console.log(JSON.stringify({
  source: file, index: parNom, nom: image.name, mime: image.mimeType,
  octets: view.byteLength, ecrit: out,
}));

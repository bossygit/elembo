// Prépare les gabarits de zones destinés à l'interface : détoure le fond blanc des
// planches `uv-*.png` (silhouette + grille + annotations) et publie des PNG TRANSPARENTS
// dans public/zones/.
//
// Pourquoi : dans l'éditeur et les vignettes, le gabarit est superposé au vêtement. Un fond
// blanc opaque rendrait le drapé invisible ou teinterait toute la zone ; détouré, il ne
// laisse que la silhouette et les repères, qui restent lisibles sur un tissu clair comme
// sur un tissu sombre.
//
//   node scripts/prepare-zone-templates.mjs
//
// Le détourage est fait ici, sans dépendance : décodage PNG (filtres 0-4), remise à zéro de
// l'alpha des pixels blancs, ré-encodage RGBA. `sips` réduit ensuite la définition.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(racine, 'assets', '3d', 'elembo-tshirt');
const cible = join(racine, 'public', 'zones');
const temporaire = join(racine, '.zone-templates-tmp');
mkdirSync(cible, { recursive: true });
mkdirSync(temporaire, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const octet of buffer) c = CRC_TABLE[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([longueur, typeBuf, data, crc]);
}

/** Décode un PNG 8 bits RGB/RGBA sans entrelacement en RGBA. */
function decoderPng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('pas un PNG');
  let position = 8;
  let largeur = 0;
  let hauteur = 0;
  let canaux = 0;
  const morceaux = [];
  while (position < buffer.length) {
    const longueur = buffer.readUInt32BE(position);
    const type = buffer.subarray(position + 4, position + 8).toString('ascii');
    const donnees = buffer.subarray(position + 8, position + 8 + longueur);
    position += 12 + longueur;
    if (type === 'IHDR') {
      largeur = donnees.readUInt32BE(0);
      hauteur = donnees.readUInt32BE(4);
      if (donnees[8] !== 8) throw new Error(`profondeur non gérée : ${donnees[8]}`);
      const typeCouleur = donnees[9];
      canaux = typeCouleur === 6 ? 4 : typeCouleur === 2 ? 3 : 0;
      if (!canaux) throw new Error(`type de couleur non géré : ${typeCouleur}`);
      if (donnees[12] !== 0) throw new Error('PNG entrelacé non géré');
    } else if (type === 'IDAT') {
      morceaux.push(donnees);
    } else if (type === 'IEND') {
      break;
    }
  }
  const brut = inflateSync(Buffer.concat(morceaux));
  const octetsParPixel = canaux;
  const ligneLongueur = largeur * octetsParPixel;
  const sortie = Buffer.alloc(largeur * hauteur * 4);
  let precedent = Buffer.alloc(ligneLongueur);
  let offset = 0;
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[offset++];
    const ligne = Buffer.from(brut.subarray(offset, offset + ligneLongueur));
    offset += ligneLongueur;
    for (let x = 0; x < ligneLongueur; x++) {
      const gauche = x >= octetsParPixel ? ligne[x - octetsParPixel] : 0;
      const haut = precedent[x];
      const hautGauche = x >= octetsParPixel ? precedent[x - octetsParPixel] : 0;
      switch (filtre) {
        case 0:
          break;
        case 1:
          ligne[x] = (ligne[x] + gauche) & 0xff;
          break;
        case 2:
          ligne[x] = (ligne[x] + haut) & 0xff;
          break;
        case 3:
          ligne[x] = (ligne[x] + ((gauche + haut) >> 1)) & 0xff;
          break;
        case 4: {
          const p = gauche + haut - hautGauche;
          const pa = Math.abs(p - gauche);
          const pb = Math.abs(p - haut);
          const pc = Math.abs(p - hautGauche);
          const pred = pa <= pb && pa <= pc ? gauche : pb <= pc ? haut : hautGauche;
          ligne[x] = (ligne[x] + pred) & 0xff;
          break;
        }
        default:
          throw new Error(`filtre PNG inconnu : ${filtre}`);
      }
    }
    precedent = ligne;
    for (let x = 0; x < largeur; x++) {
      const s = x * octetsParPixel;
      const d = (y * largeur + x) * 4;
      sortie[d] = ligne[s];
      sortie[d + 1] = ligne[s + 1];
      sortie[d + 2] = ligne[s + 2];
      sortie[d + 3] = octetsParPixel === 4 ? ligne[s + 3] : 255;
    }
  }
  return { largeur, hauteur, pixels: sortie };
}

/** Encode un PNG RGBA 8 bits, filtre 0 (simple : ces planches sont temporaires). */
function encoderPng({ largeur, hauteur, pixels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const ligneLongueur = largeur * 4;
  const brut = Buffer.alloc((ligneLongueur + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * (ligneLongueur + 1)] = 0;
    pixels.copy(brut, y * (ligneLongueur + 1) + 1, y * ligneLongueur, (y + 1) * ligneLongueur);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rend transparents les pixels de fond (blanc ou quasi blanc). */
function detourer({ largeur, hauteur, pixels }) {
  let transparents = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    // Les lignes de grille (≈ 200-240) et la silhouette rose sont conservées : seul le
    // blanc du fond (≥ 250 sur les trois canaux) disparaît.
    if (r >= 250 && g >= 250 && b >= 250) {
      pixels[i + 3] = 0;
      transparents++;
    }
  }
  return { largeur, hauteur, pixels, transparents };
}

const zones = ['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'];
let total = 0;
for (const zone of zones) {
  const entree = join(source, `uv-${zone}.png`);
  const decode = decoderPng(readFileSync(entree));
  const detoure = detourer(decode);
  const provisoire = join(temporaire, `${zone}.png`);
  writeFileSync(provisoire, encoderPng(detoure));
  const sortie = join(cible, `${zone}.png`);
  // `sips` conserve le canal alpha lors de la réduction.
  copyFileSync(provisoire, sortie);
  execFileSync('sips', ['-Z', '560', sortie, '--out', sortie], { stdio: 'ignore' });
  const octets = readFileSync(sortie).length;
  total += octets;
  console.log(`${zone}.png — ${detoure.largeur}×${detoure.hauteur} → 560 px, ${Math.round(octets / 1024)} Ko`);
}
rmSync(temporaire, { recursive: true, force: true });
console.log(`Gabarits détourés dans public/zones (${Math.round(total / 1024)} Ko au total).`);

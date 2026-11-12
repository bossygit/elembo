// Génère les fichiers de test du studio (PNG transparent et JPEG) sans dépendance.
//
// Le PNG est encodé à la main (IHDR + IDAT zlib + IEND) : cela permet de tester la
// transparence réelle (canal alpha) sans installer de bibliothèque graphique.
//
//   node scripts/e2e/make-fixtures.mjs
//
// Sorties : tests/fixtures/logo-transparent.png, tests/fixtures/photo-opaque.jpg

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sortie = join(racine, 'tests', 'fixtures');
mkdirSync(sortie, { recursive: true });

/* ------------------------------------------------------------------ PNG RGBA ---- */

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

function pngRgba(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  // Chaque ligne est préfixée par un octet de filtre (0 = aucun).
  const brut = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    brut[y * (width * 4 + 1)] = 0;
    pixels.copy(brut, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Logo « studio » : disque orange plein, anneau et croix, sur fond TRANSPARENT. */
function logoTransparent(taille = 900) {
  const pixels = Buffer.alloc(taille * taille * 4);
  const centre = taille / 2;
  const rayon = taille * 0.34;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const dx = x - centre;
      const dy = y - centre;
      const distance = Math.hypot(dx, dy);
      const dansDisque = distance <= rayon;
      const dansAnneau = distance <= rayon * 1.12 && distance >= rayon * 0.96;
      const dansCroix = (Math.abs(dx) < rayon * 0.08 && Math.abs(dy) < rayon * 0.38) ||
        (Math.abs(dy) < rayon * 0.08 && Math.abs(dx) < rayon * 0.38);
      if (dansAnneau) {
        pixels[i] = 0x11;
        pixels[i + 1] = 0x0d;
        pixels[i + 2] = 0x15;
        pixels[i + 3] = 255;
      } else if (dansDisque) {
        pixels[i] = 0xff;
        pixels[i + 1] = 0x5a;
        pixels[i + 2] = 0x12;
        pixels[i + 3] = 255;
      } else if (dansCroix) {
        pixels[i] = 0x11;
        pixels[i + 1] = 0x0d;
        pixels[i + 2] = 0x15;
        pixels[i + 3] = 255;
      }
      // Hors du logo : alpha 0 (transparent).
    }
  }
  return pngRgba(taille, taille, pixels);
}

/* ------------------------------------------------------------------- JPEG ------ */

/**
 * JPEG minimal : entête + commentaire. Volontairement non décodable comme image de
 * production — sert seulement à vérifier que l'upload d'un JPG opaque est accepté par
 * l'interface (le navigateur, lui, reçoit une vraie photo dans l'usage réel).
 */
function jpegOpaque() {
  // Un JPEG gris 1×1 valide, suffisant pour un test de type MIME (les dimensions, elles,
  // seraient refusées par la règle des 500 px : ce fichier n'est pas utilisé dans l'E2E).
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
      'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64',
  );
}

writeFileSync(join(sortie, 'logo-transparent.png'), logoTransparent());
writeFileSync(join(sortie, 'photo-opaque.jpg'), jpegOpaque());
console.log(`Fixtures écrites dans ${sortie}`);

// Générateur de mockups placeholder Elembo — encodeur PNG minimal (Node pur,
// zlib natif, aucun dépendance). Aplats seulement (style smartvision.cg :
// pas de dégradés), calés sur les zones d'impression de src/lib/products.ts.
//
// Usage : node scripts/gen-mockups.mjs  → écrit public/mockups/*.png

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'mockups');

// ---------- encodeur PNG minimal ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, pixels /* Uint8Array RGBA */) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filtre none
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = rowStart + 1 + x * 4;
      raw[d] = pixels[s];
      raw[d + 1] = pixels[s + 1];
      raw[d + 2] = pixels[s + 2];
      raw[d + 3] = pixels[s + 3];
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- mini canevas à aplats ----------
function makeCanvas(w, h, bg) {
  const px = new Uint8Array(w * h * 4);
  const [r, g, b] = bg;
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  return {
    w,
    h,
    px,
    rect(x0, y0, x1, y1, color, alpha = 255) {
      for (let y = Math.max(0, y0 | 0); y < Math.min(h, y1 | 0); y++) {
        for (let x = Math.max(0, x0 | 0); x < Math.min(w, x1 | 0); x++) {
          const i = (y * w + x) * 4;
          px[i] = color[0];
          px[i + 1] = color[1];
          px[i + 2] = color[2];
          px[i + 3] = alpha;
        }
      }
    },
    save(name) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, name), encodePNG(w, h, px));
      console.log(`  écrit public/mockups/${name} (${w}×${h})`);
    },
  };
}

const BG = [0xf5, 0xf5, 0xf5]; // fond studio neutre
const WHITE = [0xff, 0xff, 0xff];
const GREY = [0xe4, 0xe4, 0xe4]; // détails (col, bouton)
const DARK = [0x05, 0x15, 0x1b]; // cadre tableau / ombres
const SHADOW = [0x05, 0x15, 0x1b]; // utilisé en alpha faible

// ---------- 1. T-shirt blanc (1200×1400) ----------
// zone products.ts : {x:0.36, y:0.28, w:0.28, h:0.28} → px 432..768, 392..784
{
  const c = makeCanvas(1200, 1400, BG);
  c.rect(320, 1380, 940, 1400, SHADOW, 18); // ombre portée au sol
  c.rect(280, 330, 390, 650, WHITE); // manche gauche
  c.rect(910, 330, 1020, 650, WHITE); // manche droite
  c.rect(380, 300, 920, 1260, WHITE); // torse
  c.rect(540, 300, 760, 355, GREY); // encolure
  c.rect(280, 330, 300, 360, GREY); // couture manche G
  c.rect(1000, 330, 1020, 360, GREY); // couture manche D
  c.rect(432, 392, 768, 784, SHADOW, 8); // léger voile zone (repère visuel)
  c.save('tshirt-blanc.png');
}

// ---------- 2. Casquette blanche (1200×900) ----------
// zone products.ts : {x:0.40, y:0.35, w:0.20, h:0.16} → px 480..720, 315..459
{
  const c = makeCanvas(1200, 900, BG);
  c.rect(300, 850, 1050, 900, SHADOW, 15); // ombre au sol
  c.rect(350, 220, 860, 545, WHITE); // calotte
  c.rect(350, 530, 1030, 615, WHITE); // visière
  c.rect(350, 530, 1030, 545, GREY); // liseré visière
  c.rect(590, 205, 625, 235, GREY); // bouton sommet
  c.rect(596, 240, 619, 545, GREY); // couture centrale
  c.rect(480, 315, 720, 459, SHADOW, 8); // léger voile zone (repère visuel)
  c.save('casquette-blanche.png');
}

// ---------- 3. Tableau mural (1000×1300) ----------
// zone products.ts : {x:0.30, y:0.18, w:0.40, h:0.55} → px 300..700, 234..949
{
  const c = makeCanvas(1000, 1300, [0xef, 0xea, 0xe2]); // mur chaud
  c.rect(260, 990, 760, 1015, SHADOW, 25); // ombre sous cadre
  c.rect(270, 204, 730, 979, DARK); // cadre
  c.rect(300, 234, 700, 949, WHITE); // toile (zone imprimable, exact)
  c.save('tableau-mural.png');
}

console.log('Mockups générés.');

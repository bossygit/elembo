// Design de test Elembo — PNG 800×600 orange à aplats (pour l'E2E du studio).
// Usage : node scripts/gen-test-design.mjs  → /tmp/elembo-design-test.png

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePNG = (w, h, px) => {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (1 + w * 4) + 1 + x * 4;
      raw[d] = px[s];
      raw[d + 1] = px[s + 1];
      raw[d + 2] = px[s + 2];
      raw[d + 3] = px[s + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', (() => { const b = Buffer.alloc(13); b.writeUInt32BE(w); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = 6; return b; })()),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const W = 800, H = 600;
const px = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    // fond orange accent #E85F00, croix blanche centrale (test visuel d'orientation)
    if (Math.abs(x - W / 2) < 30 || Math.abs(y - H / 2) < 30) {
      px[i] = 0xff; px[i + 1] = 0xff; px[i + 2] = 0xff;
    } else {
      px[i] = 0xe8; px[i + 1] = 0x5f; px[i + 2] = 0x00;
    }
    px[i + 3] = 255;
  }
writeFileSync('/tmp/elembo-design-test.png', encodePNG(W, H, px));
console.log('design de test écrit : /tmp/elembo-design-test.png (800×600)');

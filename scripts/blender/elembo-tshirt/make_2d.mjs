// Gabarits UV (uv-*.png) et visuels de test (qc/test-*.png) du T-shirt Elembo.
//
//   node scripts/blender/elembo-tshirt/make_2d.mjs
//
// Lit assets/3d/elembo-tshirt/zones.json et _uv.json (export_uv.py), dessine en SVG,
// puis rend en PNG avec Chrome sans interface (fond transparent pour les visuels de test).
//
// Convention : l'image est posée « à l'endroit » (haut de l'image = haut du vêtement,
// côté col ; pour les manches, haut = épaule). C'est la convention glTF (origine des UV
// en haut à gauche) : dans Three.js, la texture doit garder flipY = false.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const DIR = join(ROOT, 'assets/3d/elembo-tshirt');
const QC = join(DIR, 'qc');
mkdirSync(QC, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const meta = JSON.parse(readFileSync(join(DIR, 'zones.json'), 'utf8'));
const uv = JSON.parse(readFileSync(join(DIR, '_uv.json'), 'utf8'));

const LABELS = {
  front: { titre: 'ZONE 01 — DEVANT', vue: 'vu de face', gauche: 'côté droit du porteur', droite: 'côté gauche du porteur', test: 'DEVANT', couleur: '#FF5A12' },
  back: { titre: 'ZONE 02 — DOS', vue: 'vu de dos', gauche: 'côté gauche du porteur', droite: 'côté droit du porteur', test: 'DOS', couleur: '#2B44FF' },
  left_sleeve: { titre: 'ZONE 03 — MANCHE GAUCHE', vue: 'vue de l’extérieur (côté gauche du porteur)', gauche: 'avant', droite: 'arrière', test: 'MANCHE G', couleur: '#FF4F8B' },
  right_sleeve: { titre: 'ZONE 04 — MANCHE DROITE', vue: 'vue de l’extérieur (côté droit du porteur)', gauche: 'arrière', droite: 'avant', test: 'MANCHE D', couleur: '#0F6B4C' },
  collar: { titre: 'ZONE 05 — INTÉRIEUR DU COL', vue: 'vu de l’intérieur, depuis l’avant', gauche: '', droite: '', test: 'COL', couleur: '#110D15' },
};
const NUM = { front: '01', back: '02', left_sleeve: '03', right_sleeve: '04', collar: '05' };

function render(svg, w, h, out, transparent) {
  const html = join(tmpdir(), `elembo-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(
    html,
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${transparent ? 'transparent' : '#fff'}}svg{display:block}</style>${svg}`,
  );
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--window-size=${w},${h}`,
    `--screenshot=${out}`,
    `file://${html}`,
  ], { stdio: 'ignore' });
}

const font = `font-family="Helvetica Neue, Arial, sans-serif"`;

function grid(w, h, pxPerCm, step, color, width) {
  let s = '';
  for (let x = 0; x <= w + 0.5; x += step * pxPerCm) s += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${color}" stroke-width="${width}"/>`;
  for (let y = h; y >= -0.5; y -= step * pxPerCm) s += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${color}" stroke-width="${width}"/>`;
  return s;
}

for (const [zone, z] of Object.entries(meta.zones)) {
  const L = LABELS[zone];
  const [tw, th] = z.recommended_texture_px;
  // Gabarit : au moins 2000 px sur le grand côté.
  const k = 2000 / Math.max(tw, th);
  const W = Math.round(tw * k);
  const H = Math.round(th * k);
  const pxPerCm = W / z.print_width_cm;
  const P = ([u, v]) => `${(u * W).toFixed(1)},${((1 - v) * H).toFixed(1)}`;

  const faces = uv[zone].faces.map((f) => `<polygon points="${f.map(P).join(' ')}"/>`).join('');
  const outline = uv[zone].outline.map(([a, b]) => `<line x1="${P(a).split(',')[0]}" y1="${P(a).split(',')[1]}" x2="${P(b).split(',')[0]}" y2="${P(b).split(',')[1]}"/>`).join('');
  const fs = Math.round(Math.min(W, H) * 0.035);
  const svgUV = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${grid(W, H, pxPerCm, 1, '#f1eee8', 1)}
  ${grid(W, H, pxPerCm, 5, '#dcd6cb', 1.5)}
  <g fill="#fdebe2" stroke="#f3b394" stroke-width="0.6">${faces}</g>
  <g stroke="#110d15" stroke-width="3" stroke-linecap="round">${outline}</g>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" fill="none" stroke="#110d15" stroke-width="3" stroke-dasharray="14 10"/>
  <g ${font} fill="#110d15">
    <text x="${fs}" y="${fs * 1.6}" font-size="${fs}" font-weight="700">${L.titre}</text>
    <text x="${fs}" y="${fs * 2.8}" font-size="${fs * 0.62}">${z.print_width_cm} × ${z.print_height_cm} cm · ratio ${z.aspect} · texture conseillée ${tw} × ${th} px · ${L.vue}</text>
    <text x="${fs}" y="${fs * 3.8}" font-size="${fs * 0.62}">Grille : 1 cm / 5 cm · Surface rose = tissu imprimable · Hors silhouette : transparent</text>
    <text x="${W - fs}" y="${fs * 1.6}" font-size="${fs * 0.8}" text-anchor="end" font-weight="700">↑ HAUT</text>
    ${L.gauche ? `<text x="${fs}" y="${H - fs}" font-size="${fs * 0.62}">← ${L.gauche}</text>` : ''}
    ${L.droite ? `<text x="${W - fs}" y="${H - fs}" font-size="${fs * 0.62}" text-anchor="end">${L.droite} →</text>` : ''}
  </g>
</svg>`;
  render(svgUV, W, H, join(DIR, `uv-${zone.replace('_', '-')}.png`), false);

  // Visuel de test : transparent, asymétrique (texte lisible, flèche, « R »), cercle et
  // grille en centimètres pour juger de la déformation.
  const c = L.couleur;
  const cx = tw / 2;
  const cy = th / 2;
  const r = Math.min(tw, th) * 0.18;
  const tfs = Math.round(Math.min(tw, th) * (zone === 'collar' ? 0.2 : 0.13));
  const ppc = tw / z.print_width_cm;
  const u = Math.min(tw, th) * 0.12; // flèche « haut » proportionnée à la zone
  const svgTest = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}">
  <g opacity="0.55">${grid(tw, th, ppc, 5, c, Math.max(1, ppc * 0.12))}</g>
  <rect x="${ppc * 0.4}" y="${ppc * 0.4}" width="${tw - ppc * 0.8}" height="${th - ppc * 0.8}" fill="none" stroke="${c}" stroke-width="${ppc * 0.5}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${ppc * 0.6}"/>
  <g ${font} font-weight="800" text-anchor="middle" fill="${c}">
    <text x="${cx}" y="${cy - r - tfs * 0.4}" font-size="${tfs}">${L.test}</text>
    <text x="${cx}" y="${cy + tfs * 0.36}" font-size="${tfs * 1.1}">R ${NUM[zone]}</text>
    <text x="${cx}" y="${cy + r + tfs * 1.1}" font-size="${tfs * 0.55}">ELEMBO · TEST</text>
  </g>
  <g fill="${c}" transform="translate(${tw - u * 1.6} ${u * 0.5}) scale(${u / 10})">
    <polygon points="0,0 5,8 -5,8"/><rect x="-1.6" y="8" width="3.2" height="7"/>
  </g>
</svg>`;
  render(svgTest, tw, th, join(QC, `test-${zone.replace('_', '-')}.png`), true);
  console.log(zone, `gabarit ${W}×${H}`, `test ${tw}×${th}`);
}

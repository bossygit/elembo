// Télécharge les polices du configurateur et VÉRIFIE leur licence.
//
// Pourquoi pas next/font/google : 17 familles préchargées pèsent lourd sur une connexion
// mobile, et le build dépendrait du réseau. Ici les fichiers sont versionnés dans
// public/fonts/ (build reproductible, hors ligne), le CSS est servi sous un chemin
// RELATIF (donc valable sous n'importe quel basePath, GitHub Pages compris) et le
// navigateur ne télécharge une police que lorsqu'elle est réellement utilisée.
//
// Usage : node scripts/fetch-fonts.mjs [--verifier-seulement]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Catalogue des polices retenues : adaptées au textile, licence libre vérifiée. */
const FONTS = [
  { id: 'montserrat', name: 'Montserrat', google: 'Montserrat', category: 'sans', weights: [400, 700], slugs: ['montserrat'] },
  { id: 'poppins', name: 'Poppins', google: 'Poppins', category: 'sans', weights: [400, 700], slugs: ['poppins'] },
  { id: 'bebas-neue', name: 'Bebas Neue', google: 'Bebas Neue', category: 'sans', weights: [400], slugs: ['bebasneue'] },
  { id: 'oswald', name: 'Oswald', google: 'Oswald', category: 'sans', weights: [400, 700], slugs: ['oswald'] },
  { id: 'anton', name: 'Anton', google: 'Anton', category: 'sans', weights: [400], slugs: ['anton'] },
  { id: 'archivo-black', name: 'Archivo Black', google: 'Archivo Black', category: 'sans', weights: [400], slugs: ['archivoblack', 'archivo'] },
  { id: 'bangers', name: 'Bangers', google: 'Bangers', category: 'display', weights: [400], slugs: ['bangers'] },
  { id: 'righteous', name: 'Righteous', google: 'Righteous', category: 'display', weights: [400], slugs: ['righteous'] },
  { id: 'russo-one', name: 'Russo One', google: 'Russo One', category: 'display', weights: [400], slugs: ['russoone'] },
  { id: 'alfa-slab-one', name: 'Alfa Slab One', google: 'Alfa Slab One', category: 'display', weights: [400], slugs: ['alfaslabone'] },
  { id: 'pacifico', name: 'Pacifico', google: 'Pacifico', category: 'script', weights: [400], slugs: ['pacifico'] },
  { id: 'lobster', name: 'Lobster', google: 'Lobster', category: 'script', weights: [400], slugs: ['lobster'] },
  { id: 'caveat', name: 'Caveat', google: 'Caveat', category: 'script', weights: [400, 700], slugs: ['caveat'] },
  { id: 'permanent-marker', name: 'Permanent Marker', google: 'Permanent Marker', category: 'script', weights: [400], slugs: ['permanentmarker'] },
  { id: 'playfair-display', name: 'Playfair Display', google: 'Playfair Display', category: 'serif', weights: [400, 700], slugs: ['playfairdisplay'] },
  { id: 'bodoni-moda', name: 'Bodoni Moda', google: 'Bodoni Moda', category: 'serif', weights: [400, 700], slugs: ['bodonimoda'] },
  { id: 'dm-serif-display', name: 'DM Serif Display', google: 'DM Serif Display', category: 'serif', weights: [400], slugs: ['dmserifdisplay'] },
];

/** Sous-ensembles conservés : français courant + caractères étendus (œ, €, —). */
const SUBSETS = ['latin', 'latin-ext'];

const OUT_DIR = 'public/fonts';
const verifierSeulement = process.argv.includes('--verifier-seulement');

async function get(url, asText = true) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

/** Licence : cherche le fichier officiel dans le dépôt google/fonts. */
async function licence(slugs) {
  for (const slug of slugs) {
    for (const [dir, fichier, nom] of [
      ['ofl', 'OFL.txt', 'OFL-1.1'],
      ['apache', 'LICENSE.txt', 'Apache-2.0'],
      ['ufl', 'UFL.txt', 'UFL-1.0'],
    ]) {
      const url = `https://raw.githubusercontent.com/google/fonts/main/${dir}/${slug}/${fichier}`;
      try {
        const texte = await get(url);
        if (dir === 'ofl' && !/SIL OPEN FONT LICENSE/i.test(texte)) continue;
        if (dir === 'apache' && !/Apache License/i.test(texte)) continue;
        if (dir === 'ufl' && !/Ubuntu Font Licence/i.test(texte)) continue;
        return { nom, url };
      } catch {
        // slug suivant
      }
    }
  }
  return null;
}

/** CSS Google → blocs @font-face utiles (latin, latin-ext). */
function blocsUtiles(css) {
  const blocs = [];
  const parties = css.split('/*').slice(1);
  for (const partie of parties) {
    const sousEnsemble = partie.slice(0, partie.indexOf('*/')).trim();
    if (!SUBSETS.includes(sousEnsemble)) continue;
    const fin = partie.indexOf('}');
    if (fin === -1) continue;
    const corps = partie.slice(0, fin);
    const url = /url\((https:[^)]+\.woff2)\)/.exec(corps)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(corps)?.[1] ?? '400';
    const unicode = /unicode-range:\s*([^;]+);/.exec(corps)?.[1]?.trim();
    if (url) blocs.push({ sousEnsemble, url, weight, unicode });
  }
  return blocs;
}

const RESULTATS = [];
mkdirSync(OUT_DIR, { recursive: true });
let css = `/* Polices du configurateur — généré par scripts/fetch-fonts.mjs.\n   Fichiers locaux : aucune requête vers Google au chargement de la page.\n   Chaque police n'est téléchargée par le navigateur que lorsqu'elle est utilisée. */\n\n`;

for (const font of FONTS) {
  process.stdout.write(`${font.name.padEnd(18)} `);
  const lic = await licence(font.slugs);
  if (!lic) {
    console.log('✗ LICENCE INTROUVABLE — police écartée');
    RESULTATS.push({ ...font, licence: null, fichiers: [] });
    continue;
  }

  const famille = encodeURIComponent(font.google).replace(/%20/g, '+');
  const api = `https://fonts.googleapis.com/css2?family=${famille}:wght@${font.weights.join(';')}&display=swap`;
  let blocs = [];
  try {
    blocs = blocsUtiles(await get(api));
  } catch (e) {
    console.log(`✗ ${e.message}`);
    RESULTATS.push({ ...font, licence: lic, fichiers: [] });
    continue;
  }
  if (!blocs.length) {
    console.log('✗ aucun fichier woff2 trouvé');
    RESULTATS.push({ ...font, licence: lic, fichiers: [] });
    continue;
  }

  const fichiers = [];
  for (const bloc of blocs) {
    const nom = `${font.id}-${bloc.weight}-${bloc.sousEnsemble}.woff2`;
    const chemin = join(OUT_DIR, nom);
    if (!existsSync(chemin) || !verifierSeulement) {
      const data = await get(bloc.url, false);
      writeFileSync(chemin, data);
    }
    fichiers.push(nom);
    css += `@font-face {\n  font-family: '${font.name}';\n  font-style: normal;\n  font-weight: ${bloc.weight};\n  font-display: swap;\n  src: url('./${nom}') format('woff2');\n${bloc.unicode ? `  unicode-range: ${bloc.unicode};\n` : ''}}\n\n`;
  }
  console.log(`✓ ${lic.nom} — ${fichiers.length} fichier(s)`);
  RESULTATS.push({ ...font, licence: lic, fichiers });
}

writeFileSync(join(OUT_DIR, 'fonts.css'), css);

const utilisables = RESULTATS.filter((f) => f.fichiers.length);
const ts = `// GÉNÉRÉ par scripts/fetch-fonts.mjs — ne pas modifier à la main.
// Chaque police a sa licence vérifiée (fichier officiel du dépôt google/fonts).

export type FontCategory = 'sans' | 'display' | 'script' | 'serif';

export type FontDefinition = {
  id: string;
  name: string;
  /** Nom de famille CSS à utiliser dans ctx.font. */
  family: string;
  category: FontCategory;
  weights: number[];
  /** Licence vérifiée — usage commercial autorisé. */
  license: string;
  licenseUrl: string;
};

export const FONTS: FontDefinition[] = [
${utilisables
  .map(
    (f) =>
      `  {\n    id: ${JSON.stringify(f.id)},\n    name: ${JSON.stringify(f.name)},\n    family: ${JSON.stringify(f.name)},\n    category: ${JSON.stringify(f.category)},\n    weights: [${f.weights.join(', ')}],\n    license: ${JSON.stringify(f.licence.nom)},\n    licenseUrl: ${JSON.stringify(f.licence.url)},\n  },`,
  )
  .join('\n')}
];
`;
writeFileSync('src/lib/fonts.generated.ts', ts);

console.log(`\n${utilisables.length}/${FONTS.length} polices installées · ${OUT_DIR}/fonts.css · src/lib/fonts.generated.ts`);
const ecartees = RESULTATS.filter((f) => !f.fichiers.length);
if (ecartees.length) console.log('Écartées :', ecartees.map((f) => f.name).join(', '));

// Génère src/lib/banner/polices.generated.ts : ascendante et descendante (table hhea) de chaque
// police du site, en em. L'éditeur et le PDF placent les lignes de base avec ces mêmes valeurs.
//
// Usage : node scripts/generer-metriques-polices.mjs
//
// Le WOFF2 est lu sans dépendance : les tables `head` et `hhea` n'y sont jamais transformées, il
// suffit de décompresser le flux Brotli et de se placer au bon décalage.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'public/fonts');

// Ordre imposé par la spécification WOFF2 (§4.1) : l'indice vaut sur 6 bits, 63 = étiquette libre.
const TABLES = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function tablesWoff2(octets) {
  if (octets.toString('latin1', 0, 4) !== 'wOF2') throw new Error('signature WOFF2 absente');
  const nb = octets.readUInt16BE(12);
  const compresse = octets.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const o = octets[p++];
      v = v * 128 + (o & 0x7f);
      if (!(o & 0x80)) return v;
    }
    throw new Error('entier base 128 invalide');
  };
  const entrees = [];
  for (let i = 0; i < nb; i++) {
    const drapeau = octets[p++];
    const indice = drapeau & 0x3f;
    let nom = TABLES[indice];
    if (indice === 63) {
      nom = octets.toString('latin1', p, p + 4);
      p += 4;
    }
    const version = drapeau >> 6;
    let taille = base128();
    // glyf et loca sont transformées en version 0 ; les autres tables en version non nulle.
    if (nom === 'glyf' || nom === 'loca' ? version === 0 : version !== 0) taille = base128();
    entrees.push({ nom, taille });
  }
  const flux = brotliDecompressSync(octets.subarray(p, p + compresse));
  const tables = {};
  let d = 0;
  for (const e of entrees) {
    tables[e.nom] = flux.subarray(d, d + e.taille);
    d += e.taille;
  }
  return tables;
}

const metriques = {};
for (const fichier of readdirSync(dossier).filter((f) => f.endsWith('-latin.woff2')).sort()) {
  const [, id, graisse] = fichier.match(/^(.+)-(\d+)-latin\.woff2$/);
  const { head, hhea } = tablesWoff2(readFileSync(join(dossier, fichier)));
  const em = head.readUInt16BE(18);
  const arrondi = (v) => Math.round((v / em) * 1e6) / 1e6;
  (metriques[id] ??= {})[graisse] = { ascendante: arrondi(hhea.readInt16BE(4)), descendante: arrondi(hhea.readInt16BE(6)) };
}

const lignes = Object.entries(metriques).map(([id, parGraisse]) => {
  const v = Object.entries(parGraisse).map(([g, m]) => `${g}: { ascendante: ${m.ascendante}, descendante: ${m.descendante} }`);
  return `  '${id}': { ${v.join(', ')} },`;
});
writeFileSync(
  join(racine, 'src/lib/banner/polices.generated.ts'),
  `// GÉNÉRÉ par scripts/generer-metriques-polices.mjs — ne pas modifier à la main.
// Métriques verticales (table hhea) des polices de public/fonts, en em.

import type { MetriquesPolice } from './layout';

export const METRIQUES: Record<string, Partial<Record<400 | 700, MetriquesPolice>>> = {
${lignes.join('\n')}
};
`,
);
console.log(`${Object.keys(metriques).length} familles`, JSON.stringify(metriques.anton), JSON.stringify(metriques['dm-serif-display']), JSON.stringify(metriques['bebas-neue']));

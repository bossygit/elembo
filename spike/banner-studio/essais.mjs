// Lot 0 — essais de production (§7.9 de l'audit). Usage : node spike/banner-studio/essais.mjs <dossier-sortie>
// Écrit les PDF d'essai, un rapport JSON et les métriques partagées pour l'éditeur Konva.
// PROTOTYPE JETABLE : ne pas fusionner.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';

import { documentHommage, POLICES } from './document.mjs';
import { metriquesPolice, rendrePdf, verifierPdf } from './rendu-pdf.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..');
const sortie = process.argv[2];
if (!sortie) throw new Error('Usage : node essais.mjs <dossier-sortie>');
mkdirSync(sortie, { recursive: true });

const polices = Object.fromEntries(Object.entries(POLICES).map(([id, p]) => [id, readFileSync(join(ici, 'polices', p.fichier))]));
const images = {
  portrait: readFileSync(join(racine, 'public/mockups/tableau-interieur.jpg')),
  logo: readFileSync(join(racine, 'tests/fixtures/logo-transparent.png')),
};
const ressources = { polices, images };
const sha = (o) => createHash('sha256').update(o).digest('hex').slice(0, 16);

const rapport = { date: new Date().toISOString(), node: process.version, essais: [] };

async function essai(nom, doc, options, attendu) {
  global.gc?.();
  const avant = process.memoryUsage().rss;
  const t0 = performance.now();
  try {
    const r = await rendrePdf(doc, ressources, options);
    const duree = Math.round(performance.now() - t0);
    const pic = Math.round((process.memoryUsage().rss - avant) / 1048576);
    const v = await verifierPdf(r.octets);
    writeFileSync(join(sortie, `${nom}.pdf`), r.octets);
    const ligne = { nom, ok: true, dureeMs: duree, memoireMo: pic, tailleKo: Math.round(v.taille / 1024), sha: sha(r.octets), plan: r.plan, userUnit: r.userUnit, ...v };
    ligne.verdict = attendu(ligne);
    rapport.essais.push(ligne);
    return { ligne, r };
  } catch (e) {
    const ligne = { nom, ok: false, erreur: e.message };
    ligne.verdict = attendu(ligne);
    rapport.essais.push(ligne);
    return { ligne };
  }
}

const proche = (a, b, tol) => Math.abs(a - b) <= tol;

await essai('3x1m', documentHommage({ largeurMm: 3000, hauteurMm: 1000 }), {}, (l) =>
  l.ok && l.pages.length === 1 && proche(l.pages[0].mediaPt[0], 8503.94, 0.2) && proche(l.pages[0].mediaPt[1], 2834.65, 0.2) && l.policesEmbarquees === 3 && l.images === 3);
// 3 images attendues : le JPEG, le PNG et son masque alpha (SMask).

await essai('5x1m', documentHommage({ largeurMm: 5000, hauteurMm: 1000 }), {}, (l) =>
  l.ok && l.pages.length === 1 && proche(l.pages[0].mediaPt[0], 14173.23, 0.2));

await essai('6x1m-panneaux', documentHommage({ largeurMm: 6000, hauteurMm: 1000 }), {}, (l) =>
  l.ok && l.pages.length === 2 && l.plan[1].debutMm > 0 && proche(l.plan[0].longueurMm + l.plan[1].longueurMm - 20, 6000, 0.2));

await essai('6x1m-userunit', documentHommage({ largeurMm: 6000, hauteurMm: 1000 }), { mode: 'USERUNIT' }, (l) =>
  l.ok && l.pages.length === 1 && l.userUnit === 2 && proche(l.pages[0].mediaMm[0], 6000, 0.2));

await essai('portrait-0,85x2m', documentHommage({ largeurMm: 850, hauteurMm: 2000 }), {}, (l) =>
  l.ok && proche(l.pages[0].mediaMm[0], 850, 0.1) && proche(l.pages[0].mediaMm[1], 2000, 0.1));

await essai('3x1m-fond-perdu-10', documentHommage({ largeurMm: 3000, hauteurMm: 1000, fondPerduMm: 10 }), {}, (l) =>
  l.ok && proche(l.pages[0].trimMm[0], 3000, 0.1) && proche(l.pages[0].bleedMm[0], 3020, 0.1) && proche(l.pages[0].mediaMm[1], 1020, 0.1));

await essai('format-excessif-61x2m', documentHommage({ largeurMm: 61000, hauteurMm: 2000 }), {}, (l) => !l.ok && /FORMAT_SUR_DEVIS/.test(l.erreur));

const docGlyphe = documentHommage();
docGlyphe.elements.find((e) => e.id === 'nom').texte.contenu = 'Mɛ́ndɔ ŋkɔ́';
await essai('glyphes-manquants', docGlyphe, {}, (l) => !l.ok && /POLICE_GLYPHES/.test(l.erreur));

// Déterminisme : deux rendus du même document.
const d1 = await rendrePdf(documentHommage(), ressources);
const d2 = await rendrePdf(documentHommage(), ressources);
rapport.determinisme = { identique: sha(d1.octets) === sha(d2.octets), sha1: sha(d1.octets), sha2: sha(d2.octets) };

// Polices : le WOFF2 du site est-il utilisable par fontkit ? Couverture des caractères locaux.
const woff2 = join(racine, 'public/fonts/anton-400-latin.woff2');
try {
  const f = fontkit.create(readFileSync(woff2));
  rapport.woff2 = { ok: true, glyphes: f.numGlyphs, note: 'WOFF2 décodé (vérifier la complétude : fichier découpé par plage)' };
} catch (e) {
  rapport.woff2 = { ok: false, erreur: e.message };
}
const caracteres = 'ÀÂÉÈÊËÎÏÔÙÛÜÇŒœ€—–’«»…ɛɔŋ';
rapport.couverture = Object.fromEntries(Object.entries(POLICES).map(([id, p]) => {
  const f = fontkit.create(polices[id]);
  return [id, { famille: p.famille, manquants: [...caracteres].filter((ch) => !f.hasGlyphForCodePoint(ch.codePointAt(0))).join('') || '—' }];
}));

// Métriques partagées pour l'éditeur Konva.
const metriques = Object.fromEntries(Object.entries(POLICES).map(([id, p]) => [id, { famille: p.famille, ...metriquesPolice(fontkit.create(polices[id])) }]));
writeFileSync(join(ici, 'metriques.json'), `${JSON.stringify(metriques, null, 2)}\n`);
// Document de référence chargé tel quel par l'éditeur Konva (même source que le PDF 3x1m).
writeFileSync(join(ici, 'document-3x1.json'), `${JSON.stringify(documentHommage(), null, 2)}\n`);
writeFileSync(join(sortie, 'rapport.json'), `${JSON.stringify(rapport, null, 2)}\n`);

for (const e of rapport.essais) {
  console.log(`${e.verdict ? 'OK ' : 'KO '} ${e.nom.padEnd(24)} ${e.ok ? `${e.pages.length} p · ${e.pages.map((p) => p.mediaMm.join('×')).join(' + ')} mm · ${e.dureeMs} ms · ${e.tailleKo} Ko · polices ${e.policesEmbarquees} · images ${e.images}` : e.erreur}`);
}
console.log('déterminisme :', rapport.determinisme);
console.log('woff2 :', rapport.woff2);
console.log('couverture (manquants) :', Object.entries(rapport.couverture).map(([id, c]) => `${id}: ${c.manquants}`).join(' | '));

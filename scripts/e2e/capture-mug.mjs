// Captures du studio Mug pour le guide d'utilisation (Chrome headless, CDP).
// Usage : node scripts/e2e/capture-mug.mjs

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAPTURES = join(racine, 'docs', 'captures');
const FIXTURE = join(racine, 'tests', 'fixtures', 'logo-transparent.png');
const BASE = process.env.STUDIO_URL ?? 'http://localhost:3000/personnalisation';

mkdirSync(CAPTURES, { recursive: true });
const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = await lancerChrome({ port: 9334 });
const page = await ouvrirPage(chrome, { width: 1440, height: 1000 });
try {
  await page.goto(`${BASE}?produit=mug-personnalise`);
  await page.attendre(
    `!!(window.__elembo3d && window.__elembo3d.zones && window.__elembo3d.zones().length === 1) && !document.body.innerText.includes('Chargement du modèle')`,
    { timeoutMs: 60000, message: 'modèle 3D du mug' },
  );
  await page.eval(
    `(() => { if (document.getElementById('elembo-guide-style')) return true; const style = document.createElement('style'); style.id = 'elembo-guide-style'; style.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(style); return true; })()`,
  );
  await attendre(1200);
  console.log('titre :', await page.eval(`document.querySelector('h1')?.textContent`));
  console.log('zones :', await page.eval(`window.__elembo3d.zones()`));
  await page.screenshot(join(CAPTURES, 'guide-mug-initial.png'));

  await page.envoyerFichiers('[data-testid="design-input"]', [FIXTURE]);
  await page.attendre(
    `document.body.innerText.includes('1 zone(s) personnalisée(s)') || document.body.innerText.includes('1 zone')`,
    { timeoutMs: 15000, message: 'logo posé' },
  );
  await attendre(1200);
  await page.screenshot(join(CAPTURES, 'guide-mug-logo.png'));

  // Onglet Produit : couleur de la céramique.
  await page.eval(
    `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Produit'); b?.click(); return !!b; })()`,
  );
  await attendre(600);
  await page.screenshot(join(CAPTURES, 'guide-mug-produit.png'));
  console.log('captures écrites dans', CAPTURES);
} finally {
  await page.close();
  await chrome.fermer();
}

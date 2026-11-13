// Captures complémentaires pour le guide : onglet Commande (T-shirt et mug).
// Usage : node scripts/e2e/capture-guide-commande.mjs

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

async function preparer(page, url, zones) {
  await page.goto(url);
  await page.attendre(
    `!!(window.__elembo3d && window.__elembo3d.zones && window.__elembo3d.zones().length === ${zones}) && !document.body.innerText.includes('Chargement du modèle')`,
    { timeoutMs: 60000, message: 'modèle 3D' },
  );
  await page.eval(
    `(() => { if (document.getElementById('elembo-guide-style')) return true; const style = document.createElement('style'); style.id = 'elembo-guide-style'; style.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(style); return true; })()`,
  );
  await page.envoyerFichiers('[data-testid="design-input"]', [FIXTURE]);
  await page.attendre(`document.body.innerText.includes('1 zone(s) personnalisée(s)')`, {
    timeoutMs: 15000,
    message: 'logo posé',
  });
  await page.eval(
    `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Commande'); b?.click(); return !!b; })()`,
  );
  await attendre(900);
}

const chrome = await lancerChrome({ port: 9335 });
try {
  const page = await ouvrirPage(chrome, { width: 1440, height: 1200 });
  await preparer(page, BASE, 5);
  await page.screenshot(join(CAPTURES, 'guide-commande-tshirt.png'));
  console.log('commande t-shirt :', await page.eval(`document.body.innerText.includes('Payer')`));

  await preparer(page, `${BASE}?produit=mug-personnalise`, 1);
  await page.screenshot(join(CAPTURES, 'guide-commande-mug.png'));
  console.log('commande mug :', await page.eval(`document.body.innerText.includes('Paiement en ligne pas encore ouvert')`));
  await page.close();
} finally {
  await chrome.fermer();
}

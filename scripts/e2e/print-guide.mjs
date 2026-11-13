// Imprime le guide HTML en PDF A4 avec un pied de page numéroté.
// Usage : node scripts/e2e/print-guide.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = join(racine, 'docs', 'guide-utilisation-elembo.html');
const sortie = join(racine, 'docs', 'guide-utilisation-elembo.pdf');

const chrome = await lancerChrome({ port: 9343 });
const page = await ouvrirPage(chrome, { width: 1200, height: 1600 });
try {
  await page.goto(`file://${source}`);
  await page.attendre(
    `document.readyState === 'complete' && [...document.images].every((img) => img.complete && img.naturalWidth > 0)`,
    { timeoutMs: 30000, message: 'images du guide' },
  );
  await page.eval(`document.fonts.ready.then(() => true)`);
  await new Promise((r) => setTimeout(r, 2500));

  const footer = `
    <div style="width:100%;padding:0 60px;font-family:Helvetica,Arial,sans-serif;font-size:7px;line-height:1.4;color:#d9480f;display:flex;justify-content:space-between;align-items:center;">
      <span>elembo. — Guide d’utilisation · Personnalisation T-shirt &amp; mug · Tableau de bord</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;

  const resultat = await page.envoyer('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: footer,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  });
  await writeFile(sortie, Buffer.from(resultat.data, 'base64'));
  console.log('PDF écrit :', sortie, `${(resultat.data.length * 0.75 / 1024 / 1024).toFixed(1)} Mo`);
} finally {
  await page.close();
  await chrome.fermer();
}

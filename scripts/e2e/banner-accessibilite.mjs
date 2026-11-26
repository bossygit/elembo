// Contrôle d'accessibilité du Banner Studio avec axe-core (WCAG 2.1 A et AA), sur ordinateur et
// sur téléphone : plan de travail, panneaux, fenêtres (modèles, projets, recadrage, aperçu,
// finalisation). Aucune écriture côté serveur.
//
//   STUDIO_URL=http://localhost:3000 node scripts/e2e/banner-accessibilite.mjs
//
// Échoue sur toute violation « serious » ou « critical ».

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const BASE = (process.env.STUDIO_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const LOGO = join(racine, 'tests', 'fixtures', 'logo-transparent.png');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
let graves = 0;

async function auditer(page, nom, contexte = 'body') {
  await page.eval(`(() => { if (!window.axe) (0, eval)(${JSON.stringify(AXE)}); return true; })()`);
  const r = await page.eval(`axe.run(${JSON.stringify(contexte)}, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })
    .then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, aide: v.help, cibles: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' — ' + (n.failureSummary || '').split('\\n')[1]?.trim()) })))`);
  const g = r.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  graves += g.length;
  console.log(`${g.length ? 'ÉCHEC' : 'OK  '} ${nom}${r.length ? ` — ${r.length} règle(s) : ${r.map((v) => `${v.id} (${v.impact})`).join(', ')}` : ''}`);
  for (const v of g) for (const c of v.cibles) console.log(`        ${v.id} : ${c}`);
}

function outils(page) {
  return {
    bouton: async (libelle, dans = 'body') => {
      const ok = await page.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(dans)} + ' button')].find((x) => (x.getAttribute('aria-label') ?? x.textContent.trim()) === ${JSON.stringify(libelle)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
      if (!ok) throw new Error(`Bouton absent : ${libelle}`);
      await attendre(400);
    },
    onglet: (nom) => page.eval(`(() => { [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent === ${JSON.stringify(nom)}).click(); return true; })()`).then(() => attendre(250)),
    ouvrir: async () => {
      await page.goto(`${BASE}/banderoles/studio`);
      await page.attendre(`!!document.querySelector('[data-testid="plan-de-travail"] canvas')`, { timeoutMs: 60000 });
      await attendre(1200);
    },
  };
}

const chrome = await lancerChrome({ port: 9398 });
try {
  const page = await ouvrirPage(chrome, { width: 1440, height: 900 });
  const o = outils(page);
  await o.ouvrir();
  await auditer(page, 'bureau : plan de travail vide');
  await o.bouton('Voir les modèles');
  await auditer(page, 'bureau : galerie des modèles', 'dialog[open]');
  await page.eval(`document.querySelector('[data-testid=modeles] button').click()`);
  await attendre(800);
  await auditer(page, 'bureau : variables d’un modèle', 'dialog[open]');
  await o.bouton('Utiliser ce modèle');
  await attendre(800);
  await o.onglet('Calques');
  await page.eval(`[...document.querySelectorAll('[data-testid="calques"] li button')].find((b) => b.textContent.startsWith('Photo'))?.click()`);
  await attendre(300);
  await page.envoyerFichiers('[data-testid="remplacer-image"]', [LOGO]);
  await page.attendre(`!!document.querySelector('[data-testid="qualite"]')`);
  await page.eval(`[...document.querySelectorAll('[data-testid="calques"] li button')].find((b) => b.textContent.startsWith('Papa'))?.click()`);
  await attendre(300);
  await auditer(page, 'bureau : texte sélectionné, calques, propriétés');
  for (const nom of ['Ajouter', 'Fond', 'Format', 'Contrôles']) {
    await o.onglet(nom);
    await auditer(page, `bureau : panneau ${nom}`, 'aside');
  }
  await o.onglet('Calques');
  await page.eval(`[...document.querySelectorAll('[data-testid="calques"] li button')].find((b) => b.textContent.startsWith('Photo') || b.textContent.startsWith('logo'))?.click()`);
  await attendre(300);
  await o.bouton('Recadrer l’image');
  await auditer(page, 'bureau : recadrage', 'dialog[open]');
  await o.bouton('Annuler le recadrage');
  await o.bouton('Projets');
  await attendre(600);
  await auditer(page, 'bureau : projets', 'dialog[open]');
  await o.bouton('Fermer');
  await o.bouton('Aperçu');
  await attendre(600);
  await auditer(page, 'bureau : aperçu', 'dialog[open]');
  await o.bouton('Fermer l’aperçu');
  await o.bouton('Finaliser ma demande');
  await attendre(800);
  await auditer(page, 'bureau : finalisation', 'dialog[open]');
  await page.close();

  const mobile = await ouvrirPage(chrome, { width: 390, height: 844, mobile: true });
  const m = outils(mobile);
  await m.ouvrir();
  await auditer(mobile, 'mobile : plan de travail');
  for (const nom of ['Ajouter', 'Fond', 'Calques', 'Format', 'Contrôles']) {
    await m.bouton(nom, 'nav[aria-label="Outils du Studio"]');
    await auditer(mobile, `mobile : feuille ${nom}`);
    await m.bouton('Fermer le panneau');
  }
  await m.bouton('Projets');
  await attendre(600);
  await auditer(mobile, 'mobile : projets', 'dialog[open]');
} catch (e) {
  graves++;
  console.log('ÉCHEC scénario interrompu —', e.message);
} finally {
  await chrome.fermer();
}
console.log(graves ? `\n${graves} violation(s) graves` : '\nAucune violation grave');
process.exit(graves ? 1 : 0);

// Budget de performance du Banner Studio, sur un téléphone simulé : réseau 4G lent (1,6 Mbit/s,
// 150 ms) et processeur ralenti 4 fois. À lancer contre un build de production (`next start`).
//
//   STUDIO_URL=http://localhost:3100 node scripts/e2e/banner-performance.mjs
//
// Contrôle aussi que le Studio ne s'invite pas dans les pages qui n'en ont pas besoin.

import { lancerChrome, ouvrirPage } from './cdp.mjs';

const BASE = (process.env.STUDIO_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const BUDGET = {
  jsStudioKo: 350, // JavaScript compressé chargé avant que le plan de travail soit utilisable
  pretMs: 6000, // jusqu'au plan de travail dessiné, téléphone et réseau ralentis
  memoireMo: 60, // tas JavaScript après l'application d'un modèle
  jsSiteKo: 220, // pages du site : le Studio n'y est pas
};
let echecs = 0;
const verifier = (nom, ok, mesure) => {
  if (!ok) echecs++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom} — ${mesure}`);
};

async function mesurer(chrome, chemin, pret) {
  const page = await ouvrirPage(chrome, { width: 390, height: 844, mobile: true });
  await page.envoyer('Network.enable');
  await page.envoyer('Network.setCacheDisabled', { cacheDisabled: true });
  await page.envoyer('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await page.envoyer('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.envoyer('Performance.enable');
  const types = new Map();
  let js = 0;
  const urls = [];
  page.sur('Network.responseReceived', (p) => types.set(p.requestId, { type: p.type, url: p.response.url }));
  page.sur('Network.loadingFinished', (p) => {
    const r = types.get(p.requestId);
    if (r?.type === 'Script') {
      js += p.encodedDataLength;
      urls.push(r.url);
    }
  });
  const t0 = Date.now();
  await page.envoyer('Page.navigate', { url: `${BASE}${chemin}` });
  await page.attendre(pret, { timeoutMs: 60000, intervalle: 50 });
  const duree = Date.now() - t0;
  return { page, js: Math.round(js / 1024), duree, urls };
}

const chrome = await lancerChrome({ port: 9400 });
try {
  const studio = await mesurer(chrome, '/banderoles/studio', `!!document.querySelector('[data-testid="plan-de-travail"] canvas')`);
  verifier('Studio : JavaScript compressé', studio.js <= BUDGET.jsStudioKo, `${studio.js} Ko (budget ${BUDGET.jsStudioKo})`);
  verifier('Studio : plan de travail prêt', studio.duree <= BUDGET.pretMs, `${(studio.duree / 1000).toFixed(1)} s (budget ${BUDGET.pretMs / 1000} s)`);
  await studio.page.envoyer('Emulation.setCPUThrottlingRate', { rate: 1 });
  await studio.page.attendre(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Voir les modèles')`);
  await studio.page.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Voir les modèles').click()`);
  await new Promise((r) => setTimeout(r, 1500));
  await studio.page.eval(`document.querySelector('[data-testid=modeles] button').click()`);
  await new Promise((r) => setTimeout(r, 800));
  await studio.page.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Utiliser ce modèle').click()`);
  await new Promise((r) => setTimeout(r, 4000));
  const { metrics } = await studio.page.envoyer('Performance.getMetrics');
  const tas = Math.round(metrics.find((m) => m.name === 'JSHeapUsedSize').value / 1048576);
  verifier('Studio : mémoire après un modèle', tas <= BUDGET.memoireMo, `${tas} Mo (budget ${BUDGET.memoireMo})`);
  const lourds = studio.urls.filter((u) => /pdf-lib|fontkit/.test(u));
  verifier('Studio : rien du rendu PDF dans le navigateur', lourds.length === 0, lourds.join(', ') || 'aucun');
  await studio.page.close();

  for (const chemin of ['/banderoles', '/banderoles/commander?usage=deuil']) {
    const m = await mesurer(chrome, chemin, `document.readyState === 'complete'`);
    const konva = await m.page.eval(`typeof window.Konva !== 'undefined' || performance.getEntriesByType('resource').some((r) => /konva/i.test(r.name))`);
    verifier(`${chemin} : sans le Studio`, !konva, konva ? 'Konva chargé' : 'Konva absent');
    verifier(`${chemin} : JavaScript compressé`, m.js <= BUDGET.jsSiteKo, `${m.js} Ko (budget ${BUDGET.jsSiteKo})`);
    await m.page.close();
  }
} catch (e) {
  echecs++;
  console.log('ÉCHEC mesure interrompue —', e.message);
} finally {
  await chrome.fermer();
}
process.exit(echecs ? 1 : 0);

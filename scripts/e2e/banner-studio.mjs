// Essai de bout en bout de l'éditeur du Banner Studio (Chrome headless, CDP).
//
//   STUDIO_URL=http://localhost:3000 STUDIO_CAPTURES=/chemin/captures node scripts/e2e/banner-studio.mjs
//
// Tout se passe dans un profil de navigateur temporaire : rien n'est envoyé au serveur. Les
// contrôles lisent le document **enregistré** (IndexedDB), pas l'état interne de l'éditeur.
// Couvre : création, sélection, déplacement, redimensionnement, rotation, calques, verrouillage,
// annuler/rétablir, clavier, zoom, format, aperçu, rechargement (image comprise), fichier refusé,
// 390 px sans débordement, gestes tactiles, erreurs de console.
// Code de sortie 1 si un contrôle échoue.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_STUDIO = `${(process.env.STUDIO_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/banderoles/studio`;
const temporaire = mkdtempSync(join(tmpdir(), 'elembo-banner-'));
const CAPTURES = process.env.STUDIO_CAPTURES ?? temporaire;
const LOGO = join(racine, 'tests', 'fixtures', 'logo-transparent.png');
const FAUX = join(temporaire, 'pas-une-image.png');
writeFileSync(FAUX, '<svg xmlns="http://www.w3.org/2000/svg"/>');
mkdirSync(CAPTURES, { recursive: true });

let echecs = 0;
function verifier(nom, condition, details = '') {
  if (!condition) echecs++;
  console.log(`${condition ? 'OK  ' : 'ÉCHEC'} ${nom}${!condition && details !== '' ? ` — ${details}` : ''}`);
}
const proche = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------------- pilotage ---- */

const LIRE = `new Promise((ok) => {
  const r = indexedDB.open('elembo-banner');
  r.onupgradeneeded = () => r.transaction.abort();
  r.onerror = () => ok(null);
  r.onsuccess = () => {
    const t = r.result.transaction(['meta', 'projets', 'assets']);
    const m = t.objectStore('meta').get('courant');
    m.onsuccess = () => { if (!m.result) return; const p = t.objectStore('projets').get(m.result.projet); p.onsuccess = () => (t.doc = p.result?.document ?? null); };
    t.oncomplete = () => { r.result.close(); ok(t.doc ?? null); };
  };
})`;

function pilote(page) {
  const erreurs = [];
  page.sur('Runtime.exceptionThrown', (p) => erreurs.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
  page.sur('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'warning') erreurs.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)}`);
  });
  const bouton = async (libelle, dans = 'body') => {
    const ok = await page.eval(`(() => {
      const b = [...document.querySelectorAll(${JSON.stringify(dans)} + ' button')].find((x) => (x.getAttribute('aria-label') ?? x.textContent.trim()) === ${JSON.stringify(libelle)});
      if (!b || b.disabled) return false; b.click(); return true; })()`);
    if (!ok) throw new Error(`Bouton absent ou inactif : ${libelle}`);
    await attendre(60);
  };
  const p = {
    page, erreurs, bouton,
    async ouvrir() {
      await page.goto(URL_STUDIO);
      await page.attendre(`document.querySelector('[data-testid="plan-de-travail"] canvas')`, { timeoutMs: 60000 });
      await attendre(800);
    },
    /** Document enregistré, une fois toute modification écrite. */
    async doc() {
      await attendre(50);
      await page.attendre(`/Enregistré|Nouveau projet/.test(document.querySelector('[data-testid="sauvegarde"]')?.textContent)`, { message: 'enregistrement automatique' });
      return page.eval(LIRE);
    },
    async element(i = -1) { return (await p.doc()).elements.at(i); },
    /** Millimètres → pixels, banderole ajustée au plan de travail (marge de 32 px). */
    async echelle() {
      const r = await page.eval(`(() => { const r = document.querySelector('[data-testid="plan-de-travail"]').getBoundingClientRect(); return { x: r.left, y: r.top, l: r.width, h: r.height }; })()`);
      const { largeurMm: L, hauteurMm: H } = p.format;
      const k = Math.min((r.l - 64) / L, (r.h - 64) / H);
      const x0 = r.x + (r.l - L * k) / 2;
      const y0 = r.y + (r.h - H * k) / 2;
      return { k, x: (mm) => x0 + mm * k, y: (mm) => y0 + mm * k };
    },
    format: { largeurMm: 3000, hauteurMm: 1000 },
    async glisser(x0, y0, x1, y1) {
      await page.souris('mouseMoved', x0, y0, { bouton: 'none' });
      await page.souris('mousePressed', x0, y0);
      for (let i = 1; i <= 8; i++) await page.souris('mouseMoved', x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
      await page.souris('mouseReleased', x1, y1);
      await attendre(80);
    },
    async touche(key, { ctrl = false, maj = false } = {}) {
      const modifiers = (ctrl ? 2 : 0) + (maj ? 8 : 0);
      await page.envoyer('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
      await page.envoyer('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
      await attendre(40);
    },
    async champ(libelle, valeur) {
      const ok = await page.eval(`(() => {
        const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === ${JSON.stringify(libelle)});
        const el = l && document.getElementById(l.htmlFor);
        if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
        el.focus();
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(String(valeur))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return true; })()`);
      if (!ok) throw new Error(`Champ absent : ${libelle}`);
      await attendre(250);
    },
    onglet: (nom) => page.eval(`(() => { [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent === ${JSON.stringify(nom)}).click(); return true; })()`).then(() => attendre(80)),
    capture: (nom) => page.screenshot(join(CAPTURES, `${nom}.png`)),
    texte: (testid) => page.eval(`document.querySelector('[data-testid="${testid}"]')?.textContent ?? ''`),
  };
  return p;
}

/* --------------------------------------------------------------------------- bureau ---- */

async function bureau(chrome) {
  console.log('\n— Bureau, 1440 × 900');
  const s = pilote(await ouvrirPage(chrome, { width: 1440, height: 900 }));
  const { page } = s;
  await s.ouvrir();
  verifier('page neuve : rien d’enregistré avant une action', (await s.texte('sauvegarde')).includes('Nouveau projet') && (await page.eval(LIRE)) === null);
  await s.capture('01-vide');

  // Texte
  await s.bouton('Ajouter un texte');
  await s.champ('Contenu', 'Papa Joseph Malonga');
  await s.champ('Police', 'dm-serif-display');
  await s.champ('Corps (mm)', '200');
  let t = await s.element();
  verifier('texte créé, style enregistré', t.type === 'texte' && t.texte.contenu === 'Papa Joseph Malonga' && t.texte.corpsMm === 200 && t.texte.policeId === 'dm-serif-display');
  verifier('cadre = largeur crénée mesurée au lot 0 (1 868,2 mm)', proche(t.largeurMm, 1868.2, 0.6), t.largeurMm);

  // Déplacement à la souris
  let e = await s.echelle();
  let avant = t;
  await s.glisser(e.x(t.xMm), e.y(t.yMm), e.x(t.xMm - 300), e.y(t.yMm + 150));
  t = await s.element();
  verifier('déplacement à la souris : −300 mm / +150 mm', proche(t.xMm, avant.xMm - 300, 5) && proche(t.yMm, avant.yMm + 150, 5), JSON.stringify([t.xMm - avant.xMm, t.yMm - avant.yMm]));
  await s.bouton('Annuler');
  t = await s.element();
  verifier('annuler rend la position exacte', t.xMm === avant.xMm && t.yMm === avant.yMm);
  await s.bouton('Rétablir');
  t = await s.element();
  verifier('rétablir rejoue le déplacement', proche(t.xMm, avant.xMm - 300, 5));

  // Redimensionnement du texte par la poignée bas-droite
  avant = t;
  e = await s.echelle();
  const coin = [e.x(t.xMm + t.largeurMm / 2), e.y(t.yMm + t.hauteurMm / 2)];
  await s.glisser(...coin, coin[0] - (t.largeurMm / 4) * e.k, coin[1] - (t.hauteurMm / 4) * e.k);
  t = await s.element();
  verifier('redimensionner un texte réduit son corps', proche(t.texte.corpsMm, 150, 6), t.texte.corpsMm);
  verifier('le cadre suit le corps', proche(t.largeurMm, avant.largeurMm * (t.texte.corpsMm / avant.texte.corpsMm), 2));
  verifier('le coin opposé ne bouge pas', proche(t.xMm - t.largeurMm / 2, avant.xMm - avant.largeurMm / 2, 6) && proche(t.yMm - t.hauteurMm / 2, avant.yMm - avant.hauteurMm / 2, 6));

  // Forme : redimensionnement puis rotation
  await s.bouton('Ajouter un rectangle');
  let f = await s.element();
  avant = f;
  e = await s.echelle();
  await s.glisser(e.x(f.xMm + f.largeurMm / 2), e.y(f.yMm), e.x(f.xMm + f.largeurMm / 2 + 200), e.y(f.yMm));
  f = await s.element();
  verifier('poignée droite : +200 mm de large, hauteur inchangée', proche(f.largeurMm, avant.largeurMm + 200, 6) && proche(f.hauteurMm, avant.hauteurMm, 1), JSON.stringify([f.largeurMm, f.hauteurMm]));
  e = await s.echelle();
  const poignee = [e.x(f.xMm), e.y(f.yMm - f.hauteurMm / 2) - 28];
  const r = e.y(f.yMm) - poignee[1];
  await s.glisser(...poignee, e.x(f.xMm) + r, e.y(f.yMm));
  f = await s.element();
  verifier('rotation à la souris : 90°', proche(f.rotationDeg, 90, 1), f.rotationDeg);
  await s.capture('02-forme-pivotee');

  // Clavier
  avant = f;
  await page.eval(`document.querySelector('[data-testid="plan-de-travail"]').focus()`);
  await s.touche('ArrowRight');
  await s.touche('ArrowRight');
  await s.touche('ArrowDown', { maj: true });
  f = await s.element();
  verifier('flèches : +20 mm, Maj : +100 mm', proche(f.xMm, avant.xMm + 20, 0.2) && proche(f.yMm, Math.min(1000, avant.yMm + 100), 0.2), JSON.stringify([f.xMm - avant.xMm, f.yMm - avant.yMm]));
  await s.touche('z', { ctrl: true });
  f = await s.element();
  verifier('Ctrl Z annule le dernier déplacement', f.yMm !== avant.yMm + 100);
  await s.touche('z', { ctrl: true, maj: true });
  await s.touche('d', { ctrl: true });
  verifier('Ctrl D duplique', (await s.doc()).elements.length === 3);
  await s.touche('Delete');
  verifier('Suppr retire la copie', (await s.doc()).elements.length === 2);
  await page.eval(`[...document.querySelectorAll('input')].find((x) => x.getAttribute('aria-label') === 'Nom du projet').focus()`);
  await s.touche('Delete');
  await s.touche('Backspace');
  verifier('Suppr dans un champ de saisie n’efface pas un élément', (await s.doc()).elements.length === 2);
  await page.eval('document.activeElement.blur()');

  // Image
  await page.envoyerFichiers('[data-testid="import-image"]', [LOGO]);
  await page.attendre(`document.querySelector('[data-testid="inspecteur"]')?.textContent.includes('Image')`);
  let d = await s.doc();
  verifier('image importée et référencée, jamais embarquée', d.elements.at(-1).type === 'image' && d.assets.length === 1 && !JSON.stringify(d).includes('base64'));
  await page.envoyerFichiers('[data-testid="import-image"]', [FAUX]);
  await page.attendre(`[...document.querySelectorAll('[role=alert]')].some((x) => x.textContent.trim())`);
  verifier('un fichier déguisé en PNG est refusé avec un message', (await s.doc()).assets.length === 1);
  await s.capture('03-fichier-refuse');
  await s.bouton('Fermer le message');

  // Calques
  await s.onglet('Calques');
  const ids = (await s.doc()).elements.map((x) => x.id);
  await page.eval(`document.querySelector('[data-testid="calques"] li button').click()`);
  await s.bouton('Mettre à l’arrière-plan');
  d = await s.doc();
  verifier('arrière-plan : l’image passe au fond', d.elements[0].id === ids[2] && d.elements[1].id === ids[0]);
  await page.eval(`[...document.querySelectorAll('[data-testid="calques"] button')].find((x) => x.textContent.startsWith('Papa')).click()`);
  await page.eval(`[...document.querySelectorAll('[data-testid="calques"] li')].find((x) => x.textContent.startsWith('Papa')).querySelector('button[aria-label^="Verrouiller"]').click()`);
  t = await s.element(1);
  e = await s.echelle();
  await s.glisser(e.x(t.xMm - t.largeurMm / 3), e.y(t.yMm), e.x(t.xMm - t.largeurMm / 3 + 200), e.y(t.yMm + 100));
  let u = await s.element(1);
  verifier('un élément verrouillé ne se déplace pas', u.verrouille && u.xMm === t.xMm && u.yMm === t.yMm);
  await s.capture('04-calques');
  await s.bouton('Voir toute la banderole');
  await page.eval(`[...document.querySelectorAll('[data-testid="calques"] li')].find((x) => x.textContent.startsWith('Papa')).querySelector('button[aria-label^="Déverrouiller"]').click()`);

  // Zoom, vue
  await s.bouton('Zoomer');
  await s.bouton('Zoomer');
  verifier('zoom : 156 %', (await s.texte('zoom')).startsWith('156'), await s.texte('zoom'));
  const c = await page.eval(`(() => { const r = document.querySelector('[data-testid="plan-de-travail"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await page.envoyer('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: -100, modifiers: 2 });
  await attendre(100);
  verifier('Ctrl + molette zoome', parseInt(await s.texte('zoom'), 10) > 200, await s.texte('zoom'));
  await s.capture('05-zoom');
  await s.touche('0', { ctrl: true });
  verifier('Ctrl 0 remet la banderole entière', (await s.texte('zoom')).startsWith('100'));

  // Format
  await s.onglet('Format');
  await s.champ('Largeur (cm)', '400');
  d = await s.doc();
  verifier('format 4 × 1 m, éléments gardés dans la surface', d.dimensions.largeurMm === 4000 && d.elements.every((x) => x.xMm >= 0 && x.xMm <= 4000), JSON.stringify(d.dimensions));
  await s.capture('06-format');
  await s.touche('z', { ctrl: true });
  verifier('un changement de format s’annule', (await s.doc()).dimensions.largeurMm === 3000);

  // Contrôles et aperçu
  await s.onglet('Contrôles');
  await s.capture('07-controles');
  await s.bouton('Aperçu');
  await page.attendre(`document.querySelector('dialog[open] canvas')?.width === 1600`);
  const pixels = await page.eval(`(() => { const c = document.querySelector('dialog canvas'); const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < p.length; i += 4 * 997) s.add(p[i] + ',' + p[i+1] + ',' + p[i+2]); return s.size; })()`);
  verifier('aperçu 1 600 px, peint', pixels > 2, pixels);
  await s.capture('08-apercu');
  await s.bouton('Fermer l’aperçu');

  // Rechargement
  d = await s.doc();
  await s.ouvrir();
  const d2 = await page.eval(LIRE);
  verifier('rechargement : même document enregistré', JSON.stringify(d2) === JSON.stringify(d));
  await s.onglet('Calques');
  verifier('rechargement : éléments affichés', (await page.eval(`document.querySelectorAll('[data-testid="calques"] li').length`)) === d.elements.length);
  await s.onglet('Contrôles');
  verifier('rechargement : image retrouvée', !(await s.texte('alertes')).toLowerCase().includes('introuvable'), await s.texte('alertes'));
  await s.capture('09-recharge');

  // Rechargement immédiat, sans attendre l'enregistrement automatique
  await s.onglet('Ajouter');
  await s.bouton('Ajouter une ellipse');
  await s.ouvrir();
  verifier('rechargement immédiat : la dernière action est conservée', (await page.eval(LIRE)).elements.length === d.elements.length + 1);

  verifier('aucune erreur ni avertissement de console', s.erreurs.length === 0, s.erreurs.join(' | ').slice(0, 800));
  await page.close();
}

/* --------------------------------------------------------------------------- mobile ---- */

async function mobile(chrome) {
  console.log('\n— Mobile, 390 × 844');
  const s = pilote(await ouvrirPage(chrome, { width: 390, height: 844, mobile: true }));
  const { page } = s;
  await page.envoyer('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });
  await s.ouvrir();
  const deborde = () => page.eval(`document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth`);
  const initial = (await page.eval(LIRE))?.elements.length ?? 0;
  verifier('projet du profil retrouvé sur mobile', initial > 0);
  verifier('pas de débordement horizontal', !(await deborde()));
  await s.capture('20-mobile');
  for (const nom of ['Ajouter', 'Calques', 'Format', 'Contrôles']) {
    await s.bouton(nom, 'nav[aria-label="Outils du Studio"]');
    verifier(`panneau ${nom} : pas de débordement`, !(await deborde()) && (await page.eval(`!!document.querySelector('section[aria-label="${nom}"]')`)));
    await s.capture(`21-mobile-${nom.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`);
    await s.bouton('Fermer le panneau');
  }

  await s.bouton('Ajouter', 'nav[aria-label="Outils du Studio"]');
  await s.bouton('Ajouter un rectangle');
  await attendre(200);
  let f = await s.element();
  let e = await s.echelle();
  const doigt = async (type, points) => {
    await page.envoyer('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    await attendre(40);
  };
  // Konva expose ses scènes sur la page : échelle réelle du plan de travail.
  const echelleVue = () => page.eval('Konva.stages.at(-1).getLayers()[1].scaleX()');
  const x0 = e.x(f.xMm), y0 = e.y(f.yMm);
  await doigt('touchStart', [[x0, y0]]);
  for (let i = 1; i <= 6; i++) await doigt('touchMove', [[x0 - i * 8, y0 + i * 2]]);
  await doigt('touchEnd', []);
  let g = await s.element();
  verifier('déplacement au doigt', proche(g.xMm, f.xMm - 48 / e.k, 8 / e.k) && g.yMm > f.yMm, JSON.stringify([g.xMm - f.xMm, g.yMm - f.yMm, e.k]));

  verifier('déplacer un petit élément ne le redimensionne pas', g.largeurMm === f.largeurMm && g.hauteurMm === f.hauteurMm);
  // Poignée du coin bas-droit, prise à l'extérieur du petit élément
  e = await s.echelle();
  const px = e.x(g.xMm + g.largeurMm / 2) + 12, py = e.y(g.yMm + g.hauteurMm / 2) + 12;
  await doigt('touchStart', [[px, py]]);
  for (let i = 1; i <= 5; i++) await doigt('touchMove', [[px + i * 6, py + i * 6]]);
  await doigt('touchEnd', []);
  f = g;
  g = await s.element();
  verifier('agrandir un petit élément au doigt', proche(g.largeurMm, f.largeurMm + 30 / e.k, 8 / e.k), g.largeurMm - f.largeurMm);

  // Pincement : deux doigts qui s'écartent
  const cx = 195, cy = e.y(100);
  await doigt('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 6; i++) await doigt('touchMove', [[cx - 30 - i * 10, cy], [cx + 30 + i * 10, cy]]);
  await doigt('touchEnd', []);
  await attendre(150);
  const zoomPince = (await echelleVue()) / e.k;
  verifier('le pincement zoome (écart des doigts × 3)', proche(zoomPince, 3, 0.4), zoomPince);
  const apresPince = await s.element();
  verifier('le pincement ne modifie pas l’élément', apresPince.xMm === g.xMm && apresPince.largeurMm === g.largeurMm);
  await s.capture('22-mobile-pince');
  await s.bouton('Voir toute la banderole');

  // Réglages
  await s.bouton('Modifier l’élément');
  verifier('propriétés : pas de débordement', !(await deborde()));
  await s.capture('23-mobile-reglages');
  await s.champ('Rotation (°)', '30');
  verifier('rotation par le panneau', (await s.element()).rotationDeg === 30);
  await s.capture('23-mobile-pivote');
  const petites = await page.eval(`[...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.height < 40 || r.width < 32); }).map((b) => b.getAttribute('aria-label') ?? b.textContent)`);
  verifier('cibles tactiles assez grandes', petites.length === 0, petites.join(', '));

  await s.bouton('Fermer le panneau');
  await s.bouton('Contrôles', 'nav[aria-label="Outils du Studio"]');
  await s.bouton('Aperçu');
  await page.attendre(`document.querySelector('dialog[open] canvas')?.width === 1600`);
  verifier('aperçu sur mobile : pas de débordement', !(await deborde()));
  await s.capture('25-mobile-apercu');
  await s.bouton('Fermer l’aperçu');

  // Rotation de l'écran
  await page.viewport(844, 390, { mobile: true });
  await attendre(300);
  verifier('paysage : pas de débordement horizontal', !(await deborde()));
  await s.capture('24-mobile-paysage');
  verifier('aucune erreur ni avertissement de console', s.erreurs.length === 0, s.erreurs.join(' | ').slice(0, 800));
  await page.close();
}

const chrome = await lancerChrome({ port: 9377 });
try {
  await bureau(chrome);
  await mobile(chrome);
} catch (e) {
  echecs++;
  console.log('ÉCHEC scénario interrompu —', e.message);
} finally {
  await chrome.fermer();
}
console.log(`\n${echecs ? `${echecs} contrôle(s) en échec` : 'Tous les contrôles passent'} — captures : ${CAPTURES}`);
process.exit(echecs ? 1 : 0);

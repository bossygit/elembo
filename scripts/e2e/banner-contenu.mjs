// Essai de bout en bout du lot 3 du Banner Studio : photo, logo, texte stylé, formes, fond.
//
//   STUDIO_URL=http://localhost:3000 STUDIO_CAPTURES=/chemin/captures node scripts/e2e/banner-contenu.mjs
//
// Comme banner-studio.mjs : profil de navigateur temporaire, rien n'est envoyé au serveur, et les
// contrôles lisent le document et les images **enregistrés** (IndexedDB).
// Code de sortie 1 si un contrôle échoue.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_STUDIO = `${(process.env.STUDIO_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/banderoles/studio`;
const temporaire = mkdtempSync(join(tmpdir(), 'elembo-contenu-'));
const CAPTURES = process.env.STUDIO_CAPTURES ?? temporaire;
const LOGO = join(racine, 'tests', 'fixtures', 'logo-transparent.png');
mkdirSync(CAPTURES, { recursive: true });

let echecs = 0;
function verifier(nom, condition, details = '') {
  if (!condition) echecs++;
  console.log(`${condition ? 'OK  ' : 'ÉCHEC'} ${nom}${!condition && details !== '' ? ` — ${typeof details === 'string' ? details : JSON.stringify(details)}` : ''}`);
}
const proche = (a, b, t) => Math.abs(a - b) <= t;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const base = (corps) => `new Promise((ok) => {
  const r = indexedDB.open('elembo-banner');
  r.onupgradeneeded = () => r.transaction.abort();
  r.onerror = () => ok(null);
  r.onsuccess = () => { const db = r.result; const fin = (v) => { db.close(); ok(v); }; ${corps} };
})`;
const LIRE = base(`
  const t = db.transaction(['meta', 'projets']);
  const m = t.objectStore('meta').get('courant');
  m.onsuccess = () => { if (!m.result) return; const p = t.objectStore('projets').get(m.result.projet); p.onsuccess = () => (t.doc = p.result?.document ?? null); };
  t.oncomplete = () => fin(t.doc ?? null);`);
/** Fichier enregistré : type, dimensions, présence d'EXIF, couleur du haut et du bas. */
const lireAsset = (id) => base(`
  const q = db.transaction('assets').objectStore('assets').get(${JSON.stringify(id)});
  q.onsuccess = async () => {
    const blob = q.result?.blob;
    if (!blob) return fin(null);
    const o = new Uint8Array(await blob.arrayBuffer());
    let exif = false;
    for (let i = 0; i < Math.min(o.length - 4, 4000); i++) if (o[i] === 69 && o[i+1] === 120 && o[i+2] === 105 && o[i+3] === 102) exif = true;
    const im = await createImageBitmap(blob, { imageOrientation: 'none' }).catch(() => createImageBitmap(blob));
    const c = new OffscreenCanvas(im.width, im.height); const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const px = (a, b) => [...x.getImageData(a, b, 1, 1).data];
    fin({ type: blob.type, l: im.width, h: im.height, exif, haut: px(im.width >> 1, 20), bas: px(im.width >> 1, im.height - 20), coin: px(2, 2) });
  };`);

function pilote(page) {
  const erreurs = [];
  page.sur('Runtime.exceptionThrown', (p) => erreurs.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
  page.sur('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'warning') erreurs.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)}`);
  });
  const p = {
    page, erreurs,
    async bouton(libelle, dans = 'body') {
      const ok = await page.eval(`(() => {
        const b = [...document.querySelectorAll(${JSON.stringify(dans)} + ' button')].find((x) => (x.getAttribute('aria-label') ?? x.textContent.trim()) === ${JSON.stringify(libelle)});
        if (!b || b.disabled) return false; b.click(); return true; })()`);
      if (!ok) throw new Error(`Bouton absent ou inactif : ${libelle}`);
      await attendre(120);
    },
    actif: (libelle) => page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') ?? x.textContent.trim()) === ${JSON.stringify(libelle)}); return b ? !b.disabled : null; })()`),
    async ouvrir() {
      await page.goto(URL_STUDIO);
      await page.attendre(`document.querySelector('[data-testid="plan-de-travail"] canvas')`, { timeoutMs: 60000 });
      await attendre(800);
    },
    async doc() {
      await attendre(60);
      await page.attendre(`/Enregistré|Nouveau projet/.test(document.querySelector('[data-testid="sauvegarde"]')?.textContent)`, { message: 'enregistrement automatique' });
      return page.eval(LIRE);
    },
    async element(i = -1) { return (await p.doc()).elements.at(i); },
    async asset(id) { return page.eval(lireAsset(id)); },
    async champ(libelle, valeur) {
      const ok = await page.eval(`(() => {
        const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === ${JSON.stringify(libelle)});
        const el = l && (document.getElementById(l.htmlFor) ?? l.querySelector('input'));
        if (!el || el.disabled) return false;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
        el.focus();
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(String(valeur))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return true; })()`);
      if (!ok) throw new Error(`Champ absent ou inactif : ${libelle}`);
      await attendre(350);
    },
    async coche(libelle) {
      const ok = await page.eval(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === ${JSON.stringify(libelle)}); const c = l?.querySelector('input[type=checkbox]'); if (!c || c.disabled) return false; c.click(); return true; })()`);
      if (!ok) throw new Error(`Case absente ou inactive : ${libelle}`);
      await attendre(120);
    },
    onglet: (nom) => page.eval(`(() => { [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent === ${JSON.stringify(nom)}).click(); return true; })()`).then(() => attendre(100)),
    async fichier(testid, chemin) {
      const avant = (await page.eval(LIRE))?.assets.length ?? 0;
      await page.envoyerFichiers(`[data-testid="${testid}"]`, [chemin]);
      await attendre(900);
      return avant;
    },
    message: () => page.eval(`[...document.querySelectorAll('[role=alert]')].map((x) => x.textContent).join(' | ')`),
    texte: (testid) => page.eval(`document.querySelector('[data-testid="${testid}"]')?.textContent ?? ''`),
    rect: (selecteur) => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(selecteur)}).getBoundingClientRect(); return { x: r.left, y: r.top, l: r.width, h: r.height }; })()`),
    async glisser(x0, y0, x1, y1) {
      await page.souris('mouseMoved', x0, y0, { bouton: 'none' });
      await page.souris('mousePressed', x0, y0);
      for (let i = 1; i <= 8; i++) await page.souris('mouseMoved', x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
      await page.souris('mouseReleased', x1, y1);
      await attendre(120);
    },
    /** Point de l'écran d'un point en mm (échelle réelle du plan de travail). */
    ecran: (xMm, yMm) => page.eval(`(() => { const s = Konva.stages.at(-1); const l = s.getLayers()[1]; const r = s.container().getBoundingClientRect(); return [r.left + l.x() + ${xMm} * l.scaleX(), r.top + l.y() + ${yMm} * l.scaleY()]; })()`),
    async touche(key, modifiers = 0) {
      await page.envoyer('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
      await page.envoyer('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
      await attendre(60);
    },
    capture: (nom) => page.screenshot(join(CAPTURES, `${nom}.png`)),
  };
  return p;
}

/** Image d'essai fabriquée par le navigateur : moitié gauche rouge, moitié droite bleue. */
async function fabriquer(page, nom, mime, l, h, { fond = true } = {}) {
  const b64 = await page.eval(`new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = ${l}; c.height = ${h}; const x = c.getContext('2d');
    if (${fond}) { x.fillStyle = '#C01010'; x.fillRect(0, 0, ${l} / 2, ${h}); x.fillStyle = '#1010C0'; x.fillRect(${l} / 2, 0, ${l} / 2, ${h}); }
    else { x.fillStyle = '#10C010'; x.beginPath(); x.arc(${l} / 2, ${h} / 2, ${h} / 3, 0, 7); x.fill(); }
    c.toBlob((b) => { const f = new FileReader(); f.onload = () => ok(f.result.split(',')[1]); f.readAsDataURL(b); }, ${JSON.stringify(mime)}, 0.92);
  })`);
  const chemin = join(temporaire, nom);
  writeFileSync(chemin, Buffer.from(b64, 'base64'));
  return Buffer.from(b64, 'base64');
}
/** Ajoute une orientation EXIF juste après le début du JPEG. */
function avecExif(jpeg, orientation) {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
  const contenu = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const entete = Buffer.from([0xff, 0xe1, (contenu.length + 2) >> 8, (contenu.length + 2) & 255]);
  return Buffer.concat([jpeg.subarray(0, 2), entete, contenu, jpeg.subarray(2)]);
}
const rouge = (p) => p[0] > 120 && p[2] < 80;
const bleu = (p) => p[2] > 120 && p[0] < 80;

/* --------------------------------------------------------------------------- bureau ---- */

async function bureau(chrome) {
  console.log('\n— Bureau, 1440 × 900');
  const s = pilote(await ouvrirPage(chrome, { width: 1440, height: 900 }));
  const { page } = s;
  await s.ouvrir();
  const photo = await fabriquer(page, 'photo.jpg', 'image/jpeg', 1600, 1000);
  writeFileSync(join(temporaire, 'tournee.jpg'), avecExif(photo, 6));
  await fabriquer(page, 'photo.webp', 'image/webp', 1200, 800);
  await fabriquer(page, 'detouree.webp', 'image/webp', 600, 600, { fond: false });
  writeFileSync(join(temporaire, 'photo.heic'), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]));

  // --- Texte stylé
  await s.bouton('Ajouter un texte');
  await s.champ('Contenu', 'Famille Malonga');
  await s.champ('Police', 'playfair-display');
  await s.champ('Corps (mm)', '200');
  let t = await s.element();
  const droit = t.largeurMm;
  await s.bouton('Italique');
  t = await s.element();
  verifier('italique réel : enregistré, et la largeur change', t.texte.italique && !proche(t.largeurMm, droit, 1), [droit, t.largeurMm]);
  const charge = await page.eval(`[...document.fonts].filter((f) => f.status === 'loaded' && f.family.includes('Playfair')).map((f) => f.style + f.weight)`);
  verifier('le fichier italique gras est bien celui chargé', charge.includes('italic700'), charge);
  await s.champ('Interligne', '1,5');
  await s.champ('Lettres (%)', '10');
  t = await s.element();
  verifier('interligne et interlettrage', t.texte.interligne === 1.5 && t.texte.interlettrageEm === 0.1 && proche(t.hauteurMm, 300, 0.2), t.texte);
  // La largeur enregistrée est celle réellement peinte, interlettrage compris.
  const peint = await page.eval(`(() => { const c = document.createElement('canvas').getContext('2d'); c.font = 'italic 700 100px "Studio Playfair Display"'; c.letterSpacing = '10px'; return (c.measureText('Famille Malonga').width - 10) * 2; })()`);
  verifier('largeur du cadre = largeur peinte (0,2 mm)', proche(t.largeurMm, peint, 0.2), [t.largeurMm, peint]);
  await s.champ('Police', 'anton');
  t = await s.element();
  verifier('Anton n’a ni gras ni italique : retirés, boutons inactifs', t.texte.graisse === 400 && !t.texte.italique && !(await s.actif('Gras')) && !(await s.actif('Italique')));
  await s.champ('Police', 'dm-serif-display');
  await s.champ('Contenu', 'Mɔtɔ ya bolingo');
  verifier('caractères absents signalés', (await s.texte('glyphes')).includes('ɔ'), await s.texte('glyphes'));
  await s.capture('30-glyphes');
  await s.bouton('Utiliser Montserrat');
  t = await s.element();
  verifier('police proposée : applique et lève l’alerte', t.texte.policeId === 'montserrat' && (await s.texte('glyphes')) === '');
  await s.champ('Contenu', 'Toute la famille vous remercie pour votre présence et vos prières en ces moments difficiles');
  await s.bouton('Couper le texte aux marges');
  t = await s.element();
  verifier('couper aux marges : lignes explicites dans la zone de sécurité', t.texte.contenu.includes('\n') && t.largeurMm <= 2900, [t.largeurMm, t.texte.contenu]);
  await s.champ('Couleur du texte, code hexadécimal', '').catch(() => {});
  await page.eval(`(() => { [...document.querySelectorAll('button[aria-label="Couleur #0F6B4C"]')][0].click(); return true; })()`);
  t = await s.element();
  verifier('pastille de couleur', t.texte.couleur === '#0F6B4C', t.texte.couleur);
  await s.champ('Corps (mm)', '90');
  await s.champ('Nom dans les calques', 'Remerciements');
  verifier('élément renommé', (await s.element()).nom === 'Remerciements');
  await s.capture('31-texte');
  // Double-clic : on modifie le texte
  let [x, y] = await s.ecran(t.xMm, t.yMm);
  await page.cliquer(x, y);
  await page.souris('mousePressed', x, y, { clics: 2 });
  await page.souris('mouseReleased', x, y, { clics: 2 });
  await attendre(200);
  verifier('double-clic sur un texte : le champ Contenu a le focus', await page.eval(`document.activeElement.tagName === 'TEXTAREA'`));
  await page.eval('document.activeElement.blur()');

  // --- Photos
  await s.fichier('import-image', join(temporaire, 'photo.jpg'));
  let d = await s.doc();
  let a = d.assets.at(-1);
  let f = await s.asset(a.id);
  verifier('JPEG ordinaire conservé tel quel (empreinte SHA-256)', a.largeurPx === 1600 && f.l === 1600 && /^[0-9a-f]{64}$/.test(a.sha256), a);
  await s.fichier('import-image', join(temporaire, 'photo.jpg'));
  d = await s.doc();
  verifier('même photo importée deux fois : une seule copie', d.assets.length === 1 && d.elements.filter((e) => e.type === 'image').length === 2, d.assets.length);
  await s.touche('Escape');
  await s.bouton('Annuler');

  await s.fichier('import-image', join(temporaire, 'tournee.jpg'));
  d = await s.doc();
  a = d.assets.at(-1);
  f = await s.asset(a.id);
  verifier('photo pivotée (EXIF 6) : redressée, 1000 × 1600', a.largeurPx === 1000 && a.hauteurPx === 1600 && f.l === 1000 && f.h === 1600, [a, f]);
  verifier('fichier enregistré droit, sans EXIF, haut rouge et bas bleu', f.exif === false && rouge(f.haut) && bleu(f.bas), f);
  await s.capture('32-exif');
  await s.bouton('Supprimer');
  verifier('supprimer retire l’image du document', (await s.doc()).assets.length === 1);

  await s.fichier('import-image', join(temporaire, 'photo.webp'));
  d = await s.doc();
  f = await s.asset(d.assets.at(-1).id);
  verifier('WEBP opaque converti en JPEG', f.type === 'image/jpeg' && d.assets.at(-1).mime === 'image/jpeg' && f.l === 1200, f);
  await s.bouton('Supprimer');
  await s.fichier('import-image', join(temporaire, 'detouree.webp'));
  d = await s.doc();
  f = await s.asset(d.assets.at(-1).id);
  verifier('WEBP transparent converti en PNG, transparence gardée', f.type === 'image/png' && f.coin[3] === 0, f);
  await s.bouton('Supprimer');
  await s.fichier('import-image', join(temporaire, 'photo.heic'));
  verifier('HEIC refusé avec un message utile', /HEIC/.test(await s.message()), await s.message());
  await s.bouton('Fermer le message');

  // --- Définition et recadrage
  await s.onglet('Calques');
  await page.eval(`[...document.querySelectorAll('[data-testid="calques"] button')].find((b) => b.textContent.startsWith('photo.jpg')).click()`);
  await attendre(100);
  const q = await s.texte('qualite');
  let im = await s.element();
  const dpi = Math.round(1600 / (im.largeurMm / 25.4));
  verifier('définition affichée : dpi réel', q.includes(`${dpi} dpi`), [q, dpi]);
  await s.bouton('Recadrer l’image');
  await page.attendre(`!!document.querySelector('dialog[open] [data-testid="zone-recadrage"]')`);
  await attendre(200);
  await s.capture('33-recadrage');
  let z = await s.rect('[data-testid="zone-recadrage"]');
  const avant = im;
  await s.bouton('Libre', 'dialog[open]');
  // Poignée droite tirée jusqu'au milieu : il ne reste que la moitié rouge.
  await s.glisser(z.x + z.l, z.y + z.h / 2, z.x + z.l / 2, z.y + z.h / 2);
  await s.capture('34-recadrage-libre');
  await s.bouton('Appliquer le recadrage');
  im = await s.element();
  verifier('recadrage libre : moitié gauche', proche(im.image.recadrage.l, 0.5, 0.01) && im.image.recadrage.x === 0, im.image.recadrage);
  verifier('le cadre suit, à la même échelle, bord gauche fixe', proche(im.largeurMm, avant.largeurMm / 2, 8) && proche(im.hauteurMm, avant.hauteurMm, 1) && proche(im.xMm - im.largeurMm / 2, avant.xMm - avant.largeurMm / 2, 1), [avant, im]);
  const couleur = async (xMm, yMm) => {
    const [px, py] = await s.ecran(xMm, yMm);
    const { data } = await page.envoyer('Page.captureScreenshot', { format: 'png', clip: { x: px, y: py, width: 1, height: 1, scale: 1 } });
    return page.eval(`new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(i, 0, 0); ok([...x.getImageData(0, 0, 1, 1).data]); }; i.src = 'data:image/png;base64,${data}'; })`);
  };
  verifier('à l’écran : il ne reste que le rouge', rouge(await couleur(im.xMm + im.largeurMm * 0.4, im.yMm + im.hauteurMm * 0.3)));
  await s.bouton('Recadrer l’image');
  await page.attendre(`!!document.querySelector('dialog[open] [data-testid="zone-recadrage"]')`);
  await s.bouton('Garder le cadre', 'dialog[open]');
  await page.eval(`document.querySelector('[data-testid="zone-recadrage"]').focus()`);
  for (let i = 0; i < 5; i++) await s.touche('ArrowRight', 8);
  const avant2 = im;
  await s.bouton('Appliquer le recadrage');
  im = await s.element();
  verifier('garder le cadre : position et taille identiques, contenu décalé au clavier', im.xMm === avant2.xMm && im.largeurMm === avant2.largeurMm && proche(im.image.recadrage.x, 0.5, 0.01), [im.image.recadrage]);
  verifier('à l’écran : bleu', bleu(await couleur(im.xMm + im.largeurMm * 0.4, im.yMm + im.hauteurMm * 0.3)));
  await s.touche('z', 2);
  verifier('le recadrage s’annule', (await s.element()).image.recadrage.x === 0);
  await s.bouton('Recadrer l’image');
  await page.attendre(`!!document.querySelector('dialog[open] [data-testid="zone-recadrage"]')`);
  await s.bouton('Carré', 'dialog[open]');
  await s.bouton('Annuler le recadrage');
  verifier('fermer la fenêtre n’applique rien', JSON.stringify((await s.element()).image) === JSON.stringify(avant2.image));

  // --- Remplacement, proportions
  const cadre = await s.element();
  await s.fichier('remplacer-image', LOGO);
  im = await s.element();
  d = await s.doc();
  verifier('remplacer : même cadre, nouvelle image, recadrage remis à zéro', im.largeurMm === cadre.largeurMm && im.xMm === cadre.xMm && im.image.recadrage.l === 1 && d.assets.length === 1 && d.assets[0].nom === 'logo-transparent.png', [im, d.assets]);
  await s.champ('Largeur (cm)', String(Math.round(im.largeurMm / 5)));
  let im2 = await s.element();
  verifier('proportions gardées à la saisie', proche(im2.largeurMm / im2.hauteurMm, im.largeurMm / im.hauteurMm, 0.01), [im.largeurMm, im.hauteurMm, im2.largeurMm, im2.hauteurMm]);

  // --- Formes et décorations
  await s.onglet('Ajouter');
  await s.bouton('Ajouter : Étoile');
  let e = await s.element();
  verifier('décoration ajoutée, carrée', e.forme.nature === 'etoile' && e.largeurMm === e.hauteurMm, e);
  await s.champ('Largeur (cm)', '50');
  e = await s.element();
  verifier('décoration : proportions toujours gardées', e.largeurMm === 500 && e.hauteurMm === 500, [e.largeurMm, e.hauteurMm]);
  await s.bouton('Ajouter un rectangle');
  await s.coche('Contour');
  await s.champ('Épaisseur du contour (mm)', '30');
  await s.champ('Arrondi des coins (mm)', '60');
  await s.coche('Remplissage');
  e = await s.element();
  verifier('cadre creux : contour 30 mm, coins 60 mm, sans remplissage', e.forme.fond === null && e.forme.epaisseurMm === 30 && e.forme.rayonMm === 60, e.forme);
  await s.champ('Largeur (cm)', '60');
  // Le contour est peint à l'intérieur du cadre, pas à cheval sur le bord.
  e = await s.element();
  await s.touche('Escape');
  const dehors = await couleur(e.xMm + e.largeurMm / 2 + 8, e.yMm);
  const dedans = await couleur(e.xMm + e.largeurMm / 2 - 15, e.yMm);
  verifier('contour à l’intérieur du cadre', dedans[0] < 60 && dehors[0] > 200, [dedans, dehors]);
  for (const nom of ['Éclat', 'Cœur', 'Croix', 'Anneaux', 'Ruban', 'Vague', 'Coin', 'Triangle', 'Flèche']) await s.bouton(`Ajouter : ${nom}`);
  d = await s.doc();
  verifier('les dix décorations s’ajoutent', d.elements.filter((k) => !['rect', 'ellipse', 'ligne', undefined].includes(k.forme?.nature)).length === 10);
  // Disposées en ligne pour la capture
  const ids = d.elements.filter((k) => k.type === 'forme').map((k) => k.id);
  await s.onglet('Calques');
  for (let i = 0; i < ids.length; i++) {
    await page.eval(`document.querySelectorAll('[data-testid="calques"] li')[${ids.length - 1 - i}].querySelector('button').click()`);
    await attendre(60);
    await s.champ('Hauteur (cm)', '16');
    await s.champ('Centre X (cm)', String(22 + i * 25));
    await s.champ('Centre Y (cm)', '82');
  }
  await s.touche('Escape');

  // --- Fond
  await s.onglet('Fond');
  await page.eval(`document.querySelectorAll('button[aria-label="Couleur #C8A24A"]')[0].click()`);
  verifier('couleur de fond', (await s.doc()).fond.couleur === '#C8A24A');
  await s.fichier('import-fond', join(temporaire, 'photo.jpg'));
  d = await s.doc();
  verifier('image de fond', d.fond.type === 'image' && d.fond.ajustement === 'cover' && (await s.texte('fond-image')).includes('photo.jpg'), d.fond);
  verifier('fond peint à l’écran', rouge(await couleur(300, 120)) && bleu(await couleur(2700, 120)));
  await s.champ('Placement de l’image de fond', 'contain');
  verifier('image entière : la couleur du fond apparaît sur les côtés', (await couleur(200, 120))[0] > 180 && (await couleur(200, 120))[1] > 130, await couleur(200, 120));
  await s.onglet('Contrôles');
  verifier('définition du fond contrôlée', (await s.texte('alertes')).includes('image de fond'), await s.texte('alertes'));
  await s.capture('35-formes-fond');
  await s.onglet('Format');
  await s.champ('Distance de lecture', '10');
  verifier('distance de lecture enregistrée', (await s.doc()).qualite.distanceLectureM === 10);

  // --- Aperçu et rechargement
  await s.bouton('Aperçu');
  await page.attendre(`document.querySelector('dialog[open] canvas')?.width === 1600`);
  await s.capture('36-apercu');
  await s.bouton('Fermer l’aperçu');
  d = await s.doc();
  await s.ouvrir();
  await attendre(600);
  verifier('rechargement : document identique', JSON.stringify(await page.eval(LIRE)) === JSON.stringify(d));
  await s.onglet('Contrôles');
  verifier('rechargement : images et polices retrouvées', !/introuvable|indisponible/.test(await s.texte('alertes')), await s.texte('alertes'));
  verifier('rechargement : fond repeint', bleu(await couleur(2100, 120)));

  // --- Police impossible à charger
  page.sur('Fetch.requestPaused', (p) => void page.envoyer('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionFailed' }).catch(() => {}));
  await page.envoyer('Fetch.enable', { patterns: [{ urlPattern: '*/fonts/studio/bangers*' }] });
  await s.onglet('Ajouter');
  await s.bouton('Ajouter un texte');
  const attendues = s.erreurs.length;
  await s.champ('Police', 'bangers');
  await attendre(500);
  await s.onglet('Contrôles');
  verifier('police impossible à charger : alerte critique', (await s.texte('alertes')).includes('indisponible'), await s.texte('alertes'));
  await s.capture('37-police-indisponible');
  s.erreurs.splice(attendues);

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
  const deborde = () => page.eval(`document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth || [...document.querySelectorAll('section, dialog[open]')].some((x) => x.scrollWidth > x.clientWidth + 1)`);
  const nav = 'nav[aria-label="Outils du Studio"]';
  for (const nom of ['Ajouter', 'Fond']) {
    await s.bouton(nom, nav);
    verifier(`panneau ${nom} : pas de débordement`, !(await deborde()));
    await s.capture(`40-mobile-${nom.toLowerCase()}`);
    if (nom === 'Fond') await s.bouton('Fermer le panneau');
  }
  await s.bouton('Ajouter', nav);
  await s.fichier('import-image', LOGO);
  await s.bouton('Modifier l’élément');
  verifier('réglages d’une image : pas de débordement', !(await deborde()));
  await s.capture('41-mobile-image');
  await s.bouton('Recadrer l’image');
  await page.attendre(`!!document.querySelector('dialog[open] [data-testid="zone-recadrage"]')`);
  await attendre(250);
  verifier('recadrage plein écran, sans débordement', !(await deborde()) && (await page.eval(`(() => { const r = document.querySelector('dialog[open]').getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; })()`)));
  await s.bouton('Libre', 'dialog[open]');
  const z = await s.rect('[data-testid="zone-recadrage"]');
  const doigt = async (type, points) => {
    await page.envoyer('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    await attendre(40);
  };
  await doigt('touchStart', [[z.x + z.l, z.y + z.h]]);
  for (let i = 1; i <= 6; i++) await doigt('touchMove', [[z.x + z.l - (z.l * 0.4 * i) / 6, z.y + z.h - (z.h * 0.4 * i) / 6]]);
  await doigt('touchEnd', []);
  await s.capture('42-mobile-recadrage');
  await s.bouton('Appliquer le recadrage');
  const im = await s.element();
  verifier('recadrage au doigt', proche(im.image.recadrage.l, 0.6, 0.04) && proche(im.image.recadrage.h, 0.6, 0.04), im.image.recadrage);
  await s.bouton('Fermer le panneau');
  await s.bouton('Ajouter', nav);
  await s.bouton('Ajouter un texte');
  await s.bouton('Modifier l’élément');
  verifier('réglages d’un texte : pas de débordement', !(await deborde()));
  const petites = await page.eval(`[...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.height < 40 || r.width < 32); }).map((b) => b.getAttribute('aria-label') ?? b.textContent)`);
  verifier('cibles tactiles assez grandes', petites.length === 0, petites.join(', '));
  await s.capture('43-mobile-texte');
  verifier('aucune erreur ni avertissement de console', s.erreurs.length === 0, s.erreurs.join(' | ').slice(0, 800));
  await page.close();
}

const chrome = await lancerChrome({ port: 9378 });
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

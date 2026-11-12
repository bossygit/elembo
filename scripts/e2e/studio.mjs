// Essai de bout en bout du studio textile Elembo (Chrome headless, CDP).
//
//   node scripts/e2e/make-fixtures.mjs
//   npm run dev            # dans un autre terminal
//   node scripts/e2e/studio.mjs
//
// Couvre : chargement du GLB, cinq zones indépendantes, couleur du tissu, textes, images
// transparentes, déplacement/undo/redo, caméra par zone, panier + rechargement, export des
// fichiers de production (noms et dimensions), affichage mobile et gestes tactiles.
//
// Les captures sont écrites dans docs/captures/. Le code de sortie est 1 si un contrôle
// échoue, 0 sinon.

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lancerChrome, ouvrirPage, duree } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAPTURES = join(racine, 'docs', 'captures');
const TELECHARGEMENTS = '/tmp/elembo-e2e-downloads';
const BASE = process.env.STUDIO_URL ?? 'http://localhost:3000/personnalisation';
const FIXTURE = join(racine, 'tests', 'fixtures', 'logo-transparent.png');

mkdirSync(CAPTURES, { recursive: true });
rmSync(TELECHARGEMENTS, { recursive: true, force: true });
mkdirSync(TELECHARGEMENTS, { recursive: true });

const resultats = [];
let echecs = 0;

function verifier(nom, condition, details = '') {
  const ok = Boolean(condition);
  if (!ok) echecs++;
  resultats.push({ nom, ok, details });
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${details ? ` — ${details}` : ''}`);
}

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pause = (page, ms) => attendre(ms);
const lire = (page, expression) => page.eval(expression);

/** Masque l'indicateur de développement de Next (il apparaît sur les captures). */
async function masquerIndicateurDev(page) {
  await page.eval(
    `(() => { if (document.getElementById('elembo-e2e-style')) return true; const style = document.createElement('style'); style.id = 'elembo-e2e-style'; style.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(style); return true; })()`,
  );
}

/** Attend le chargement du GLB et de ses cinq zones. */
async function attendreStudio(page) {
  await page.attendre(
    `!!(window.__elembo3d && window.__elembo3d.zones && window.__elembo3d.zones().length === 5) && !document.body.innerText.includes('Chargement du modèle')`,
    { timeoutMs: 60000, message: 'modèle 3D et cinq zones' },
  );
  await pause(page, 400);
  await masquerIndicateurDev(page);
}

async function capture(page, nom) {
  await page.screenshot(join(CAPTURES, nom));
}

async function cliquerTestId(page, testId) {
  const ok = await lire(
    page,
    `(() => { const el = document.querySelector('[data-testid="${testId}"]'); if (!el) return false; el.click(); return true; })()`,
  );
  if (!ok) throw new Error(`Élément introuvable : ${testId}`);
}

async function onglet(page, label) {
  const ok = await lire(
    page,
    `(() => { const b = [...document.querySelectorAll('[aria-label="Sections du studio"] [role="tab"]')].find((e) => e.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`,
  );
  if (!ok) throw new Error(`Onglet introuvable : ${label}`);
}

/** Change la valeur d'un champ contrôlé par React (textarea/input). */
async function saisir(page, selecteur, valeur) {
  await page.eval(
    `(() => {
      const el = document.querySelector(${JSON.stringify(selecteur)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valeur)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  await pause(page, 250);
}

async function glisser(page, depart, arrivee) {
  await page.souris('mouseMoved', depart.x, depart.y);
  await page.souris('mousePressed', depart.x, depart.y);
  for (let i = 1; i <= 8; i++) {
    await page.souris(
      'mouseMoved',
      depart.x + ((arrivee.x - depart.x) * i) / 8,
      depart.y + ((arrivee.y - depart.y) * i) / 8,
    );
    await attendre(20);
  }
  await page.souris('mouseReleased', arrivee.x, arrivee.y);
  await pause(page, 300);
}

/** Coordonnées d'un élément du design dans l'éditeur 2D (centre, en pixels écran). */
async function pointElement(page, elementTestId) {
  return lire(
    page,
    `(() => {
      const item = document.querySelector('[data-testid="${elementTestId}"]');
      if (!item) return null;
      const id = item.getAttribute('data-testid').replace('element-', '');
      const editeur = window.__elemboEditor;
      const canvas = document.querySelector('[data-testid="design-canvas"]');
      if (!editeur || !canvas) return null;
      const rect = editeur.rect(id);
      if (!rect) return null;
      const boite = canvas.getBoundingClientRect();
      return {
        id,
        x: boite.x + ((rect.x + rect.w / 2) / editeur.space.width) * boite.width,
        y: boite.y + ((rect.y + rect.h / 2) / editeur.space.height) * boite.height,
        rect,
        canvas: { x: boite.x, y: boite.y, width: boite.width, height: boite.height },
      };
    })()`,
  );
}

function infoPng(chemin) {
  const buf = readFileSync(chemin);
  const signature = buf.subarray(0, 8).toString('hex');
  return {
    signature,
    png: signature === '89504e470d0a1a0a',
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
    octets: buf.length,
  };
}

const chrome = await lancerChrome({ port: 9350 });
const debut = Date.now();
const exceptions = [];

try {
  const page = await ouvrirPage(chrome, { width: 1440, height: 1000 });
  page.sur('Runtime.exceptionThrown', (p) => exceptions.push(p.exceptionDetails?.exception?.description ?? 'exception'));
  await page.goto(BASE);
  await attendreStudio(page);

  /* ── 1. Chargement et structure ─────────────────────────────────────────── */
  const zones = await lire(page, `window.__elembo3d.zones()`);
  verifier('GLB chargé : cinq surfaces d’impression', zones.length === 5, zones.map((z) => z.mesh).join(', '));
  verifier(
    'noms de maillages réels conformes au GLB',
    ['TSHIRT_FRONT_PRINT', 'TSHIRT_BACK_PRINT', 'TSHIRT_LEFT_SLEEVE_PRINT', 'TSHIRT_RIGHT_SLEEVE_PRINT', 'TSHIRT_COLLAR_PRINT'].every(
      (nom) => zones.some((z) => z.mesh === nom),
    ),
  );
  const stats0 = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier(
    'textures de zones aux dimensions physiques (isotropes)',
    stats0.find((z) => z.side === 'front')?.width === 1024 &&
      stats0.find((z) => z.side === 'front')?.height === 1280 &&
      stats0.find((z) => z.side === 'left-sleeve')?.height === 512 &&
      stats0.find((z) => z.side === 'collar')?.width === 512,
    stats0.map((z) => `${z.side}:${z.width}×${z.height}`).join(' '),
  );
  verifier('aucun visuel au départ', stats0.every((z) => z.alphaPixels === 0));
  await capture(page, 'studio-desktop-initial.png');

  // Rotation et zoom à la souris sur la scène 3D (interactions conservées).
  const boite3d = await lire(
    page,
    `(() => { const c = document.querySelector('canvas[data-engine]'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`,
  );
  const centre3d = { x: boite3d.x + boite3d.w / 2, y: boite3d.y + boite3d.h / 2 };
  const avantRotation = await lire(page, `window.__elembo3d.orbit()`);
  await glisser(page, centre3d, { x: centre3d.x + 120, y: centre3d.y });
  const apresRotation = await lire(page, `window.__elembo3d.orbit()`);
  verifier(
    'la souris fait tourner le modèle 360°',
    Math.abs(apresRotation.azimut - avantRotation.azimut) > 0.15,
    `azimut ${avantRotation.azimut} → ${apresRotation.azimut}`,
  );
  await page.envoyer('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: centre3d.x,
    y: centre3d.y,
    deltaX: 0,
    deltaY: -240,
  });
  await pause(page, 500);
  const apresZoom = await lire(page, `window.__elembo3d.orbit()`);
  verifier('la molette zoome le modèle', apresZoom.distance < apresRotation.distance, `distance ${apresRotation.distance} → ${apresZoom.distance}`);
  await cliquerTestId(page, 'reset-camera');
  await pause(page, 500);

  /* ── 2. Couleur du vêtement ─────────────────────────────────────────────── */
  await onglet(page, 'Produit');
  await pause(page, 400);
  await cliquerTestId(page, 'couleur-noir');
  await pause(page, 700);
  const zonesNoir = await lire(page, `window.__elembo3d.zones()`);
  verifier('couleur du tissu appliquée aux cinq zones', zonesNoir.every((z) => z.fabricColor === '#1a1a1c'));
  const pixelsNoir = await lire(page, `window.__elembo3d.readPixels()`);
  verifier('le rendu 3D assombrit effectivement le tissu', pixelsNoir.sombres > 2000, `pixels sombres : ${pixelsNoir.sombres}`);
  const statsApresCouleur = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier('changer la couleur ne modifie aucune texture de zone', statsApresCouleur.every((z) => z.alphaPixels === 0));
  await capture(page, 'studio-desktop-couleur.png');
  await onglet(page, 'Créer');
  await pause(page, 400);

  /* ── 3. Texte avant, déplacement, annuler/rétablir ──────────────────────── */
  await cliquerTestId(page, 'add-text');
  await pause(page, 500);
  await saisir(page, '[data-testid="text-content"]', 'ELEMBO');
  verifier('texte ajouté dans la zone avant', (await lire(page, `document.querySelectorAll('[data-testid="element-list"] [data-testid^="element-"]').length`)) === 1);
  const statsTexte = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier(
    'le texte est composé dans la texture 3D de la zone avant uniquement',
    statsTexte.find((z) => z.side === 'front').alphaPixels > 0 &&
      statsTexte.filter((z) => z.side !== 'front').every((z) => z.alphaPixels === 0),
    `alpha avant : ${statsTexte.find((z) => z.side === 'front').alphaPixels}`,
  );

  const avant = await pointElement(page, 'element-text-001');
  await glisser(page, { x: avant.x, y: avant.y }, { x: avant.x + 42, y: avant.y + 30 });
  const apres = await pointElement(page, 'element-text-001');
  verifier('glisser déplace l’élément dans la zone', Math.abs(apres.rect.x - avant.rect.x) > 20, `Δx=${(apres.rect.x - avant.rect.x).toFixed(1)} px`);

  await cliquerTestId(page, 'undo');
  await pause(page, 300);
  const apresUndo = await pointElement(page, 'element-text-001');
  verifier('annuler restaure la position précédente', Math.abs(apresUndo.rect.x - avant.rect.x) < 2);
  await cliquerTestId(page, 'redo');
  await pause(page, 300);
  const apresRedo = await pointElement(page, 'element-text-001');
  verifier('rétablir rejoue le déplacement', Math.abs(apresRedo.rect.x - apres.rect.x) < 2);

  /* ── 4. Image PNG transparente ──────────────────────────────────────────── */
  await page.envoyerFichiers('[data-testid="design-input"]', [FIXTURE]);
  await page.attendre(`document.querySelectorAll('[data-testid="element-list"] [data-testid^="element-"]').length === 2`, {
    timeoutMs: 15000,
    message: 'image ajoutée',
  });
  await pause(page, 700);
  const statsImage = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier(
    'image transparente composée dans la zone avant',
    statsImage.find((z) => z.side === 'front').alphaPixels > statsTexte.find((z) => z.side === 'front').alphaPixels,
    `alpha avant : ${statsTexte.find((z) => z.side === 'front').alphaPixels} → ${statsImage.find((z) => z.side === 'front').alphaPixels}`,
  );
  const couleursImage = statsImage.find((z) => z.side === 'front').couleurs.join(' ');
  verifier('les pixels du logo orange sont bien dans la texture', couleursImage.includes('255,90,18') || couleursImage.includes('254,90,18'), couleursImage);
  await capture(page, 'studio-desktop-image.png');

  /* ── 5. Cinq zones indépendantes et caméra ──────────────────────────────── */
  const baselineAvant = (await lire(page, `window.__elembo3d.zoneStats()`)).find((z) => z.side === 'front').alphaPixels;

  await cliquerTestId(page, 'zone-back');
  await page.attendre(`Math.abs(Math.abs(window.__elembo3d.orbit().azimut) - Math.PI) < 0.12`, {
    timeoutMs: 8000,
    message: 'caméra dos',
  });
  await cliquerTestId(page, 'add-text');
  await pause(page, 400);
  await saisir(page, '[data-testid="text-content"]', 'DOS ELEMBO');
  const statsDos = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier(
    'personnaliser le dos ne contamine pas l’avant',
    statsDos.find((z) => z.side === 'back').alphaPixels > 0 &&
      statsDos.find((z) => z.side === 'front').alphaPixels === baselineAvant,
  );

  await cliquerTestId(page, 'zone-left-sleeve');
  await page.attendre(`Math.abs(window.__elembo3d.orbit().azimut - 1.396) < 0.25`, {
    timeoutMs: 8000,
    message: 'caméra manche gauche',
  });
  verifier('la caméra présente la manche gauche (azimut ≈ 80°)', true);
  await page.envoyerFichiers('[data-testid="design-input"]', [FIXTURE]);
  await pause(page, 900);

  await cliquerTestId(page, 'zone-right-sleeve');
  await pause(page, 1200);
  await page.envoyerFichiers('[data-testid="design-input"]', [FIXTURE]);
  await pause(page, 900);

  await cliquerTestId(page, 'zone-collar');
  await page.attendre(`window.__elembo3d.orbit().polaire < 1.0`, { timeoutMs: 8000, message: 'caméra col' });
  await cliquerTestId(page, 'add-text');
  await pause(page, 400);
  await saisir(page, '[data-testid="text-content"]', 'E');
  await pause(page, 500);

  const statsCinq = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier(
    'les cinq zones portent un visuel distinct',
    statsCinq.every((z) => z.alphaPixels > 0),
    statsCinq.map((z) => `${z.side}:${z.alphaPixels}`).join(' '),
  );
  verifier(
    'l’avant n’a pas été contaminé par les autres zones',
    statsCinq.find((z) => z.side === 'front').alphaPixels === baselineAvant,
  );
  await capture(page, 'studio-desktop-cinq-zones.png');

  // Retour sur une zone déjà personnalisée : les visuels sont conservés.
  await cliquerTestId(page, 'zone-front');
  await pause(page, 1200);
  verifier(
    'revenir sur une zone ne perd rien',
    (await lire(page, `document.querySelectorAll('[data-testid="element-list"] [data-testid^="element-"]').length`)) === 2,
  );

  /* ── 6. La couleur ne modifie toujours aucun visuel ─────────────────────── */
  const avantCouleur = await lire(page, `window.__elembo3d.zoneStats()`);
  await onglet(page, 'Produit');
  await pause(page, 300);
  await cliquerTestId(page, 'couleur-orange-elembo');
  await pause(page, 700);
  const apresCouleur = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier(
    'changer la couleur du tissu ne touche pas les visuels imprimés',
    JSON.stringify(avantCouleur.map((z) => [z.side, z.alphaPixels, z.couleurs])) ===
      JSON.stringify(apresCouleur.map((z) => [z.side, z.alphaPixels, z.couleurs])),
  );
  verifier(
    'la couleur orange est appliquée au tissu',
    (await lire(page, `window.__elembo3d.zones()`)).every((z) => z.fabricColor === '#ff5a12'),
  );
  await onglet(page, 'Créer');
  await pause(page, 300);

  /* ── 7. Panier, brouillon, rechargement ─────────────────────────────────── */
  await cliquerTestId(page, 'ajouter-panier');
  await page.attendre(`JSON.parse(localStorage.getItem('elembo.panier.v1') ?? '[]').length === 1`, {
    timeoutMs: 10000,
    message: 'panier enregistré',
  });
  const panier = await lire(page, `JSON.parse(localStorage.getItem('elembo.panier.v1'))[0]`);
  verifier('le panier conserve le procédé de production', panier.config.profileId === 'dtf');
  verifier(
    'le panier conserve les cinq zones et leurs éléments',
    new Set(panier.config.elements.map((el) => el.side)).size === 5,
    `${panier.config.elements.length} éléments, zones : ${[...new Set(panier.config.elements.map((el) => el.side))].join(', ')}`,
  );
  verifier('le panier conserve un aperçu', typeof panier.apercu === 'string' && panier.apercu.startsWith('data:image/'));

  await cliquerTestId(page, 'enregistrer-projet');
  await page.attendre(`JSON.parse(localStorage.getItem('elembo.projets.v1') ?? '[]').length === 1`, {
    timeoutMs: 10000,
    message: 'projet enregistré',
  });

  await pause(page, 1600); // laisse le brouillon automatique s'écrire
  const avantRechargement = await lire(page, `document.querySelectorAll('[data-testid="element-list"] [data-testid^="element-"]').length`);
  await page.envoyer('Page.reload');
  await attendreStudio(page);
  const apresRechargement = await lire(page, `document.querySelectorAll('[data-testid="element-list"] [data-testid^="element-"]').length`);
  verifier(
    'le brouillon restaure le travail après rechargement',
    apresRechargement >= 2,
    `${avantRechargement} éléments sur la zone, brouillon restauré`,
  );
  const statsRechargement = await lire(page, `window.__elembo3d.zoneStats()`);
  verifier(
    'les images sont ré-attachées depuis IndexedDB après rechargement',
    statsRechargement.find((z) => z.side === 'front').alphaPixels > 0,
  );
  verifier(
    'la couleur et le procédé sont restaurés',
    (await lire(page, `window.__elembo3d.zones()`)).every((z) => z.fabricColor === '#ff5a12'),
  );
  await capture(page, 'studio-desktop-rechargement.png');

  /* ── 8. Procédés : dimensions et blocage honnête de la commande ─────────── */
  await onglet(page, 'Produit');
  await pause(page, 400);
  await cliquerTestId(page, 'profil-flex');
  await pause(page, 500);
  const texteFlex = await lire(page, `document.body.innerText`);
  verifier('changer de procédé change les dimensions imprimables', texteFlex.includes('28 × 35 cm'));
  await cliquerTestId(page, 'profil-dtf');
  await pause(page, 500);
  const texteDtf = await lire(page, `document.body.innerText`);
  verifier('le procédé DTF rétablit ses dimensions', texteDtf.includes('21 × 30 cm'));

  await onglet(page, 'Commande');
  await pause(page, 700);
  const commandeEtat = await lire(
    page,
    `(() => ({
      texte: document.body.innerText,
      payer: document.querySelector('[data-testid="payer-momo"]')?.disabled ?? null,
      apercus: document.querySelectorAll('[data-testid^="apercu-"]').length,
    }))()`,
  );
  verifier(
    'la commande est bloquée pour les zones non validées (manches, col)',
    commandeEtat.texte.includes('Pressage sur manche') && commandeEtat.payer === true,
  );
  verifier('l’aperçu de commande montre les cinq zones', commandeEtat.apercus === 5, `${commandeEtat.apercus} aperçus`);

  /* ── 9. Export des fichiers de production ───────────────────────────────── */
  await page.envoyer('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: TELECHARGEMENTS });
  await pause(page, 300);
  await cliquerTestId(page, 'exporter-production');
  await attendre(2500);
  const fichiers = readdirSync(TELECHARGEMENTS).filter((f) => f.endsWith('.png')).sort();
  const attendus = ['back.png', 'collar.png', 'front.png', 'left-sleeve.png', 'right-sleeve.png'];
  verifier('export : cinq fichiers nommés par zone', attendus.every((nom) => fichiers.includes(nom)), fichiers.join(', '));

  const dimensionsAttendues = {
    'front.png': [2480, 3543],
    'back.png': [2953, 3827],
    'left-sleeve.png': [1063, 1063],
    'right-sleeve.png': [1063, 1063],
    'collar.png': [945, 531],
  };
  for (const nom of attendus) {
    const chemin = join(TELECHARGEMENTS, nom);
    let info = null;
    try {
      info = infoPng(chemin);
    } catch {
      // fichier absent : déjà signalé
    }
    verifier(
      `export ${nom} : PNG transparent aux dimensions physiques`,
      info?.png && info.colorType === 6 && info.width === dimensionsAttendues[nom][0] && info.height === dimensionsAttendues[nom][1],
      info ? `${info.width}×${info.height}, type ${info.colorType}` : 'fichier absent',
    );
  }

  /* ── 10. Page panier et reprise ─────────────────────────────────────────── */
  await page.goto('http://localhost:3000/panier');
  await page.attendre(`document.querySelectorAll('[data-testid="carte-projet"]').length >= 1`, {
    timeoutMs: 20000,
    message: 'panier affiché',
  });
  const cartes = await lire(
    page,
    `[...document.querySelectorAll('[data-testid="carte-projet"]')].map((li) => li.innerText).join(' | ')`,
  );
  verifier('la page panier liste la création', cartes.includes('T-shirt Elembo'), cartes.slice(0, 140));
  await lire(
    page,
    `(() => { const carte = document.querySelector('[data-testid="carte-projet"]'); const b = [...carte.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Modifier'); b?.click(); return !!b; })()`,
  );
  await page.attendre(`location.pathname.endsWith('/personnalisation')`, { timeoutMs: 15000, message: 'reprise atelier' });
  await attendreStudio(page);
  verifier(
    '« Modifier » recharge la création dans le studio',
    (await lire(page, `document.querySelectorAll('[data-testid="element-list"] [data-testid^="element-"]').length`)) >= 2,
  );

  /* ── 11. Mobile ─────────────────────────────────────────────────────────── */
  const mobile = await ouvrirPage(chrome, { width: 390, height: 844, mobile: true });
  mobile.sur('Runtime.exceptionThrown', (p) => exceptions.push(p.exceptionDetails?.exception?.description ?? 'exception mobile'));
  await mobile.envoyer('Storage.clearDataForOrigin', {
    origin: 'http://localhost:3000',
    storageTypes: 'local_storage',
  });
  await mobile.goto(BASE);
  await attendreStudio(mobile);
  await pause(mobile, 600);
  await masquerIndicateurDev(mobile);
  const mobileEtat = await lire(
    mobile,
    `(() => {
      const rail = document.querySelector('[data-testid="zone-rail"]')?.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: document.documentElement.clientWidth,
        railVisible: rail ? rail.width > 0 && rail.top < window.innerHeight : false,
        panierVisible: !!document.querySelector('[data-testid="ajouter-panier"]'),
        zones: document.querySelectorAll('[data-testid^="zone-"]').length,
      };
    })()`,
  );
  verifier('mobile : aucun débordement horizontal', mobileEtat.scrollWidth <= mobileEtat.innerWidth + 2, `${mobileEtat.scrollWidth}px / ${mobileEtat.innerWidth}px`);
  verifier('mobile : rail de zones et actions visibles', mobileEtat.railVisible && mobileEtat.panierVisible && mobileEtat.zones >= 6);
  await capture(mobile, 'studio-mobile-initial.png');

  await cliquerTestId(mobile, 'zone-left-sleeve');
  await pause(mobile, 1200);
  await cliquerTestId(mobile, 'add-text');
  await pause(mobile, 500);
  await saisir(mobile, '[data-testid="text-content"]', 'MANCHE');
  const mobileTexte = await lire(mobile, `window.__elembo3d.zoneStats().find((z) => z.side === 'left-sleeve').alphaPixels`);
  verifier('mobile : un texte peut être ajouté sur une manche', mobileTexte > 0, `alpha : ${mobileTexte}`);

  // Geste tactile : glisser le texte dans l'éditeur (on amène d'abord l'éditeur à l'écran,
  // sinon les coordonnées tactiles tombent hors du viewport mobile).
  await mobile.eval(`(() => { document.querySelector('[data-testid="design-canvas"]')?.scrollIntoView({ block: 'center' }); return true; })()`);
  await pause(mobile, 600);
  const saisieMobile = await pointElement(mobile, 'element-text-001');
  if (saisieMobile) {
    await mobile.envoyer('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: saisieMobile.x, y: saisieMobile.y, id: 1 }] });
    for (let i = 1; i <= 6; i++) {
      await mobile.envoyer('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: saisieMobile.x + (30 * i) / 6, y: saisieMobile.y + (20 * i) / 6, id: 1 }],
      });
      await attendre(30);
    }
    await mobile.envoyer('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(mobile, 400);
    const apresTactile = await pointElement(mobile, 'element-text-001');
    verifier('mobile : le glisser tactile déplace l’élément', Math.abs(apresTactile.rect.x - saisieMobile.rect.x) > 5);
  } else {
    verifier('mobile : élément sélectionnable dans l’éditeur', false, 'élément introuvable');
  }
  await capture(mobile, 'studio-mobile-manche.png');

  /* ── 12. Aucune exception JS ────────────────────────────────────────────── */
  verifier('aucune exception JavaScript pendant les essais', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));

  console.log(`\n${resultats.filter((r) => r.ok).length}/${resultats.length} contrôles OK — ${duree(Date.now() - debut)}`);
  console.log(`Captures : ${CAPTURES}`);
  await page.close();
  await mobile.close();
} catch (erreur) {
  console.error('\nEssai interrompu :', erreur instanceof Error ? erreur.stack : erreur);
  echecs++;
} finally {
  await chrome.fermer();
}

if (echecs > 0) {
  console.error(`\n${echecs} contrôle(s) en échec.`);
  process.exitCode = 1;
}

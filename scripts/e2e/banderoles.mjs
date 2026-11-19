// Essai de bout en bout de l'offre « Banderoles & grand format » (Chrome headless, CDP).
//
// ⚠️ À lancer UNIQUEMENT contre un environnement local ou de test (Supabase local, Redis local) :
// le scénario crée un vrai devis, une commande et des coûts.
//
//   BANDEROLES_URL=http://localhost:3100 \
//   BANDEROLES_ADMIN_EMAIL=… BANDEROLES_ADMIN_MOT_DE_PASSE=… \
//   BANDEROLES_CAPTURES=/chemin/captures \
//   node scripts/e2e/banderoles.mjs
//
// Couvre : rubrique publique (bureau + mobile), parcours en six étapes, envoi d'un fichier dans
// le stockage privé, création du devis, suivi client ; puis back-office : liste, chiffrage,
// proposition générée, acceptation, commande, planning imprimeur, coûts réels et marge.
// Code de sortie 1 si un contrôle échoue.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.env.BANDEROLES_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const CAPTURES = process.env.BANDEROLES_CAPTURES ?? join(racine, 'docs', 'captures', 'banderoles');
const FIXTURE = join(racine, 'tests', 'fixtures', 'photo-opaque.jpg');
const EMAIL = process.env.BANDEROLES_ADMIN_EMAIL ?? '';
const MOT_DE_PASSE = process.env.BANDEROLES_ADMIN_MOT_DE_PASSE ?? '';

if (/vercel\.app|smartvision\.cg/.test(BASE)) {
  console.error('Refus : ce scénario écrit des données, il ne doit pas viser la production.');
  process.exit(2);
}
mkdirSync(CAPTURES, { recursive: true });

let echecs = 0;
function verifier(nom, condition, details = '') {
  if (!condition) echecs++;
  console.log(`${condition ? 'OK  ' : 'ÉCHEC'} ${nom}${details ? ` — ${details}` : ''}`);
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Saisie dans un champ contrôlé par React (setter natif + événement input). */
const saisir = (selecteur, valeur) => `(() => {
  const el = document.querySelector(${JSON.stringify(selecteur)});
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(valeur))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;
const bouton = (texte) => `(() => {
  const b = [...document.querySelectorAll('button, a')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (!b) return false; b.click(); return true;
})()`;
const radio = (name, value) => `(() => {
  const r = document.querySelector('input[name=${JSON.stringify(name)}][value=${JSON.stringify(value)}]') ?? [...document.querySelectorAll('input[name=${JSON.stringify(name)}]')].find((x) => x.closest('label')?.textContent.includes(${JSON.stringify(value)}));
  if (!r) return false; r.click(); return true;
})()`;
/** Texte visible, espaces insécables (séparateurs de milliers fr-FR) normalisés. */
const texte = (selecteur = 'body') => `(document.querySelector(${JSON.stringify(selecteur)})?.innerText ?? '').replace(/[\\u00a0\\u202f]/g, ' ')`;
const titre = () => `(document.querySelector('h2[tabindex="-1"]')?.textContent ?? '')`;

/** Remplit puis soumet un formulaire serveur du back-office (repéré par un de ses champs). */
async function soumettre(page, champ, valeurs) {
  // Attendre l'hydratation : le back-office envoie `Referrer-Policy: no-referrer`, et une
  // soumission native (avant React) part avec `Origin: null`, refusée par les Server Actions.
  await page.attendre(`Object.keys(document.querySelector('[name=${JSON.stringify(champ)}]')?.closest('form') ?? {}).some((k) => k.startsWith('__react'))`, { timeoutMs: 20000 });
  await page.eval(`(() => {
    const form = document.querySelector('[name=${JSON.stringify(champ)}]')?.closest('form');
    if (!form) return false;
    for (const [k, v] of Object.entries(${JSON.stringify(valeurs)})) {
      const el = form.querySelector('[name="' + k + '"]');
      if (el) el.value = v;
    }
    form.requestSubmit(); return true;
  })()`);
  await attendre(400);
  await page.attendre(`document.readyState === 'complete' && !location.href.includes('#__pending')`, { timeoutMs: 20000 });
  await attendre(1200);
}

const chrome = await lancerChrome({ port: 9341 });
try {
  /* ------------------------------------------------------------ vitrine ---- */
  const page = await ouvrirPage(chrome, { width: 1440, height: 1000 });
  await page.goto(`${BASE}/banderoles`);
  await page.attendre(`document.querySelector('h1')?.textContent.includes('en grand')`);
  await page.screenshot(join(CAPTURES, '01-rubrique-bureau.png'), { fullPage: true });
  const cartes = await page.eval(`document.querySelectorAll('#categories article').length`);
  verifier('six catégories présentées', cartes === 6, `${cartes}`);
  const prixAffiche = await page.eval(`/\\d[\\d\\s]*FCFA/.test(document.querySelector('main')?.innerText ?? '')`);
  verifier('aucun prix affiché sur la rubrique (les prix passent par l’estimation ou le devis)', !prixAffiche);

  const mobile = await ouvrirPage(chrome, { width: 390, height: 844, mobile: true });
  await mobile.goto(`${BASE}/banderoles`);
  await mobile.attendre(`document.querySelector('h1') !== null`);
  await mobile.screenshot(join(CAPTURES, '02-rubrique-mobile.png'));
  const debord = await mobile.eval(`document.documentElement.scrollWidth - window.innerWidth`);
  verifier('aucun défilement horizontal sur mobile', debord <= 1, `${debord}px`);

  /* ----------------------------------------------------------- parcours ---- */
  await mobile.goto(`${BASE}/banderoles/commander?usage=eglise`);
  await mobile.attendre(`${titre()}.includes('caractéristiques')`);
  verifier('catégorie présélectionnée depuis l’URL', true);
  // Saisir avant l'hydratation serait écrasé par React : on attend que les champs soient « vivants ».
  await mobile.attendre(`Object.keys(document.querySelector('input[inputmode="decimal"]') ?? {}).some((k) => k.startsWith('__react'))`);
  await mobile.eval(saisir('input[inputmode="decimal"]', '4,5'));
  await mobile.eval(`(() => {
    const el = document.querySelectorAll('input[inputmode="decimal"]')[1];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '1,2');
    el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await mobile.eval(`document.querySelector('[aria-label="Augmenter la quantité"]').click()`);
  await mobile.eval(radio('finition', 'Ourlets + œillets'));
  await mobile.eval(radio('delai', 'Pour une date précise'));
  await attendre(200);
  const dans30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await mobile.eval(saisir('input[type="date"]', dans30));
  await mobile.eval(saisir('textarea', 'Grande croisade — verset Hébreux 13:8, du 12 au 15 décembre, esplanade.'));
  await attendre(300);
  await mobile.screenshot(join(CAPTURES, '03-caracteristiques-mobile.png'), { fullPage: true });
  await mobile.eval(bouton('Continuer'));
  await mobile.attendre(`${titre()}.includes('accompagnement')`);

  await mobile.eval(radio('prestation', 'Créez mon visuel'));
  await mobile.eval(bouton('Continuer'));
  await mobile.attendre(`${titre()}.includes('fichiers')`);
  await mobile.envoyerFichiers('input[type="file"]', [FIXTURE]);
  await mobile.attendre(`document.body.innerText.includes('photo-opaque.jpg')`);
  verifier('fichier ajouté à la demande', true);
  await mobile.eval(bouton('Continuer'));
  await mobile.attendre(`${titre()}.includes('prix')`);
  await mobile.attendre(`!document.body.innerText.includes('Calcul de votre estimation')`);
  await mobile.screenshot(join(CAPTURES, '04-prix-sur-devis-mobile.png'), { fullPage: true });
  // Sans grille validée : « prix sur devis » sans aucun montant. Avec une grille validée :
  // le montant affiché est exactement celui que calcule l'API serveur.
  const zonePrix = await mobile.eval(texte('[aria-live]'));
  const montantAffiche = zonePrix.match(/(\d[\d ]*) FCFA/)?.[1]?.replace(/ /g, '');
  if (zonePrix.toLowerCase().includes('prix sur devis')) {
    verifier('prix sur devis, aucun montant inventé', !montantAffiche);
  } else {
    const api = await mobile.eval(`fetch('/api/banderoles/estimation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usage: 'EGLISE', support: 'BANDEROLE', largeurM: '4.5', hauteurM: '1.2', quantite: 2, finition: 'OURLETS_OEILLETS', delai: 'DATE', dateSouhaitee: ${JSON.stringify(dans30)}, prestation: 'CREATION' }) }).then((r) => r.json())`);
    verifier('estimation affichée = estimation calculée par le serveur', api.estimation?.disponible && String(api.estimation.montantFcfa) === montantAffiche, `${montantAffiche} FCFA`);
  }

  await mobile.eval(bouton('Continuer'));
  await mobile.attendre(`${titre()}.includes('coordonnées')`);
  await mobile.eval(saisir('input[autocomplete="name"]', 'Pasteur Test Banderole'));
  await mobile.eval(saisir('input[autocomplete="tel"]', '06 123 45 67'));
  await mobile.eval(saisir('input[autocomplete="organization"]', 'Église La Source (test)'));
  await mobile.eval(`document.querySelector('input[type="checkbox"]').click()`);
  await mobile.eval(`[...document.querySelectorAll('button')].find((b) => /Demander mon devis|Envoyer ma commande/.test(b.textContent)).click()`);
  await mobile.attendre(`location.pathname.startsWith('/devis/DEV-') || document.querySelector('[role=alert]')`, { timeoutMs: 45000 });
  const alerte = await mobile.eval(`document.querySelector('[role=alert]')?.innerText ?? ''`);
  if (alerte) throw new Error(`Demande refusée par le serveur : ${alerte}`);
  const reference = await mobile.eval(`location.pathname.split('/').pop()`);
  verifier('demande enregistrée et suivi client ouvert', /^DEV-/.test(reference), reference);
  await mobile.attendre(`document.body.innerText.includes('Demande reçue')`, { timeoutMs: 20000 });
  await mobile.screenshot(join(CAPTURES, '05-suivi-client-mobile.png'), { fullPage: true });
  const fichierRecu = await mobile.eval(`document.body.innerText.includes('photo-opaque.jpg')`);
  verifier('fichier rattaché au devis (stockage privé)', fichierRecu);
  console.log(`REFERENCE=${reference}`);

  /* -------------------------------------------------------- back-office ---- */
  if (!EMAIL || !MOT_DE_PASSE) {
    console.log('Back-office ignoré : BANDEROLES_ADMIN_EMAIL / _MOT_DE_PASSE absents.');
  } else {
    await page.goto(`${BASE}/admin/connexion`);
    await page.attendre(`Object.keys(document.querySelector('input[name="email"]')?.closest('form') ?? {}).some((k) => k.startsWith('__react'))`);
    await page.eval(`(() => { document.querySelector('[name=email]').value = ${JSON.stringify(EMAIL)}; document.querySelector('[name=mot_de_passe]').value = ${JSON.stringify(MOT_DE_PASSE)}; document.querySelector('[name=email]').closest('form').requestSubmit(); return true; })()`);
    await page.attendre(`location.pathname === '/admin'`, { timeoutMs: 30000 });
    await page.goto(`${BASE}/admin/banderoles`);
    await page.attendre(`document.body.innerText.includes(${JSON.stringify(reference)})`);
    await page.screenshot(join(CAPTURES, '06-admin-liste.png'), { fullPage: true });
    verifier('demande visible dans le back-office', true);

    const lien = await page.eval(`[...document.querySelectorAll('a')].find((a) => a.textContent.includes(${JSON.stringify(reference)}))?.href`);
    await page.goto(lien);
    await page.attendre(`document.body.innerText.includes('Chiffrage')`);
    const partenaire = await page.eval(`[...document.querySelectorAll('select[name=partenaire_id] option')].find((o) => o.value)?.value ?? ''`);
    await soumettre(page, 'prix_impression_fcfa', {
      partenaire_id: partenaire,
      prix_impression_fcfa: '81000',
      frais_creation_fcfa: '15000',
      cout_impression_estime_fcfa: '40500',
      cout_creation_estime_fcfa: '5000',
      cout_livraison_estime_fcfa: '2000',
      production_prevue_le: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      livraison_prevue_le: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
    });
    verifier('chiffrage enregistré', await page.eval(`document.body.innerText.includes('Chiffrage enregistré')`));
    verifier('marge estimée calculée (96 000 − 47 500 = 48 500)', (await page.eval(texte())).includes('48 500 FCFA'));

    await soumettre(page, 'validite_jours', {});
    verifier('proposition générée et transmise', await page.eval(`document.body.innerText.includes('Proposition envoyée')`));
    await page.screenshot(join(CAPTURES, '07-admin-proposition.png'), { fullPage: true });

    await soumettre(page, 'decision', { decision: 'client_accepte' });
    await soumettre(page, 'mode_paiement', { livraison: '2000' });
    verifier('commande créée depuis le devis accepté', await page.eval(`/ELB-[A-Z0-9-]+/.test(document.body.innerText)`));

    await soumettre(page, 'cout_impression', { cout_impression: '42000', cout_creation: '5000', cout_livraison: '1500', cout_autres: '500' });
    verifier('coûts réels enregistrés', await page.eval(`document.body.innerText.includes('Coûts réels enregistrés')`));
    // Prix facturé 98 000 (96 000 + 2 000 livraison) − coûts 49 000 = 49 000
    verifier('marge finale = prix facturé − coûts réels (49 000)', (await page.eval(texte('#rentabilite'))).includes('49 000 FCFA'));
    await page.screenshot(join(CAPTURES, '08-admin-rentabilite.png'), { fullPage: true });

    // Le client voit le prix, jamais l'imprimeur ni les coûts.
    await mobile.goto(`${BASE}/devis/${reference}`);
    await mobile.attendre(`/ELB-/.test(document.body.innerText)`, { timeoutMs: 20000 });
    const texteClient = await mobile.eval(texte());
    verifier('le suivi client affiche la commande et son total', texteClient.includes('98 000'));
    verifier('le suivi client ne révèle ni coût ni marge', !/marge|coût imprimeur|40 500|42 000/i.test(texteClient));
    await mobile.screenshot(join(CAPTURES, '09-suivi-client-commande.png'), { fullPage: true });
  }
} catch (erreur) {
  echecs++;
  console.error('ÉCHEC du scénario :', erreur instanceof Error ? erreur.message : erreur);
} finally {
  await chrome.fermer();
}
console.log(echecs ? `${echecs} contrôle(s) en échec.` : 'Tous les contrôles sont passés.');
process.exit(echecs ? 1 : 0);

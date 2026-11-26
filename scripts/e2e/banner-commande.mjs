// Essai de bout en bout du lot 4 du Banner Studio : modèle → projet → demande de devis.
//
// ⚠️ Crée un VRAI devis : uniquement contre un environnement LOCAL (Supabase local, Redis local).
//
//   STUDIO_URL=http://localhost:3000 \
//   STUDIO_SUPABASE_URL=http://127.0.0.1:54321 STUDIO_SERVICE_ROLE_KEY=<clé locale> \
//   STUDIO_CAPTURES=/chemin node scripts/e2e/banner-commande.mjs
//
// Couvre : galerie, variables, texte long, projets (nouveau, ouvrir, dupliquer, supprimer),
// export/import, images à retrouver, contrôle final bloquant, passage à la commande, format
// verrouillé, envoi, fichiers réellement déposés et vérifiés, mobile 390 px.
// Code de sortie 1 si un contrôle échoue.

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.env.STUDIO_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const SUPABASE = (process.env.STUDIO_SUPABASE_URL ?? '').replace(/\/+$/, '');
const CLE = process.env.STUDIO_SERVICE_ROLE_KEY ?? '';
const local = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u);
if (!local(BASE) || (SUPABASE && !local(SUPABASE))) {
  console.error('Refus : ce scénario crée un devis, il ne doit viser qu’un environnement local.');
  process.exit(2);
}
const temporaire = mkdtempSync(join(tmpdir(), 'elembo-commande-'));
const CAPTURES = process.env.STUDIO_CAPTURES ?? temporaire;
const LOGO = join(racine, 'tests', 'fixtures', 'logo-transparent.png');
mkdirSync(CAPTURES, { recursive: true });

let echecs = 0;
function verifier(nom, condition, details = '') {
  if (!condition) echecs++;
  console.log(`${condition ? 'OK  ' : 'ÉCHEC'} ${nom}${!condition && details !== '' ? ` — ${typeof details === 'string' ? details : JSON.stringify(details)}` : ''}`);
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const LIRE = `new Promise((ok) => {
  const r = indexedDB.open('elembo-banner');
  r.onupgradeneeded = () => r.transaction.abort();
  r.onerror = () => ok(null);
  r.onsuccess = () => {
    const t = r.result.transaction(['meta', 'projets']);
    const m = t.objectStore('meta').get('courant');
    m.onsuccess = () => { if (!m.result) return; const p = t.objectStore('projets').get(m.result.projet); p.onsuccess = () => (t.doc = p.result?.document ?? null); };
    t.oncomplete = () => { r.result.close(); ok(t.doc ?? null); };
  };
})`;

function pilote(page) {
  const erreurs = [];
  // Avertissement de développement antérieur au Studio (défilement doux du site).
  const connu = (t) => t.includes('scroll-behavior: smooth');
  page.sur('Runtime.exceptionThrown', (p) => erreurs.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
  page.sur('Runtime.consoleAPICalled', (p) => {
    const texte = p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300);
    if ((p.type === 'error' || p.type === 'warning') && !connu(texte)) erreurs.push(`${p.type}: ${texte}`);
  });
  const trouver = (libelle) => `[...document.querySelectorAll('button, a')].find((x) => (x.getAttribute('aria-label') ?? x.textContent.trim()) === ${JSON.stringify(libelle)})`;
  const p = {
    page, erreurs,
    async bouton(libelle) {
      if (!(await page.eval(`(() => { const b = ${trouver(libelle)}; if (!b || b.disabled) return false; b.click(); return true; })()`))) throw new Error(`Bouton absent ou inactif : ${libelle}`);
      await attendre(150);
    },
    actif: (libelle) => page.eval(`(() => { const b = ${trouver(libelle)}; return b ? !b.disabled : null; })()`),
    async ouvrir(suite = '') {
      await page.goto(`${BASE}/banderoles/studio${suite}`);
      await page.attendre(`!!document.querySelector('[data-testid="plan-de-travail"] canvas')`, { timeoutMs: 60000 });
      await attendre(1000);
    },
    async doc() {
      await attendre(80);
      await page.attendre(`/Enregistré|Nouveau projet/.test(document.querySelector('[data-testid="sauvegarde"]')?.textContent)`, { message: 'enregistrement automatique' });
      return page.eval(LIRE);
    },
    async champ(libelle, valeur) {
      const ok = await page.eval(`(() => {
        const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === ${JSON.stringify(libelle)} || x.textContent.trim().startsWith(${JSON.stringify(`${libelle} `)}));
        const el = l && (document.getElementById(l.htmlFor) ?? l.querySelector('input, textarea, select'));
        if (!el || el.disabled) return false;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
        el.focus();
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(String(valeur))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return true; })()`);
      if (!ok) throw new Error(`Champ absent : ${libelle}`);
      await attendre(120);
    },
    texte: (selecteur = 'body') => page.eval(`(document.querySelector(${JSON.stringify(selecteur)})?.innerText ?? '').replace(/[\\u00a0\\u202f]/g, ' ')`),
    modele: (nom) => page.eval(`(() => { const b = [...document.querySelectorAll('[data-testid=modeles] button')].find((x) => x.textContent.includes(${JSON.stringify(nom)})); if (!b) return false; b.click(); return true; })()`).then((ok) => { if (!ok) throw new Error(`Modèle absent : ${nom}`); return attendre(500); }),
    onglet: (nom) => page.eval(`(() => { [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent === ${JSON.stringify(nom)}).click(); return true; })()`).then(() => attendre(120)),
    async calque(nom) {
      await p.onglet('Calques');
      await page.eval(`(() => { [...document.querySelectorAll('[data-testid="calques"] li button')].find((b) => b.textContent.startsWith(${JSON.stringify(nom)})).click(); return true; })()`);
      await attendre(150);
    },
    continuer: () => p.bouton('Continuer'),
    titre: (t) => page.attendre(`(document.querySelector('h2[tabindex="-1"]')?.textContent ?? '').includes(${JSON.stringify(t)})`),
    capture: (nom, options) => page.screenshot(join(CAPTURES, `${nom}.png`), options),
  };
  return p;
}

const rest = async (chemin) => {
  const r = await fetch(`${SUPABASE}${chemin}`, { headers: { apikey: CLE, Authorization: `Bearer ${CLE}` } });
  if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
  return r;
};

/* --------------------------------------------------------------------------- bureau ---- */

async function bureau(chrome) {
  console.log('\n— Bureau, 1440 × 900');
  const s = pilote(await ouvrirPage(chrome, { width: 1440, height: 900 }));
  const { page } = s;
  await s.ouvrir();

  // --- Galerie et variables
  await s.bouton('Voir les modèles');
  verifier('galerie : dix modèles', (await page.eval(`document.querySelectorAll('[data-testid=modeles] li').length`)) === 10);
  await s.bouton('Mariages');
  verifier('galerie : filtre par catégorie', (await page.eval(`document.querySelectorAll('[data-testid=modeles] li').length`)) === 1);
  await s.bouton('Tous');
  await s.modele('Hommage avec portrait');
  const long = 'Papa Jean-Baptiste Emmanuel Nkounkou-Malonga';
  await s.champ('Nom du défunt', long);
  await s.champ('Dates', '1948 — 2026');
  await s.capture('50-variables');
  await s.bouton('Utiliser ce modèle');
  let d = await s.doc();
  const nom = d.elements.find((e) => e.nom === 'Nom');
  verifier('modèle appliqué avec les textes saisis', nom.texte.contenu === long && d.modeleId === 'hommage-portrait' && d.categorie === 'DEUIL', nom);
  verifier('nom long réduit pour tenir dans sa place', nom.largeurMm <= 1860 && nom.largeurMm > 1800 && nom.texte.corpsMm < 199, [nom.largeurMm, nom.texte.corpsMm]);
  await s.capture('51-modele');
  const premier = d.id;

  // --- Contrôle final bloquant
  await s.bouton('Finaliser ma demande');
  verifier('photo d’exemple : envoi bloqué', !(await s.actif('Continuer vers ma demande')) && (await s.texte('dialog[open]')).includes('image d’exemple'));
  verifier('signature d’exemple signalée', (await s.texte('dialog[open]')).includes('Les familles Malonga'));
  await s.capture('52-finaliser-bloque');
  await s.bouton('Fermer');

  await s.calque('Photo');
  await page.envoyerFichiers('[data-testid="remplacer-image"]', [LOGO]);
  await page.attendre(`document.querySelector('[data-testid="qualite"]')`.replace('document', '!!document'));
  await s.calque('Les familles');
  await s.champ('Contenu', 'Ses enfants et petits-enfants');
  d = await s.doc();
  verifier('photo remplacée : plus d’image d’exemple dans le document', d.assets.length === 1 && !d.assets[0].placeholder && /^[0-9a-f]{64}$/.test(d.assets[0].sha256), d.assets);

  // --- Projets
  await s.bouton('Projets');
  await page.attendre(`document.querySelectorAll('[data-testid=projets] li').length === 1`);
  await s.bouton('Nouveau projet');
  await attendre(400);
  await s.bouton('Voir les modèles');
  await s.modele('Promotion');
  await s.bouton('Utiliser ce modèle');
  d = await s.doc();
  verifier('nouveau projet distinct', d.id !== premier && d.modeleId === 'promotion');
  await s.onglet('Ajouter');
  await s.bouton('Choisir un modèle');
  await s.modele('Retrait de deuil');
  verifier('projet non vide : deux choix proposés', (await s.actif('Créer un nouveau projet')) && (await s.actif('Remplacer la composition actuelle')));
  await s.bouton('Remplacer la composition actuelle');
  const remplace = await s.doc();
  verifier('remplacer garde le projet', remplace.id === d.id && remplace.modeleId === 'retrait-de-deuil');
  await s.bouton('Annuler');
  verifier('remplacer s’annule en une fois', (await s.doc()).modeleId === 'promotion');
  await s.bouton('Projets');
  await page.attendre(`document.querySelectorAll('[data-testid=projets] li').length === 2`);
  await s.capture('53-projets');
  await s.bouton(`Dupliquer ${(await page.eval(LIRE)).nom}`);
  await page.attendre(`document.querySelectorAll('[data-testid=projets] li').length === 3`);
  verifier('dupliquer ne change pas le projet ouvert', (await page.eval(LIRE)).id === d.id);
  await s.bouton('Supprimer Promotion (copie)');
  verifier('la suppression demande confirmation', (await page.eval(`document.querySelectorAll('[data-testid=projets] li').length`)) === 3);
  await s.bouton('Confirmer la suppression de Promotion (copie)');
  await page.attendre(`document.querySelectorAll('[data-testid=projets] li').length === 2`);
  await page.eval(`(() => { [...document.querySelectorAll('[data-testid=projets] button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Ouvrir Hommage')).click(); return true; })()`);
  await attendre(1200);
  d = await s.doc();
  verifier('ouvrir un autre projet : document et image retrouvés', d.id === premier && !(await s.texte('[data-testid="nb-alertes"]')).includes('!'));
  await s.onglet('Contrôles');
  verifier('aucune image introuvable après ouverture', !(await s.texte('[data-testid="alertes"]')).includes('introuvable'), await s.texte('[data-testid="alertes"]'));

  // --- Export puis import
  const exporte = JSON.stringify(d, null, 2);
  const chemin = join(temporaire, 'projet.json');
  writeFileSync(chemin, exporte);
  const corrompu = join(temporaire, 'corrompu.json');
  writeFileSync(corrompu, exporte.slice(0, 400));
  await s.bouton('Projets');
  await page.envoyerFichiers('[data-testid="import-projet"]', [corrompu]);
  await attendre(500);
  verifier('import corrompu refusé, rien ne change', (await s.texte('dialog[open]')).includes('pas un projet Elembo lisible') && (await page.eval(LIRE)).id === premier);
  await page.envoyerFichiers('[data-testid="import-projet"]', [chemin]);
  await attendre(1500);
  const importe = await page.eval(LIRE);
  verifier('import : copie identique, nouvel identifiant', importe.id !== premier && JSON.stringify(importe.elements) === JSON.stringify(d.elements) && JSON.stringify(importe.assets) === JSON.stringify(d.assets));

  // Import sur un « autre appareil » : l'image n'y est pas.
  const ailleurs = { ...d, assets: d.assets.map((a) => ({ ...a, id: 'image-ailleurs' })), elements: d.elements.map((e) => (e.type === 'image' ? { ...e, image: { ...e.image, assetId: 'image-ailleurs' } } : e)) };
  writeFileSync(chemin, JSON.stringify(ailleurs));
  await s.bouton('Projets');
  await page.envoyerFichiers('[data-testid="import-projet"]', [chemin]);
  await page.attendre(`document.querySelector('dialog[open]')?.innerText.includes('Images à retrouver')`);
  await page.envoyerFichiers('[data-testid="relier-images"]', [LOGO]);
  await page.attendre(`document.querySelector('dialog[open]')?.innerText.includes('1 image retrouvée')`);
  verifier('image rattachée par son empreinte', true);
  await s.bouton('Fermer');
  await s.onglet('Contrôles');
  verifier('plus d’image manquante', !(await s.texte('[data-testid="alertes"]')).includes('introuvable'));

  // --- Retour au premier projet par son adresse, puis finalisation
  await s.ouvrir(`?projet=${premier}`);
  d = await page.eval(LIRE);
  verifier('adresse ?projet= : projet rouvert, adresse nettoyée', d.id === premier && (await page.eval('location.search')) === '');
  await s.bouton('Finaliser ma demande');
  const avertis = (await s.texte('dialog[open]')).includes('À vérifier');
  if (avertis) {
    verifier('avertissements : accord demandé avant de continuer', !(await s.actif('Continuer vers ma demande')));
    await page.eval(`document.querySelector('dialog[open] input[type=checkbox]').click()`);
    await attendre(150);
  }
  await page.attendre(`!/…$/.test(document.querySelector('[data-testid="prix-indicatif"]')?.innerText ?? '…')`);
  verifier('prix indicatif calculé par le serveur', /FCFA|Sur devis/.test(await s.texte('[data-testid="prix-indicatif"]')), await s.texte('[data-testid="prix-indicatif"]'));
  await page.eval(`(() => { const q = document.querySelector('dialog[open] input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(q, '3'); q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await attendre(200);
  await s.capture('54-finaliser');
  await s.bouton('Continuer vers ma demande');
  await page.attendre(`location.pathname === '/banderoles/commander'`, { timeoutMs: 30000 });
  await s.titre('caractéristiques');
  const params = await page.eval('location.search');
  verifier('adresse de commande : projet, support, usage, quantité', params.includes(`studio=${premier}`) && params.includes('support=BANDEROLE') && params.includes('usage=deuil') && params.includes('quantite=3'), params);
  verifier('quantité reprise dans le formulaire', (await page.eval(`document.querySelector('input[type=number][aria-labelledby=quantite-libelle]').value`)) === '3');
  const etape1 = await s.texte('main');
  verifier('format verrouillé : pas de champ de dimension ni de finition', (await page.eval(`document.querySelectorAll('input[inputmode="decimal"], input[name="finition"], input[name="support"]').length`)) === 0 && etape1.includes('3 × 1 m') && etape1.includes('Les modifier dans le Studio'));
  verifier('aperçu du visuel affiché', await page.eval(`[...document.querySelectorAll('img[src^="blob:"]')].some((i) => i.naturalWidth === 1600)`));
  await s.capture('55-commande-caracteristiques');
  await s.continuer();
  await s.titre('accompagnement');
  verifier('prestation « J’ai mon fichier » présélectionnée', await page.eval(`document.querySelector('input[name="prestation"]:checked')?.closest('label').innerText.includes('mon fichier')`));
  await s.continuer();
  await s.titre('fichiers');
  verifier('visuel joint, sans réimport', (await s.texte('[data-testid="paquet-studio"]')).includes('1 image'), await s.texte('[data-testid="paquet-studio"]'));
  await s.capture('56-commande-fichiers');
  await s.continuer();
  await s.titre('prix');
  await page.attendre(`!document.body.innerText.includes('Calcul de votre estimation')`);
  await s.continuer();
  await s.titre('coordonnées');
  await page.eval(`(() => { const set = (sel, v) => { const el = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[autocomplete="name"]', 'Client Essai Studio'); set('input[autocomplete="tel"]', '06 5${String(Date.now()).slice(-2)} ${String(Date.now()).slice(-4, -2)} 78'); return true; })()`);
  await page.eval(`document.querySelector('input[type="checkbox"]').click()`);

  // Panne du serveur : la page doit rester utilisable.
  await page.eval(`(() => { window.__fetch = window.fetch; window.fetch = (u, o) => String(u).endsWith('/api/banderoles') ? Promise.resolve(new Response(JSON.stringify({ erreur: 'Panne simulée' }), { status: 500 })) : window.__fetch(u, o); return true; })()`);
  await page.eval(`[...document.querySelectorAll('button')].find((b) => /Demander mon devis|Envoyer ma commande/.test(b.textContent)).click()`);
  await page.attendre(`document.body.innerText.includes('Panne simulée')`);
  verifier('échec d’enregistrement : message, et le bouton redevient actif', await page.eval(`!([...document.querySelectorAll('button')].find((b) => /Demander mon devis|Envoyer ma commande/.test(b.textContent)).disabled)`));
  await page.eval(`(() => { window.fetch = (u, o) => String(u).endsWith('/api/banderoles') ? Promise.reject(new TypeError('Failed to fetch')) : window.__fetch(u, o); return true; })()`);
  await page.eval(`[...document.querySelectorAll('button')].find((b) => /Demander mon devis|Envoyer ma commande/.test(b.textContent)).click()`);
  await page.attendre(`document.body.innerText.includes('n’a pas pu être envoyée')`);
  verifier('coupure réseau : pas de faux « demande enregistrée »', !(await s.texte('main')).includes('Votre demande est enregistrée'));
  // Réseau instable : le premier envoi de chaque fichier échoue, le second passe.
  await page.eval(`(() => { const vus = new Set(); window.fetch = (u, o) => { if (o?.method === 'PUT' && !vus.has(u)) { vus.add(u); return Promise.reject(new TypeError('Failed to fetch')); } return window.__fetch(u, o); }; return true; })()`);
  await page.eval(`[...document.querySelectorAll('button')].find((b) => /Demander mon devis|Envoyer ma commande/.test(b.textContent)).click()`);
  await page.attendre(`location.pathname.startsWith('/devis/DEV-') || [...document.querySelectorAll('[role=alert]')].some((x) => x.textContent.trim() && !x.textContent.includes('envoyée'))`, { timeoutMs: 60000 });
  const reference = await page.eval(`location.pathname.split('/').pop()`);
  verifier('demande enregistrée, suivi ouvert', /^DEV-/.test(reference), await s.texte('main'));
  await page.attendre(`document.body.innerText.includes('projet-banner.json')`, { timeoutMs: 20000 });
  const suivi = await s.texte('main');
  verifier('suivi client : projet, aperçu et image visibles', ['projet-banner.json', 'apercu-banner.jpg', 'studio-'].every((x) => suivi.includes(x)));
  console.log(`REFERENCE=${reference}`);
  await page.attendre(`!!document.querySelector('[data-testid="suivi-visuel"] img')?.complete`, { timeoutMs: 20000 });
  const bloc = await s.texte('[data-testid="suivi-visuel"]');
  verifier('suivi : votre visuel, aperçu, PDF, modification possible', bloc.includes('fichier d’impression est prêt') && bloc.includes('Télécharger le fichier d’impression (PDF)') && bloc.includes('Modifier mon visuel'), bloc);
  verifier('suivi : rien sur l’imprimeur ni les alertes internes', !/profil|laize|imprimeur affecté/i.test(bloc));
  await s.capture('57-suivi');

  // --- Reprise : le client modifie son visuel depuis le suivi, même demande, même format.
  await page.eval(`[...document.querySelectorAll('[data-testid="suivi-visuel"] a')].find((a) => a.textContent.includes('Modifier')).click()`);
  await page.attendre(`location.pathname === '/banderoles/studio' && !!document.querySelector('[data-testid="plan-de-travail"] canvas')`, { timeoutMs: 60000 });
  await attendre(1200);
  await s.calque('Ses enfants');
  await s.champ('Contenu', 'Ses enfants, petits-enfants et arrière-petits-enfants');
  await s.doc();
  await s.bouton('Finaliser ma demande');
  await page.attendre(`!!document.querySelector('dialog[open]')?.innerText.includes(${JSON.stringify(reference)})`, { timeoutMs: 20000 });
  verifier('Studio : la demande envoyée est reconnue', (await s.actif(`Mettre à jour la demande ${reference}`)) !== null);
  if ((await s.texte('dialog[open]')).includes('À vérifier')) await page.eval(`document.querySelector('dialog[open] input[type=checkbox]').click()`);
  await attendre(150);
  await s.capture('58-mise-a-jour');
  await s.bouton(`Mettre à jour la demande ${reference}`);
  await page.attendre(`location.pathname === '/devis/${reference}'`, { timeoutMs: 60000 });
  await page.attendre(`document.body.innerText.includes('projet-banner-r2.json')`, { timeoutMs: 20000 });
  verifier('demande mise à jour : révision 2 déposée, sans renvoyer la photo', (await s.texte('main')).includes('apercu-banner-r2.jpg') && (await s.texte('main')).split('studio-').length === 2);
  verifier('suivi : version 2 prête', (await page.eval(`document.querySelector('[data-testid="suivi-visuel"] img')?.alt ?? ''`)).includes('version 2'));
  d = await page.eval(LIRE);

  // Réponse perdue puis second essai : la même clé d'idempotence ne crée pas de doublon.
  if (SUPABASE && CLE) {
    const doublons = await (await rest(`/rest/v1/devis?besoin=like.*Elembo Banner Studio*&reference=eq.${reference}&select=id`)).json();
    verifier('une seule demande malgré les essais en échec', doublons.length === 1, doublons.length);
  }

  // --- Ce que le serveur a réellement
  if (SUPABASE && CLE) {
    const [devis] = await (await rest(`/rest/v1/devis?reference=eq.${reference}&select=id,besoin,specifications`)).json();
    verifier('devis : visuel du Studio identifié', devis.besoin.includes('Elembo Banner Studio') && devis.specifications.Visuel?.includes('Banner Studio') && devis.specifications.Dimensions === '3 × 1 m', devis);
    const fichiers = await (await rest(`/rest/v1/fichiers_devis?devis_id=eq.${devis.id}&select=nom,type_mime,verifie,statut_analyse,checksum,chemin,taille_octets`)).json();
    const serveur = fichiers.filter((f) => /-v\d+\./.test(f.nom));
    const sources = fichiers.filter((f) => !serveur.includes(f));
    verifier('fichiers client (envoi et révision 2), tous vérifiés', sources.length === 5 && sources.every((f) => f.verifie && /^[0-9a-f]{64}$/.test(f.checksum)), fichiers);
    verifier('sources client non diffusables (NON_ANALYSE)', sources.every((f) => f.statut_analyse === 'NON_ANALYSE'));
    verifier('PDF, projet canonique et fiche produits par le serveur, diffusables', serveur.map((f) => f.nom).filter((n) => /-v\d+\./.test(n)).sort().join() === 'fiche-production-v1.txt,fiche-production-v2.txt,projet-banner-v1.json,projet-banner-v2.json,visuel-banner-v1.pdf,visuel-banner-v2.pdf' && serveur.every((f) => f.statut_analyse === 'PROPRE' && f.verifie), fichiers);
    const lire = async (nom) => Buffer.from(await (await rest(`/storage/v1/object/devis/${fichiers.find((f) => f.nom === nom).chemin}`)).arrayBuffer());
    const projet = JSON.parse((await lire('projet-banner.json')).toString('utf8'));
    verifier('premier projet déposé intact', projet.id === d.id && !JSON.stringify(projet).includes('arrière-petits'));
    const image = await lire(`studio-${d.assets[0].id}.png`);
    verifier('image déposée = fichier d’origine, octet pour octet', image.equals(readFileSync(LOGO)) && createHash('sha256').update(image).digest('hex') === projet.assets[0].sha256);
    const pdf = await lire('visuel-banner-v2.pdf');
    writeFileSync(join(CAPTURES, 'visuel.pdf'), pdf);
    const boite = pdf.toString('latin1').match(/\/TrimBox \[\s*([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/)?.slice(1).map(Number);
    verifier('PDF de production : 3 × 1 m à l’échelle 1', pdf.subarray(0, 5).toString() === '%PDF-' && boite && Math.abs(boite[2] - boite[0] - 8503.94) < 0.2 && Math.abs(boite[3] - boite[1] - 2834.65) < 0.2, boite);
    const fiche = (await lire('fiche-production-v2.txt')).toString('utf8');
    verifier('fiche de production', fiche.includes(reference) && fiche.includes('300 cm × 100 cm') && fiche.includes(createHash('sha256').update(pdf).digest('hex')), fiche);
    const [visuel] = await (await rest(`/rest/v1/visuels_banderole?devis_id=eq.${devis.id}&statut=eq.RENDU&select=*`)).json();
    verifier('visuel rendu, courant, préflight enregistré', visuel.statut === 'RENDU' && visuel.version === 2 && visuel.preflight.pages.length === 1 && visuel.categorie_modele === 'DEUIL' && visuel.projet.elements.some((e) => e.texte?.contenu.includes('arrière-petits-enfants')), visuel);
    const [pointeur] = await (await rest(`/rest/v1/demandes_grand_format?devis_id=eq.${devis.id}&select=visuel_courant_id`)).json();
    verifier('pointeur du visuel courant', pointeur.visuel_courant_id === visuel.id);
    verifier('aperçu copié dans le stockage de production', (await rest(`/storage/v1/object/production/${visuel.apercu_chemin}`)).ok);
    // Même projet, second appel : rien n'est refait. Puis les refus.
    const visuelApi = (entetes = {}, ref = reference) => page.eval(`fetch('/api/banderoles/${ref}/visuel', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': decodeURIComponent(document.cookie.match(/elembo_devis_csrf=([^;]+)/)?.[1] ?? ''), ...${JSON.stringify(entetes)} }, body: '{}' }).then(async (r) => ({ statut: r.status, corps: await r.json() }))`);
    const encore = await visuelApi();
    verifier('second appel : même version, pas de nouveau rendu', encore.statut === 200 && encore.corps.etat === 'RENDU' && encore.corps.version === 2, encore);
    verifier('sans jeton CSRF : refusé', (await visuelApi({ 'x-csrf-token': 'faux' })).statut === 403);
    verifier('devis d’un autre client : introuvable', (await visuelApi({}, 'DEV-20260101-AAAAAAAA')).statut === 404);
    const apercu = await lire('apercu-banner.jpg');
    verifier('aperçu JPEG déposé', apercu[0] === 0xff && apercu[1] === 0xd8 && apercu.length > 10_000, apercu.length);
    const [gf] = await (await rest(`/rest/v1/demandes_grand_format?devis_id=eq.${devis.id}&select=*`)).json();
    verifier('demande grand format : dimensions, support, finition, prestation', Number(gf.largeur_m) === 3 && Number(gf.hauteur_m) === 1 && gf.support === 'BANDEROLE' && gf.finition === 'OEILLETS' && gf.prestation === 'FICHIER_PRET' && gf.usage === 'DEUIL', gf);
    const prive = await fetch(`${SUPABASE}/storage/v1/object/public/devis/${fichiers[0].chemin}`);
    verifier('aucun accès public aux fichiers', !prive.ok, prive.status);
  } else console.log('Contrôles serveur ignorés : STUDIO_SUPABASE_URL / STUDIO_SERVICE_ROLE_KEY absents.');

  // --- Retour au Studio
  await s.ouvrir();
  await s.bouton('Projets');
  await page.attendre(`document.querySelector('[data-testid=projets]')?.innerText.includes(${JSON.stringify(reference)})`);
  verifier('projet marqué comme envoyé', true);
  await s.bouton('Fermer');
  // Visuel modifié après préparation : l'ancienne adresse de commande n'envoie pas une version périmée.
  await s.onglet('Ajouter');
  await s.bouton('Ajouter une ellipse');
  await s.doc();
  await page.goto(`${BASE}/banderoles/commander?studio=${premier}&usage=deuil`);
  await page.attendre(`document.body.innerText.includes('a changé depuis sa préparation')`);
  verifier('visuel périmé refusé, retour au Studio proposé', (await s.texte('main')).includes('Ouvrir le Studio'));
  await page.goto(`${BASE}/banderoles/commander?studio=inconnu-123`);
  await page.attendre(`document.body.innerText.includes('n’est pas sur cet appareil')`);
  verifier('projet absent : message clair', true);
  await page.goto(`${BASE}/banderoles/commander?usage=eglise`);
  await s.titre('caractéristiques');
  verifier('formulaire ordinaire inchangé : dimensions et finition modifiables', (await page.eval(`document.querySelectorAll('input[inputmode="decimal"]').length`)) === 2 && (await page.eval(`document.querySelectorAll('input[name="finition"]').length`)) > 3);

  const graves = s.erreurs.filter((e) => !e.includes('500') && !e.includes('Failed to load resource'));
  verifier('aucune erreur ni avertissement de console', graves.length === 0, graves.join(' | ').slice(0, 800));
  await page.close();
}

/* --------------------------------------------------------------------------- mobile ---- */

async function mobile(chrome) {
  console.log('\n— Mobile, 390 × 844');
  const s = pilote(await ouvrirPage(chrome, { width: 390, height: 844, mobile: true }));
  const { page } = s;
  await s.ouvrir('?categorie=MARIAGE');
  const deborde = () => page.eval(`document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('dialog[open], dialog[open] *')].some((x) => x.getBoundingClientRect().right > innerWidth + 1)`);
  verifier('adresse ?categorie= : galerie ouverte sur la catégorie', (await page.eval(`document.querySelectorAll('[data-testid=modeles] li').length`)) === 1);
  verifier('galerie : pas de débordement', !(await deborde()));
  await s.capture('60-mobile-galerie');
  await s.modele('Mariage aux anneaux');
  verifier('variables : pas de débordement', !(await deborde()));
  await s.champ('Prénoms', 'Inès & Paul');
  await s.champ('Date', 'Samedi 9 janvier 2027');
  await s.champ('Lieu', 'Salle Harmonie');
  await s.capture('61-mobile-variables');
  if (!(await s.actif('Utiliser ce modèle'))) await s.bouton('Créer un nouveau projet');
  else await s.bouton('Utiliser ce modèle');
  const d = await s.doc();
  verifier('modèle appliqué', d.modeleId === 'mariage-anneaux' && d.nom.includes('Inès & Paul'), d.nom);
  await s.bouton('Projets');
  await attendre(500);
  verifier('projets : pas de débordement', !(await deborde()));
  await s.capture('62-mobile-projets');
  const petites = await page.eval(`[...document.querySelectorAll('dialog[open] button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.height < 40 || r.width < 32); }).map((b) => b.getAttribute('aria-label') ?? b.textContent)`);
  verifier('cibles tactiles assez grandes', petites.length === 0, petites.join(', '));
  await s.bouton('Finaliser ma demande');
  verifier('finaliser : pas de débordement', !(await deborde()));
  await s.capture('63-mobile-finaliser');
  await page.eval(`document.querySelector('dialog[open] input[type=checkbox]')?.click()`);
  await attendre(150);
  await s.bouton('Continuer vers ma demande');
  await page.attendre(`location.pathname === '/banderoles/commander'`, { timeoutMs: 30000 });
  await s.titre('caractéristiques');
  verifier('commande sur mobile : pas de débordement', !(await page.eval('document.documentElement.scrollWidth > innerWidth')));
  await s.capture('64-mobile-commande');
  verifier('aucune erreur ni avertissement de console', s.erreurs.length === 0, s.erreurs.join(' | ').slice(0, 800));
  await page.close();
}

const chrome = await lancerChrome({ port: 9379 });
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

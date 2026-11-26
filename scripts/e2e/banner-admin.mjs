// Essai de bout en bout du lot 6 du Banner Studio : profils d'impression, carte du visuel,
// régénération au changement d'imprimeur, validation, commande et archivage.
//
// ⚠️ Crée des comptes, un devis et une commande : uniquement contre un environnement LOCAL.
//
//   STUDIO_URL=http://localhost:3100 \
//   STUDIO_SUPABASE_URL=http://127.0.0.1:54321 STUDIO_SERVICE_ROLE_KEY=<clé locale> \
//   STUDIO_CAPTURES=/chemin node scripts/e2e/banner-admin.mjs
//
// La demande est déposée par l'API, comme le ferait le formulaire du Studio (lot 4) ; le reste se
// passe dans le back-office, avec un compte administrateur et un compte atelier créés pour l'essai.

import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lancerChrome, ouvrirPage } from './cdp.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.env.STUDIO_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const SUPABASE = (process.env.STUDIO_SUPABASE_URL ?? '').replace(/\/+$/, '');
const CLE = process.env.STUDIO_SERVICE_ROLE_KEY ?? '';
const local = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u);
if (!local(BASE) || !local(SUPABASE) || !CLE) {
  console.error('Refus : environnement local et clé de service locale requis.');
  process.exit(2);
}
const CAPTURES = process.env.STUDIO_CAPTURES ?? join(racine, 'docs', 'captures', 'banner-admin');
mkdirSync(CAPTURES, { recursive: true });

let echecs = 0;
const verifier = (nom, ok, details = '') => {
  if (!ok) echecs++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${!ok && details !== '' ? ` — ${typeof details === 'string' ? details : JSON.stringify(details)}` : ''}`);
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' };
async function rest(chemin, options = {}) {
  const r = await fetch(`${SUPABASE}${chemin}`, { ...options, headers: { ...entetes, Prefer: 'return=representation', ...(options.headers ?? {}) } });
  if (!r.ok) throw new Error(`${options.method ?? 'GET'} ${chemin} : ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/** Compte du personnel, créé pour l'essai (app_metadata.role, que l'utilisateur ne peut pas changer). */
async function compte(role) {
  const email = `e2e-${role}-${randomBytes(4).toString('hex')}@exemple.test`;
  const motDePasse = `E2e-${randomBytes(12).toString('base64url')}`;
  await rest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: motDePasse, email_confirm: true, app_metadata: { role } }) });
  return { email, motDePasse };
}

/** Dépôt d'une demande comme le formulaire du Studio : création, envoi des fichiers, vérification, rendu. */
async function deposerDemande() {
  const modele = JSON.parse(readFileSync(join(racine, 'src/lib/banner/templates/promotion.json'), 'utf8'));
  const exemples = Object.fromEntries(modele.variables.map((v) => [v.id, v.exemple]));
  const texte = JSON.stringify(modele.document).replace(/\{\{(\w+)\}\}/g, (_, id) => JSON.stringify(exemples[id]).slice(1, -1));
  const doc = { ...JSON.parse(texte), id: randomUUID(), nom: 'Promotion — essai back-office', meta: { versionRendu: 1, createur: 'client' } };
  const fichiers = [
    { nom: 'projet-banner.json', type: 'application/json', octets: Buffer.from(JSON.stringify(doc)) },
    { nom: 'apercu-banner.jpg', type: 'image/jpeg', octets: readFileSync(join(racine, 'public/mockups/tableau-interieur.jpg')) },
  ];
  const n = String(Math.floor(Math.random() * 900) + 100);
  const r = await fetch(`${BASE}/api/banderoles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      usage: 'PUBLICITE', support: 'BANDEROLE', largeurM: '3', hauteurM: '1', quantite: 2, finition: 'OURLETS_OEILLETS', delai: 'STANDARD',
      prestation: 'FICHIER_PRET', studio: true, consentement: true, contact: { nom: 'Client Essai Profils', telephone: `06 6${n.slice(0, 2)} ${n.slice(2)}0 00` },
      fichiers: fichiers.map((f) => ({ nom: f.nom, typeMime: f.type, tailleOctets: f.octets.length })),
    }),
  });
  const corps = await r.json();
  if (!r.ok) throw new Error(`Demande refusée : ${JSON.stringify(corps)}`);
  const cookies = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  for (const u of corps.uploads) {
    const f = fichiers.find((x) => x.nom === u.nom);
    const envoi = await fetch(u.signedUrl, { method: 'PUT', headers: { 'Content-Type': f.type, 'x-upsert': 'false' }, body: f.octets });
    if (!envoi.ok) throw new Error(`Dépôt ${u.nom} : ${envoi.status}`);
  }
  const session = { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookies, 'x-csrf-token': corps.csrfToken };
  const verif = await fetch(`${BASE}/api/devis/${corps.reference}/fichiers`, { method: 'POST', headers: session, body: JSON.stringify({ fichierIds: corps.uploads.map((u) => u.fichierId) }) });
  if (!verif.ok) throw new Error(`Vérification : ${await verif.text()}`);
  const visuel = await fetch(`${BASE}/api/banderoles/${corps.reference}/visuel`, { method: 'POST', headers: session, body: '{}' });
  return { reference: corps.reference, visuel: await visuel.json() };
}

const chrome = await lancerChrome({ port: 9396 });
try {
  const { reference, visuel } = await deposerDemande();
  verifier('demande du Studio déposée et rendue avec le profil public', visuel.etat === 'RENDU' && visuel.version === 1, visuel);
  const [devis] = await rest(`/rest/v1/devis?reference=eq.${reference}&select=id`);
  const [partenaire] = await rest('/rest/v1/partenaires', { method: 'POST', body: JSON.stringify({ nom: `Atelier essai ${randomBytes(3).toString('hex')}`, specialite: 'Grand format', statut: 'VALIDE', types_impression: ['BANDEROLE'] }) });

  const admin = await compte('admin');
  const page = await ouvrirPage(chrome, { width: 1440, height: 1000 });
  const erreurs = [];
  page.sur('Runtime.exceptionThrown', (p) => erreurs.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
  const texte = (sel = 'main') => page.eval(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '').replace(/[\\u00a0\\u202f]/g, ' ')`);
  const pret = () => page.attendre(`document.readyState === 'complete' && [...document.querySelectorAll('form')].every((f) => Object.keys(f).some((k) => k.startsWith('__react')))`, { timeoutMs: 30000 });
  /** Soumet le formulaire qui contient ce champ (ou ce bouton), après avoir rempli des valeurs. */
  async function soumettre(selecteur, valeurs = {}, cocher = []) {
    await pret();
    const ok = await page.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selecteur)});
      const form = el?.closest('form');
      if (!form) return false;
      for (const [k, v] of Object.entries(${JSON.stringify(valeurs)})) { const c = form.querySelector('[name="' + k + '"]'); if (c) c.value = v; }
      for (const k of ${JSON.stringify(cocher)}) form.querySelector('[name="' + k + '"]').checked = true;
      form.requestSubmit(el.tagName === 'BUTTON' ? el : undefined); return true; })()`);
    if (!ok) throw new Error(`Formulaire introuvable : ${selecteur}`);
    await attendre(600);
    await page.attendre(`document.readyState === 'complete'`, { timeoutMs: 60000 });
    await attendre(1200);
  }
  const fiche = `${BASE}/admin/banderoles/${devis.id}`;

  await page.goto(`${BASE}/admin/connexion`);
  await pret();
  await page.eval(`(() => { document.querySelector('[name=email]').value = ${JSON.stringify(admin.email)}; document.querySelector('[name=mot_de_passe]').value = ${JSON.stringify(admin.motDePasse)}; document.querySelector('[name=email]').closest('form').requestSubmit(); return true; })()`);
  await page.attendre(`location.pathname === '/admin'`, { timeoutMs: 30000 });

  // --- Carte du visuel
  await page.goto(fiche);
  await page.attendre(`!!document.querySelector('#visuel')`);
  let carte = await texte('#visuel');
  verifier('carte du visuel : version 1 prête, profil public à valider', carte.includes('version 1') && carte.includes('Prêt pour l’impression') && /Banderole — profil public, version \d+ — à valider/.test(carte), carte);
  verifier('aperçu affiché (lien signé)', await page.eval(`(() => { const i = document.querySelector('#visuel img'); return !!i && i.complete && i.naturalWidth > 100 && i.src.includes('/storage/v1/object/sign/'); })()`));
  verifier('PDF, fiche et projet téléchargeables', ['PDF d’impression', 'Fiche de production', 'Projet (JSON)'].every((x) => carte.includes(x)));
  await page.screenshot(join(CAPTURES, '70-carte-visuel.png'), { fullPage: false });

  // --- Profil de l'imprimeur : laize trop étroite
  await page.goto(`${BASE}/admin/banderoles/profils`);
  await pret();
  verifier('page des profils : six profils publics à valider', (await texte()).match(/Profils publics \(6\)/) && (await texte()).split('À valider').length > 6);
  await soumettre('select[name=partenaire_id]', { partenaire_id: partenaire.id, support: 'BANDEROLE' });
  const [profil] = await rest(`/rest/v1/profils_impression?partenaire_id=eq.${partenaire.id}&select=*`);
  verifier('profil d’imprimeur créé, prérempli, à valider', profil && profil.statut === 'A_VALIDER' && profil.ourlet_mm === 50 && profil.marge_securite_mm === 50, profil);
  verifier('écart avec les capacités signalé (aucune capacité validée)', (await texte(`#p-${profil.id}`)).includes('Aucune capacité grand format validée'));
  await soumettre(`#p-${profil.id} input[name=laize_max_mm]`, { laize_max_mm: '900' });
  let [p] = await rest(`/rest/v1/profils_impression?id=eq.${profil.id}&select=*`);
  verifier('laize enregistrée, nouvelle version', p.laize_max_mm === 900 && p.version === 2, p);

  // --- L'imprimeur est affecté (acceptation simulée en base) : le visuel est périmé, on le régénère.
  await rest(`/rest/v1/demandes_grand_format?devis_id=eq.${devis.id}`, { method: 'PATCH', body: JSON.stringify({ partenaire_id: partenaire.id }) });
  await page.goto(fiche);
  await page.attendre(`!!document.querySelector('#visuel')`);
  verifier('visuel signalé périmé : le profil applicable a changé', (await texte('[data-testid="visuel-perime"]')).includes('version 2'));
  await page.eval(`document.querySelector('#visuel details summary')?.click()`);
  await soumettre('[data-testid="regenerer"]', {});
  await page.attendre(`location.search.includes('visuel')`, { timeoutMs: 60000 });
  verifier('régénération : le visuel ne passe plus, message clair', (await texte()).includes('il ne passe plus'), await texte());
  carte = await texte('#visuel');
  verifier('carte : version 2 à revoir, laize signalée', carte.includes('version 2') && carte.includes('À revoir') && /laize/i.test(carte), carte);
  const notifications = await rest(`/rest/v1/notifications?entite_id=eq.${devis.id}&cle_idempotence=like.visuel*&select=canal,sujet`);
  verifier('l’équipe est alertée', notifications.some((n) => n.sujet.includes(reference)), notifications);
  await page.screenshot(join(CAPTURES, '71-visuel-a-revoir.png'));

  // --- L'imprimeur confirme 3,2 m : profil corrigé et validé, nouveau rendu prêt.
  await page.goto(`${BASE}/admin/banderoles/profils`);
  await soumettre(`#p-${profil.id} input[name=laize_max_mm]`, { laize_max_mm: '3200' });
  await page.eval(`document.querySelector('#p-${profil.id} details summary').click()`);
  await soumettre(`#p-${profil.id} details form button`, {}, []);
  verifier('validation refusée sans la confirmation de l’imprimeur', (await texte()).includes('Cochez la confirmation'));
  await page.eval(`document.querySelector('#p-${profil.id} details summary').click()`);
  await soumettre(`#p-${profil.id} details form button`, {}, ['confirmation']);
  [p] = await rest(`/rest/v1/profils_impression?id=eq.${profil.id}&select=*`);
  verifier('profil validé à mon nom', p.statut === 'VALIDE' && p.valide_par_email === admin.email && p.version === 3, p);
  await page.screenshot(join(CAPTURES, '72-profils.png'));
  await page.goto(fiche);
  await page.eval(`document.querySelector('#visuel details summary')?.click()`);
  await soumettre('[data-testid="regenerer"]', {});
  carte = await texte('#visuel');
  verifier('version 3 prête, profil de l’imprimeur validé', carte.includes('version 3') && carte.includes('Prêt pour l’impression') && carte.includes('Atelier essai') && carte.includes('validé'), carte);
  const visuels = await rest(`/rest/v1/visuels_banderole?devis_id=eq.${devis.id}&select=version,statut,origine,profil_id,profil_version&order=version`);
  verifier('versions conservées : v1 remplacée, v2 à revoir, v3 rendue par l’équipe', JSON.stringify(visuels.map((v) => [v.version, v.statut, v.origine])) === JSON.stringify([[1, 'ARCHIVE', 'CLIENT'], [2, 'A_REVOIR', 'STAFF'], [3, 'RENDU', 'STAFF']]) && visuels[2].profil_id === profil.id && visuels[2].profil_version === 3, visuels);
  const fichiersDevis = await rest(`/rest/v1/fichiers_devis?devis_id=eq.${devis.id}&nom=like.fiche-production*&select=nom,chemin`);
  const fiche3 = await (await fetch(`${SUPABASE}/storage/v1/object/devis/${fichiersDevis.find((f) => f.nom.includes('v3')).chemin}`, { headers: entetes })).text();
  verifier('fiche de production : profil validé et laize', fiche3.includes('version 3, validé') && fiche3.includes('Laize maximale : 3200 mm'), fiche3);

  // --- Devis accepté, commande : le visuel est archivé 24 mois dans le stockage de production.
  await soumettre('[name=prix_impression_fcfa]', { prix_impression_fcfa: '90000' });
  await soumettre('[name=validite_jours]');
  await soumettre('[name=decision]', { decision: 'client_accepte' });
  await soumettre('[name=mode_paiement]', { livraison: '2000' });
  const [commande] = await rest(`/rest/v1/commandes?devis_id=eq.${devis.id}&select=id,reference`);
  verifier('commande créée', !!commande, commande);
  const archives = await rest(`/rest/v1/fichiers_commande?commande_id=eq.${commande.id}&select=nom,chemin,expire_le,verifie`);
  const v3 = archives.filter((f) => f.nom.includes('-v3.'));
  const mois = (f) => (Date.parse(f.expire_le) - Date.now()) / (30.4 * 86400000);
  verifier('PDF, projet et fiche v3 archivés pour 24 mois', v3.length === 3 && v3.every((f) => f.chemin.startsWith(`commandes/${commande.id}/`) && f.verifie && mois(f) > 23.5), archives);
  const objet = await fetch(`${SUPABASE}/storage/v1/object/production/commandes/${commande.id}/visuel-banner-v3.pdf`, { headers: entetes });
  verifier('copie réelle dans le stockage de production', objet.ok && (await objet.arrayBuffer()).byteLength > 1000);
  verifier('les sources du client gardent la règle des 90 jours', archives.filter((f) => !f.nom.includes('-v')).every((f) => mois(f) < 4));

  // --- Le Studio applique le profil public de la base.
  const [pub] = await rest('/rest/v1/profils_impression?est_public=eq.true&support=eq.BANDEROLE&statut=neq.ARCHIVE&select=*');
  await page.goto(`${BASE}/admin/banderoles/profils`);
  await soumettre(`#p-${pub.id} input[name=marge_securite_mm]`, { marge_securite_mm: '80' });
  const route = await (await fetch(`${BASE}/api/banderoles/profils`)).json();
  verifier('route publique : six profils publics, rien sur les imprimeurs', route.profils.length === 6 && !JSON.stringify(route).includes(partenaire.id) && route.profils.find((x) => x.support === 'BANDEROLE').margeSecuriteMm === 80);
  const studio = await ouvrirPage(chrome, { width: 1440, height: 900 });
  await studio.goto(`${BASE}/banderoles/studio`);
  await studio.attendre(`!!document.querySelector('[data-testid="plan-de-travail"] canvas')`, { timeoutMs: 60000 });
  await studio.eval(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Ajouter un texte').click()`);
  await attendre(1500);
  const doc = await studio.eval(`new Promise((ok) => { const r = indexedDB.open('elembo-banner'); r.onsuccess = () => { const t = r.result.transaction(['meta', 'projets']); const m = t.objectStore('meta').get('courant'); m.onsuccess = () => { const p = t.objectStore('projets').get(m.result.projet); p.onsuccess = () => ok(p.result.document); }; }; })`);
  verifier('Studio : marge de 80 mm venue de la base, profil référencé', doc.contraintes.margeSecuriteMm === 80 && doc.profil?.id === pub.id && doc.profil.version === pub.version + 1, doc.contraintes);
  await studio.close();
  await page.goto(`${BASE}/admin/banderoles/profils`);
  await soumettre(`#p-${pub.id} input[name=marge_securite_mm]`, { marge_securite_mm: '50' });

  // --- L'atelier règle les profils mais ne voit pas les demandes.
  const atelier = await compte('atelier');
  // Autre navigateur : le compte administrateur reste connecté dans le premier.
  const chrome2 = await lancerChrome({ port: 9397 });
  const page2 = await ouvrirPage(chrome2, { width: 1440, height: 1000 });
  await page2.goto(`${BASE}/admin/connexion`);
  await page2.attendre(`Object.keys(document.querySelector('[name=email]')?.closest('form') ?? {}).some((k) => k.startsWith('__react'))`);
  await page2.eval(`(() => { document.querySelector('[name=email]').value = ${JSON.stringify(atelier.email)}; document.querySelector('[name=mot_de_passe]').value = ${JSON.stringify(atelier.motDePasse)}; document.querySelector('[name=email]').closest('form').requestSubmit(); return true; })()`);
  await page2.attendre(`location.pathname === '/admin'`, { timeoutMs: 30000 });
  const nav = await page2.eval(`[...document.querySelectorAll('nav a')].map((a) => a.textContent.trim())`);
  verifier('atelier : « Profils d’impression » au menu, pas « Banderoles »', nav.includes('Profils d’impression') && !nav.includes('Banderoles'), nav);
  await page2.goto(fiche);
  verifier('atelier : fiche banderole refusée', (await page2.eval('location.search')).includes('refus=grand_format.voir'));
  await page2.goto(`${BASE}/admin/banderoles/profils`);
  verifier('atelier : page des profils ouverte', (await page2.eval(`document.querySelector('h1')?.textContent ?? ''`)).includes('Profils d’impression'));
  await chrome2.fermer();

  verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
} catch (e) {
  echecs++;
  console.log('ÉCHEC scénario interrompu —', e.message);
} finally {
  await chrome.fermer();
}
console.log(`\n${echecs ? `${echecs} contrôle(s) en échec` : 'Tous les contrôles passent'} — captures : ${CAPTURES}`);
process.exit(echecs ? 1 : 0);

#!/usr/bin/env node
/**
 * Supprime uniquement les données marquées comme tests, pour un run précis.
 *
 * Marqueurs utilisés :
 *   clients.metadata.test_run_id       = RUN
 *   produits.metadata.test_run_id      = RUN
 *   commandes.idempotency_key          = TEST-RUN-...
 *   paiements.idempotency_key          = TEST-RUN-...
 *   depenses.notes                     = TEST:RUN...
 *   auth.users.user_metadata.test_run_id = RUN
 *
 * Sécurité :
 *   - RUN obligatoire, format 8 caractères A-Z/0-9 ;
 *   - sans --confirm : dry-run, aucune suppression ;
 *   - aucune suppression par LIKE large ou par email seul ;
 *   - seules les lignes marquées et leurs enfants par identifiants sont supprimés.
 *
 * Usage :
 *   SUPABASE_TEST_RUN_ID=ABCD1234 node scripts/nettoyer-donnees-test-supabase.mjs
 *   SUPABASE_TEST_RUN_ID=ABCD1234 node scripts/nettoyer-donnees-test-supabase.mjs --confirm
 */

const URL = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';
const RUN = (process.env.SUPABASE_TEST_RUN_ID ?? '').trim().toUpperCase();
const CONFIRM = process.argv.includes('--confirm');

if (!URL || !KEY) {
  console.error('SUPABASE_TEST_URL et SUPABASE_TEST_SERVICE_ROLE_KEY sont requis.');
  process.exit(2);
}
if (!URL.endsWith('.supabase.co') && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL)) {
  console.error('Refus : URL Supabase attendue (.supabase.co ou stack locale).');
  process.exit(2);
}
if (!/^[A-Z0-9]{8}$/.test(RUN)) {
  console.error('Refus : SUPABASE_TEST_RUN_ID doit être 8 caractères A-Z/0-9.');
  process.exit(2);
}

const entetes = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function rest(chemin, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${chemin}`, {
    ...init,
    headers: { ...entetes, ...(init.headers ?? {}) },
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${chemin}: HTTP ${r.status} ${texte.slice(0, 300)}`);
  return texte ? JSON.parse(texte) : null;
}

async function ids(table, filtre) {
  const lignes = await rest(`${table}?select=id&${filtre}`);
  return (lignes ?? []).map((l) => l.id);
}

async function idsPaiements(filtre) {
  const lignes = await rest(`paiements?select=reference_id&${filtre}`);
  return (lignes ?? []).map((l) => l.reference_id);
}

async function supprimer(table, colonne, valeurs) {
  if (!valeurs.length) return 0;
  const liste = valeurs.join(',');
  const r = await rest(`${table}?${colonne}=in.(${liste})`, { method: 'DELETE' });
  return Array.isArray(r) ? r.length : 0;
}

async function supprimerParId(table, valeurs) {
  return supprimer(table, 'id', valeurs);
}

const resultat = {
  clients: await ids('clients', `metadata->>test_run_id=eq.${encodeURIComponent(RUN)}`),
  produits: await ids('produits', `metadata->>test_run_id=eq.${encodeURIComponent(RUN)}`),
  commandes: await ids('commandes', `idempotency_key=like.TEST-${RUN}-*`),
  depenses: await ids('depenses', `notes=like.TEST:${RUN}*`),
};

const paiementsMarques = await idsPaiements(`idempotency_key=like.TEST-${RUN}-*`);
const paiementsDesCommandes = resultat.commandes.length
  ? await idsPaiements(`commande_id=in.(${resultat.commandes.join(',')})`)
  : [];
const paiements = [...new Set([...paiementsMarques, ...paiementsDesCommandes])];

const users = await (async () => {
  const r = await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`auth users: HTTP ${r.status}`);
  const corps = await r.json();
  return (corps.users ?? [])
    .filter((u) => String(u.user_metadata?.test_run_id ?? '').toUpperCase() === RUN)
    .map((u) => u.id);
})();

console.log(`Run de test : ${RUN}`);
console.log(`Clients marqués       : ${resultat.clients.length}`);
console.log(`Produits marqués      : ${resultat.produits.length}`);
console.log(`Commandes marquées    : ${resultat.commandes.length}`);
console.log(`Paiements rattachés   : ${paiements.length}`);
console.log(`Dépenses marquées     : ${resultat.depenses.length}`);
console.log(`Utilisateurs marqués  : ${users.length}`);

if (!CONFIRM) {
  console.log('\nDRY RUN : aucune suppression. Relancer avec --confirm après vérification.');
  process.exit(0);
}

let supprimes = 0;
// Ordre imposé par les clés étrangères : paiements → production → commandes → clients
// → dépenses → produits → utilisateurs Auth.
supprimes += await supprimer('paiements', 'reference_id', paiements);
supprimes += await supprimer('travaux_production', 'commande_id', resultat.commandes);
supprimes += await supprimerParId('commandes', resultat.commandes);
supprimes += await supprimerParId('clients', resultat.clients);
supprimes += await supprimerParId('depenses', resultat.depenses);
supprimes += await supprimerParId('produits', resultat.produits);

for (const id of users) {
  const r = await fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`Suppression utilisateur ${id}: HTTP ${r.status}`);
  supprimes += 1;
}

console.log(`\n${supprimes} ligne(s) supprimée(s) pour le run ${RUN}.`);

#!/usr/bin/env node
/**
 * Vérifie qu'aucune donnée de test ne reste dans Supabase après les suites.
 *
 * Variables attendues :
 *   SUPABASE_TEST_URL
 *   SUPABASE_TEST_SERVICE_ROLE_KEY
 *
 * Ne jamais pointer vers la production. N'affiche jamais les clés.
 * Sortie 1 si une donnée résiduelle est détectée.
 */

const URL = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';

if (!URL || !KEY) {
  console.error('SUPABASE_TEST_URL et SUPABASE_TEST_SERVICE_ROLE_KEY sont requis.');
  process.exit(2);
}

if (!URL.endsWith('.supabase.co') && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL)) {
  console.error('Refus : URL Supabase attendue (.supabase.co ou stack locale).');
  process.exit(2);
}

const entetes = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Prefer: 'count=exact',
  Range: '0-0',
};

async function compter(table, requete) {
  const r = await fetch(`${URL}/rest/v1/${table}?${requete}&select=id`, { headers: entetes });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
  const plage = r.headers.get('content-range') ?? '';
  const total = plage.split('/').pop();
  return Number(total ?? 0);
}

async function compterUtilisateursTest() {
  const r = await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`auth users: HTTP ${r.status}`);
  const corps = await r.json();
  return (corps.users ?? []).filter((u) => String(u.email ?? '').endsWith('@example.test')).length;
}

const controles = [
  ['clients @example.test', () => compter('clients', 'email=like.*%40example.test')],
  ['commandes ELB-*', () => compter('commandes', 'reference=like.ELB-*')],
  ['produits test-prix-*', () => compter('produits', 'id=like.test-prix-*')],
  ['dépenses de test', () => compter('depenses', 'libelle=like.*test*')],
  ['utilisateurs Auth @example.test', compterUtilisateursTest],
];

let residus = 0;
for (const [label, fn] of controles) {
  try {
    const n = await fn();
    console.log(`${n === 0 ? 'OK ' : 'RESTE'} ${label}: ${n}`);
    if (n !== 0) residus += n;
  } catch (erreur) {
    console.log(`ERREUR ${label}: ${erreur.message}`);
    residus += 1;
  }
}

if (residus > 0) {
  console.error(`\n${residus} donnée(s) de test résiduelle(s).`);
  process.exit(1);
}
console.log('\nAucune donnée de test résiduelle.');

#!/usr/bin/env node
/**
 * Génère l'API User et l'API Key du SANDBOX MTN, puis les écrit dans momo-service/.env.
 *
 * Sur le portail sandbox, ces deux identifiants ne se lisent pas : ils se créent par la
 * Provisioning API (documentation « API User & API Key Management ») :
 *
 *   POST {base}/apiuser                          X-Reference-Id: <UUID> (devient l'API User)
 *                                                { "providerCallbackHost": "<hôte>" }
 *   POST {base}/apiuser/{APIUser}/apikey         → { "apiKey": "…" }
 *
 * Les valeurs ne sont JAMAIS affichées : le script n'imprime que des empreintes masquées.
 *
 * Usage (à lancer via l'outil `terminal`) :
 *
 *   node scripts/provision-sandbox.mjs                    # hôte de callback par défaut : smartvision.cg
 *   node scripts/provision-sandbox.mjs --host monsite.cg
 *   node scripts/provision-sandbox.mjs --force            # régénère même si .env est déjà rempli
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHEMIN_ENV = join(RACINE, '.env');
const BASE_SANDBOX = 'https://sandbox.momodeveloper.mtn.com';

const args = process.argv.slice(2);
const force = args.includes('--force');
const hote = (() => {
  const i = args.indexOf('--host');
  return i >= 0 && args[i + 1] ? args[i + 1] : 'smartvision.cg';
})();

function masquer(valeur) {
  if (!valeur) return '(vide)';
  if (valeur.length <= 6) return `${'•'.repeat(valeur.length)} (${valeur.length} car.)`;
  return `${valeur.slice(0, 4)}…${valeur.slice(-3)} (${valeur.length} car.)`;
}

function lireEnv(texte) {
  const variables = new Map();
  for (const ligne of texte.split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(ligne.trim());
    if (!m) continue;
    variables.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
  return variables;
}

function ecrireEnv(texte, valeurs) {
  let sortie = texte;
  for (const [nom, valeur] of Object.entries(valeurs)) {
    const ligne = `${nom}=${valeur}`;
    const motif = new RegExp(`^${nom}\\s*=.*$`, 'm');
    sortie = motif.test(sortie) ? sortie.replace(motif, ligne) : `${sortie.replace(/\n*$/, '')}\n${ligne}\n`;
  }
  return sortie;
}

async function main() {
  if (!existsSync(CHEMIN_ENV)) {
    console.error(`Pas de fichier ${CHEMIN_ENV} : copiez .env.example et renseignez MOMO_SUBSCRIPTION_KEY.`);
    process.exit(1);
  }

  const texte = await readFile(CHEMIN_ENV, 'utf8');
  const env = lireEnv(texte);
  const cle = env.get('MOMO_SUBSCRIPTION_KEY') ?? '';
  const envCible = env.get('MOMO_ENV') ?? 'sandbox';
  const dejaUser = env.get('MOMO_API_USER') ?? '';
  const dejaKey = env.get('MOMO_API_KEY') ?? '';

  if (envCible !== 'sandbox') {
    console.error(`MOMO_ENV vaut « ${envCible} » : ce script ne provisionne QUE le sandbox. En production, l'API User et l'API Key se créent dans le Partner Portal.`);
    process.exit(1);
  }
  if (cle.length < 20) {
    console.error(`MOMO_SUBSCRIPTION_KEY semble incomplète (${cle.length} caractères) : récupérez la Primary Key de la souscription « Collection » dans votre profil du portail.`);
    process.exit(1);
  }
  if (dejaUser.length > 6 && dejaKey.length > 6 && !force) {
    console.log(`API User et API Key déjà renseignés (${masquer(dejaUser)} / ${masquer(dejaKey)}). Utilisez --force pour en générer de nouveaux.`);
    return;
  }

  const entetes = { 'Ocp-Apim-Subscription-Key': cle };
  const referenceId = randomUUID(); // devient l'API User

  /**
   * La documentation montre `{baseURL}/apiuser` ; le sandbox expose en réalité la provisioning
   * sous `/v1_0/apiuser`. On tente le chemin versionné d'abord : un 404 signifie « rien créé »,
   * donc l'essai est sans effet de bord.
   */
  async function creerApiUser(prefixe) {
    return fetch(`${BASE_SANDBOX}${prefixe}`, {
      method: 'POST',
      headers: { ...entetes, 'X-Reference-Id': referenceId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCallbackHost: hote }),
    });
  }

  console.log(`Création de l'API User sur ${BASE_SANDBOX} (hôte de callback déclaré : ${hote})`);
  let creation = await creerApiUser('/v1_0/apiuser');
  if (creation.status === 404) creation = await creerApiUser('/apiuser');
  if (creation.status !== 201) {
    console.error(`Échec (${creation.status}) : ${(await creation.text()).slice(0, 300)}`);
    console.error('Vérifiez la clé d’abonnement, et que le produit « Collection » est bien souscrit en sandbox.');
    process.exit(1);
  }
  console.log(`  API User créé : ${masquer(referenceId)}`);

  console.log("Génération de l'API Key");
  async function genererCle(prefixe) {
    return fetch(`${BASE_SANDBOX}${prefixe}/${referenceId}/apikey`, { method: 'POST', headers: entetes });
  }
  let generation = await genererCle('/v1_0/apiuser');
  if (generation.status === 404) generation = await genererCle('/apiuser');
  if (generation.status !== 201) {
    console.error(`Échec (${generation.status}) : ${(await generation.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const { apiKey } = await generation.json();
  if (!apiKey) {
    console.error('Réponse sans apiKey.');
    process.exit(1);
  }
  console.log(`  API Key générée : ${masquer(apiKey)}`);

  // Contrôle : la plateforme renvoie l'hôte de callback et l'environnement.
  const verif = await fetch(`${BASE_SANDBOX}/apiuser/${referenceId}`, { headers: entetes });
  if (verif.ok) {
    const details = await verif.json();
    console.log(`  Vérification : ${JSON.stringify(details)}`);
  }

  const nouveau = ecrireEnv(texte, { MOMO_API_USER: referenceId, MOMO_API_KEY: apiKey });
  await writeFile(CHEMIN_ENV, nouveau, 'utf8');
  await chmod(CHEMIN_ENV, 0o600);
  console.log(`Écrit dans ${CHEMIN_ENV} (permissions 600). Valeurs non affichées volontairement.`);
  console.log('Étape suivante : npm start, puis POST /api/momo/payer avec un numéro de test (…50, …51, …52).');
}

main().catch((erreur) => {
  console.error(`Erreur : ${erreur.message}`);
  process.exit(1);
});

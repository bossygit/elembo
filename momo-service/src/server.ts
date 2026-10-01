/**
 * Point d'entrée du service de paiement Elembo.
 *
 *   npm run dev  →  MOMO_MOCK=1 node src/server.ts    (démonstration, aucun appel à MTN)
 *   MOMO_ENV=sandbox MOMO_SUBSCRIPTION_KEY=… MOMO_API_USER=… MOMO_API_KEY=… node src/server.ts
 *
 * Node 20+ suffit (fetch natif) ; aucune dépendance à l'exécution.
 */

import { createServer } from 'node:http';

import { creerServeur } from './app.ts';
import { lireConfig } from './config.ts';
import { creerClientMock } from './mock-mtn.ts';
import { creerClientMomo } from './mtn.ts';
import { StoreTransactions } from './store.ts';

async function demarrer(): Promise<void> {
  const config = lireConfig();

  const client =
    config.mode === 'mock'
      ? creerClientMock({ delaiMs: config.delaiMockMs })
      : creerClientMomo({
          baseUrl: config.baseUrl,
          subscriptionKey: config.subscriptionKey,
          apiUser: config.apiUser,
          apiKey: config.apiKey,
          environnement: config.env,
          callbackUrl: config.callbackUrl,
        });

  const store = await StoreTransactions.ouvrir(config.fichierDonnees);
  const gerer = creerServeur({ config, client, store });
  const serveur = createServer((req, res) => {
    void gerer(req, res);
  });

  serveur.listen(config.port, () => {
    console.log(`Service MoMo Elembo — mode ${config.mode} (${config.env}), devise ${config.devise}`);
    console.log(`  écoute sur http://localhost:${config.port}`);
    console.log(`  origines autorisées : ${config.origines.join(', ')}`);
    if (config.mode === 'mock') {
      console.log('  MOMO_MOCK=1 : paiements simulés — …50 réussi, …51 refusé, …52 en attente.');
    }
  });
}

demarrer().catch((erreur: unknown) => {
  const e = erreur as Error;
  console.error(`Démarrage impossible : ${e.message}`);
  process.exit(1);
});

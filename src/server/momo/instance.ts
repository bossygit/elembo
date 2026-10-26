/**
 * Câblage unique du service de paiement pour les fonctions serverless.
 *
 * Une instance par processus (une fonction Vercel peut servir plusieurs requêtes) : le jeton MTN
 * est ainsi réutilisé au lieu d'être redemandé à chaque appel. Une erreur de configuration n'est
 * jamais mise en cache — elle doit se voir à chaque requête, avec son motif.
 */

import { ErreurConfig, lireConfig } from './config';
import { creerClientMock } from './mock-mtn';
import { creerClientMomo } from './mtn';
import { creerGestionnaire, type Gestionnaire } from './service';
import {
  StoreFichier,
  StoreMemoire,
  StoreRedis,
  StoreRedisUrl,
  type JournalTransactions,
} from './store';

let instance: Gestionnaire | null = null;
let enCours: Promise<Gestionnaire> | null = null;

export async function gestionnaire(): Promise<Gestionnaire> {
  if (instance) return instance;
  if (!enCours) {
    enCours = construire().finally(() => {
      enCours = null;
    });
  }
  const construit = await enCours;
  instance = construit;
  return construit;
}

/** Réservé aux tests : force la reconstruction à partir de l'environnement courant. */
export function reinitialiser(): void {
  instance = null;
  enCours = null;
  journalCourant = null;
}

/** Journal partagé par les routes de dépôt de fichiers (même instance que le paiement). */
export async function journal(): Promise<JournalTransactions> {
  await gestionnaire();
  if (!journalCourant) throw new Error('Journal indisponible.');
  return journalCourant;
}

let journalCourant: JournalTransactions | null = null;

async function construire(): Promise<Gestionnaire> {
  let config;
  try {
    config = lireConfig();
  } catch (erreur) {
    if (erreur instanceof ErreurConfig) throw erreur;
    throw new ErreurConfig(`Configuration illisible : ${(erreur as Error).message}`);
  }

  const store = await ouvrirStore(config.stockage);
  journalCourant = store;
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

  return creerGestionnaire({ config, client, store });
}

async function ouvrirStore(stockage: ReturnType<typeof lireConfig>['stockage']): Promise<JournalTransactions> {
  switch (stockage.genre) {
    case 'redis':
      return new StoreRedis(stockage.url, stockage.token);
    case 'redis-tcp':
      return new StoreRedisUrl(stockage.url);
    case 'fichier':
      return StoreFichier.ouvrir(stockage.fichier);
    case 'memoire':
      return new StoreMemoire();
  }
}

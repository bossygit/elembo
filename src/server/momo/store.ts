/**
 * Journal des transactions — abstraction de stockage.
 *
 * Chaque demande de paiement est enregistrée AVANT l'appel à MTN (sinon un paiement accepté par
 * MTN serait perdu), puis mise à jour à chaque changement d'état.
 *
 * Trois implémentations, choisies par la configuration :
 *
 *   StoreRedis    → production (Vercel, fonction serverless). État hors du processus, car une
 *                   fonction serverless n'a pas de disque et peut être recréée à tout instant.
 *                   API REST Upstash / Vercel KV (`UPSTASH_REDIS_REST_URL` ou `KV_REST_API_URL`).
 *   StoreFichier  → développement local avec de vraies clés MTN (écriture atomique, JSON).
 *   StoreMemoire  → démonstration (MOMO_MOCK=1) et tests. Perdu au redémarrage : c'est voulu.
 *
 * Le journal ne contient que des références et des montants — jamais de clé, jamais de numéro
 * complet (le MSISDN est stocké normalisé, il est masqué dans les journaux).
 */

import Redis from 'ioredis';

export type StatutTransaction = 'PENDING' | 'PAYE' | 'ECHEC' | 'ANOMALIE';

export type Evenement = { le: string; quoi: string; detail?: string };

/** Fichier d'impression déposé par le navigateur du client après paiement. */
export type FichierDepose = {
  nom: string;
  /** Chemin dans l'archive privée (Vercel Blob). */
  chemin: string;
  taille: number;
  type: string;
};

export type Transaction = {
  referenceId: string;
  commande: string;
  produitId: string;
  /** Résumé lisible de ce qui a été commandé (formats de tableaux, tailles…). */
  detail?: string;
  montantFcfa: number;
  montantEnvoye: string;
  devise: string;
  msisdn: string;
  statut: StatutTransaction;
  financialTransactionId: string | null;
  raison: string | null;
  creeLe: string;
  majLe: string;
  historique: Evenement[];
  /** Dossier de production reçu (PNG + fiche) — vide tant que le client n'a rien déposé. */
  fichiers?: FichierDepose[];
  /** Date du dépôt du dossier (ISO 8601). */
  dossierLe?: string;
};

export type NouvelleTransaction = Omit<
  Transaction,
  'creeLe' | 'majLe' | 'historique' | 'statut' | 'financialTransactionId' | 'raison'
>;

export type PatchTransaction = Partial<
  Pick<Transaction, 'statut' | 'financialTransactionId' | 'raison' | 'fichiers' | 'dossierLe'>
>;

export interface JournalTransactions {
  /** Vérification de vie du stockage, non destructive (PING, lecture, écriture sonde). */
  verifier(): Promise<void>;
  parReferenceId(referenceId: string): Promise<Transaction | undefined>;
  parCommande(commande: string): Promise<Transaction[]>;
  toutes(): Promise<Transaction[]>;
  creer(t: NouvelleTransaction): Promise<Transaction>;
  maj(referenceId: string, patch: PatchTransaction, evenement?: Evenement): Promise<Transaction>;
}

/* ------------------------------------------------------------------ mémoire ------ */

/**
 * Base commune : la logique de création/mise à jour est écrite une seule fois, les
 * implémentations ne fournissent que la lecture et l'écriture du support.
 */
export abstract class JournalEnMemoire implements JournalTransactions {
  protected readonly transactions = new Map<string, Transaction>();
  protected readonly maintenant: () => Date;

  constructor(maintenant: () => Date = () => new Date()) {
    this.maintenant = maintenant;
  }

  protected abstract persister(): Promise<void>;

  abstract verifier(): Promise<void>;
  abstract parReferenceId(referenceId: string): Promise<Transaction | undefined>;
  abstract toutes(): Promise<Transaction[]>;

  async parCommande(commande: string): Promise<Transaction[]> {
    return [...this.transactions.values()].filter((t) => t.commande === commande);
  }

  async creer(t: NouvelleTransaction): Promise<Transaction> {
    if (this.transactions.has(t.referenceId)) {
      throw new Error(`Transaction déjà enregistrée : ${t.referenceId}`);
    }
    const le = this.maintenant().toISOString();
    const transaction: Transaction = {
      ...t,
      statut: 'PENDING',
      financialTransactionId: null,
      raison: null,
      creeLe: le,
      majLe: le,
      historique: [{ le, quoi: 'demande creee' }],
    };
    this.transactions.set(transaction.referenceId, transaction);
    await this.persister();
    return transaction;
  }

  async maj(
    referenceId: string,
    patch: PatchTransaction,
    evenement?: Evenement,
  ): Promise<Transaction> {
    const existante = this.transactions.get(referenceId);
    if (!existante) throw new Error(`Transaction inconnue : ${referenceId}`);
    const maj: Transaction = {
      ...existante,
      ...patch,
      majLe: this.maintenant().toISOString(),
      historique: evenement ? [...existante.historique, evenement] : existante.historique,
    };
    this.transactions.set(referenceId, maj);
    await this.persister();
    return maj;
  }
}

/* ------------------------------------------------------------------ mémoire vif -- */

export class StoreMemoire extends JournalEnMemoire {
  protected async persister(): Promise<void> {}

  async verifier(): Promise<void> {}

  async parReferenceId(referenceId: string): Promise<Transaction | undefined> {
    return this.transactions.get(referenceId);
  }

  async toutes(): Promise<Transaction[]> {
    return [...this.transactions.values()];
  }
}

/* ------------------------------------------------------------------ fichier ------ */

/**
 * Développement local : même sémantique, état dans un fichier JSON.
 * L'écriture est atomique (fichier temporaire + renommage) : pas de JSON tronqué.
 */
export class StoreFichier extends JournalEnMemoire {
  private readonly fichier: string;

  constructor(fichier: string, maintenant: () => Date = () => new Date()) {
    super(maintenant);
    this.fichier = fichier;
  }

  static async ouvrir(fichier: string, maintenant?: () => Date): Promise<StoreFichier> {
    const store = new StoreFichier(fichier, maintenant);
    await store.charger();
    return store;
  }

  async verifier(): Promise<void> {
    // Lecture du dossier : on ne crée rien, on constate que le support est utilisable.
    const { access, mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(this.fichier), { recursive: true });
    await access(dirname(this.fichier));
  }

  async charger(): Promise<void> {
    const { readFile } = await import('node:fs/promises');
    try {
      const contenu = await readFile(this.fichier, 'utf8');
      const data = JSON.parse(contenu) as Transaction[];
      for (const t of data) this.transactions.set(t.referenceId, t);
    } catch (erreur) {
      const e = erreur as NodeJS.ErrnoException;
      // Fichier absent : c'est le premier démarrage.
      if (e.code !== 'ENOENT') throw erreur;
    }
  }

  protected async persister(): Promise<void> {
    const { mkdir, rename, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const liste = [...this.transactions.values()];
    await mkdir(dirname(this.fichier), { recursive: true });
    const temporaire = `${this.fichier}.tmp`;
    await writeFile(temporaire, JSON.stringify(liste, null, 2), 'utf8');
    await rename(temporaire, this.fichier);
  }

  async parReferenceId(referenceId: string): Promise<Transaction | undefined> {
    return this.transactions.get(referenceId);
  }

  async toutes(): Promise<Transaction[]> {
    return [...this.transactions.values()];
  }
}

/* ------------------------------------------------------------------ redis -------- */

/**
 * Journal de production : une seule table de hachage, un champ par référence.
 *
 * `HSETNX` sert de verrou de création (deux requêtes concurrentes ne peuvent pas enregistrer la
 * même référence). Le volume est celui d'une boutique artisanale : quelques milliers de champs,
 * `HGETALL` reste indolore.
 *
 * Deux transports, un seul protocole de commandes — c'est exactement le même code métier :
 *
 *   ExecuteurRest → API HTTP d'Upstash / Vercel KV (pas de socket, idéal si l'on revient à un
 *                   fournisseur REST). Variables UPSTASH_REDIS_REST_URL ou KV_REST_API_URL.
 *   ExecuteurTcp  → connexion Redis classique via `REDIS_URL`. C'est ce que fournit
 *                   l'intégration Redis de Vercel (« redis » du marketplace).
 *
 * Le choix se fait dans `config.ts` ; ici, aucune connaissance de l'hébergeur.
 */

export class ErreurStockage extends Error {}

/** Le minimum dont le journal a besoin : exécuter une commande Redis, quelle que soit la socket. */
export interface ExecuteurRedis {
  executer(...args: (string | number)[]): Promise<unknown>;
  fermer?(): Promise<void>;
}

/* ------------------------------------------------------------------ REST --------- */

type ReponseRedis = { result?: unknown; error?: string };

export class ExecuteurRest implements ExecuteurRedis {
  readonly url: string;
  readonly token: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(url: string, token: string, fetchImpl?: typeof globalThis.fetch) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  async executer(...args: (string | number)[]): Promise<unknown> {
    let reponse: Response;
    try {
      reponse = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        cache: 'no-store',
      });
    } catch (erreur) {
      throw new ErreurStockage(
        `Stockage des transactions injoignable (${(erreur as Error).message}). Aucun paiement ne doit être accepté sans journal.`,
      );
    }
    const corps = (await reponse.json().catch(() => ({}))) as ReponseRedis;
    if (!reponse.ok || corps.error) {
      throw new ErreurStockage(
        `Stockage des transactions en erreur (HTTP ${reponse.status}) : ${corps.error ?? 'réponse illisible'}`,
      );
    }
    return corps.result;
  }
}

/* ------------------------------------------------------------------ TCP ---------- */

type ClientRedisMinimal = {
  call(commande: string, ...args: (string | number)[]): Promise<unknown>;
  ping(): Promise<string>;
  quit?(): Promise<unknown>;
  disconnect?(): void;
};

export class ExecuteurTcp implements ExecuteurRedis {
  readonly url: string;
  private readonly client: ClientRedisMinimal;

  constructor(url: string, client?: ClientRedisMinimal) {
    this.url = url;
    if (client) {
      this.client = client;
      return;
    }
    // Import statique : la route tourne en runtime Node, `ioredis` est conservé en dépendance
    // externe (serverExternalPackages) pour éviter que le bundler ne casse ses `require` internes.
    this.client = new Redis(url, {
      lazyConnect: false,
      // Une fonction serverless peut être gelée puis réveillée : on ne veut pas qu'une commande
      // attende indéfiniment, mais on laisse quelques tentatives avant de déclarer l'échec.
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      enableOfflineQueue: true,
    });
    (this.client as unknown as { on: (evt: string, fn: () => void) => void }).on?.('error', () => {
      // Les erreurs remontent déjà par la promesse de la commande ; ce listener évite que
      // Node considère l'émission comme non gérée et fasse tomber le processus.
    });
  }

  async executer(...args: (string | number)[]): Promise<unknown> {
    const [commande, ...reste] = args;
    try {
      return await this.client.call(String(commande), ...reste);
    } catch (erreur) {
      throw new ErreurStockage(
        `Stockage des transactions en erreur : ${(erreur as Error).message}. Aucun paiement ne doit être accepté sans journal.`,
      );
    }
  }

  async fermer(): Promise<void> {
    try {
      await this.client.quit?.();
    } catch {
      this.client.disconnect?.();
    }
  }
}

/* ------------------------------------------------------------------ journal ------ */

export class JournalRedis implements JournalTransactions {
  readonly cle: string;
  private readonly executeur: ExecuteurRedis;
  private readonly maintenant: () => Date;

  constructor(
    executeur: ExecuteurRedis,
    options: { cle?: string; maintenant?: () => Date } = {},
  ) {
    this.executeur = executeur;
    this.cle = options.cle ?? 'elembo:transactions:v1';
    this.maintenant = options.maintenant ?? (() => new Date());
  }

  /** Vérification de vie du stockage (PING) — utilisée par /api/sante, non destructive. */
  async verifier(): Promise<void> {
    try {
      const reponse = await this.executeur.executer('PING');
      if (String(reponse).toUpperCase() !== 'PONG') {
        throw new Error(`réponse inattendue : ${String(reponse)}`);
      }
    } catch (erreur) {
      if (erreur instanceof ErreurStockage) throw erreur;
      throw new ErreurStockage(`Stockage des transactions injoignable : ${(erreur as Error).message}`);
    }
  }

  async parReferenceId(referenceId: string): Promise<Transaction | undefined> {
    const brut = await this.executeur.executer('HGET', this.cle, referenceId);
    return typeof brut === 'string' ? (JSON.parse(brut) as Transaction) : undefined;
  }

  async toutes(): Promise<Transaction[]> {
    return this.lireTout();
  }

  async parCommande(commande: string): Promise<Transaction[]> {
    return (await this.lireTout()).filter((t) => t.commande === commande);
  }

  private async lireTout(): Promise<Transaction[]> {
    const brut = await this.executeur.executer('HGETALL', this.cle);
    // Upstash renvoie un objet { champ: valeur } ; ioredis renvoie des paires [champ, valeur…].
    if (Array.isArray(brut)) {
      const valeurs: Transaction[] = [];
      for (let i = 1; i < brut.length; i += 2) {
        const v = brut[i];
        if (typeof v === 'string') valeurs.push(JSON.parse(v) as Transaction);
      }
      return valeurs;
    }
    if (brut && typeof brut === 'object') {
      return Object.values(brut as Record<string, string>).map((v) => JSON.parse(v) as Transaction);
    }
    return [];
  }

  async creer(t: NouvelleTransaction): Promise<Transaction> {
    const le = this.maintenant().toISOString();
    const transaction: Transaction = {
      ...t,
      statut: 'PENDING',
      financialTransactionId: null,
      raison: null,
      creeLe: le,
      majLe: le,
      historique: [{ le, quoi: 'demande creee' }],
    };
    const pose = await this.executeur.executer('HSETNX', this.cle, t.referenceId, JSON.stringify(transaction));
    if (Number(pose) !== 1) {
      throw new ErreurStockage(`Transaction déjà enregistrée : ${t.referenceId}`);
    }
    return transaction;
  }

  async maj(
    referenceId: string,
    patch: PatchTransaction,
    evenement?: Evenement,
  ): Promise<Transaction> {
    const existante = await this.parReferenceId(referenceId);
    if (!existante) throw new ErreurStockage(`Transaction inconnue : ${referenceId}`);
    const maj: Transaction = {
      ...existante,
      ...patch,
      majLe: this.maintenant().toISOString(),
      historique: evenement ? [...existante.historique, evenement] : existante.historique,
    };
    await this.executeur.executer('HSET', this.cle, referenceId, JSON.stringify(maj));
    return maj;
  }
}

/** Transport REST (Upstash / Vercel KV). */
export class StoreRedis extends JournalRedis {
  constructor(
    url: string,
    token: string,
    options: { cle?: string; maintenant?: () => Date; fetch?: typeof globalThis.fetch } = {},
  ) {
    super(new ExecuteurRest(url, token, options.fetch), options);
  }
}

/** Transport TCP — c'est celui de l'intégration Redis de Vercel (`REDIS_URL`). */
export class StoreRedisUrl extends JournalRedis {
  constructor(url: string, options: { cle?: string; maintenant?: () => Date } = {}) {
    super(new ExecuteurTcp(url), options);
  }
}

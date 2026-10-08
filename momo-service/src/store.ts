/**
 * Journal des transactions.
 *
 * Chaque demande de paiement est enregistrée AVANT l'appel à MTN (sinon un paiement accepté
 * par MTN serait perdu si le processus s'arrête), puis mise à jour à chaque changement d'état.
 * L'écriture est atomique (fichier temporaire + renommage) : pas de JSON tronqué.
 *
 * Le fichier ne contient que des références et des montants — jamais de clé.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type StatutTransaction = 'PENDING' | 'PAYE' | 'ECHEC' | 'ANOMALIE';

export type Evenement = { le: string; quoi: string; detail?: string };

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
};

export class StoreTransactions {
  private transactions = new Map<string, Transaction>();
  private readonly fichier: string;
  private readonly maintenant: () => Date;

  // Champs explicites (pas de propriété de paramètre) : Node exécute le TypeScript en mode
  // « strip-only », qui refuse `constructor(private readonly x: T)`.
  constructor(fichier: string, maintenant: () => Date = () => new Date()) {
    this.fichier = fichier;
    this.maintenant = maintenant;
  }

  static async ouvrir(fichier: string, maintenant?: () => Date): Promise<StoreTransactions> {
    const store = new StoreTransactions(fichier, maintenant);
    await store.charger();
    return store;
  }

  async charger(): Promise<void> {
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

  private async ecrire(): Promise<void> {
    const liste = [...this.transactions.values()];
    await mkdir(dirname(this.fichier), { recursive: true });
    const temporaire = `${this.fichier}.tmp`;
    await writeFile(temporaire, JSON.stringify(liste, null, 2), 'utf8');
    await rename(temporaire, this.fichier);
  }

  parReferenceId(referenceId: string): Transaction | undefined {
    return this.transactions.get(referenceId);
  }

  parCommande(commande: string): Transaction[] {
    return [...this.transactions.values()].filter((t) => t.commande === commande);
  }

  toutes(): Transaction[] {
    return [...this.transactions.values()];
  }

  async creer(t: Omit<Transaction, 'creeLe' | 'majLe' | 'historique' | 'statut' | 'financialTransactionId' | 'raison'>): Promise<Transaction> {
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
    await this.ecrire();
    return transaction;
  }

  async maj(
    referenceId: string,
    patch: Partial<Pick<Transaction, 'statut' | 'financialTransactionId' | 'raison'>>,
    evenement?: Evenement,
  ): Promise<Transaction> {
    const existante = this.transactions.get(referenceId);
    if (!existante) throw new Error(`Transaction inconnue : ${referenceId}`);
    const maj = {
      ...existante,
      ...patch,
      majLe: this.maintenant().toISOString(),
      historique: evenement ? [...existante.historique, evenement] : existante.historique,
    };
    this.transactions.set(referenceId, maj);
    await this.ecrire();
    return maj;
  }
}

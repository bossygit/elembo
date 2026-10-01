/**
 * Les trois routes HTTP du service de paiement — le seul endroit qui parle à MTN.
 *
 *   POST /api/momo/payer      le navigateur annonce la commande ; le MONTANT EST RECALCULÉ ici,
 *                             jamais repris du client. Renvoie la référence à suivre.
 *   POST /api/momo/callback   MTN prévient d'un changement d'état. On ne le croit pas sur parole :
 *                             on revérifie le statut par l'API, on compare le montant au nôtre.
 *                             Toujours répondu 200 (sinon MTN rejoue la notification en boucle).
 *   GET  /api/momo/statut     le navigateur sonde l'état : PENDING / PAYE / ECHEC.
 *
 * Sécurité : la clé d'abonnement ne quitte jamais ce processus ; le total validé par le client
 * n'est jamais réutilisé comme montant de facturation ; toute divergence de montant produit une
 * ANOMALIE, jamais un paiement accepté.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { ErreurConfig, type Config } from './config.ts';
import { ErreurTelephone, masquerMsisdn, normaliserMsisdn } from './msisdn.ts';
import { ErreurCommande, calculerMontant, type Ligne } from './pricing.ts';
import { ErreurMomo, type ClientMomo } from './mtn.ts';
import type { StoreTransactions } from './store.ts';

export type Dependances = {
  config: Config;
  client: ClientMomo;
  store: StoreTransactions;
  /** Horloge injectable (tests). */
  maintenant?: () => Date;
  journal?: (ligne: string) => void;
};

const TAILLE_MAX_CORPS = 64 * 1024;

type PayloadPayer = {
  commande?: string;
  produitId?: string;
  lignes?: Ligne[];
  villeId?: string;
  telephone?: string;
};

function repondre(
  res: ServerResponse,
  statut: number,
  corps: unknown,
  entetes: Record<string, string> = {},
): void {
  const charge = corps === undefined ? '' : JSON.stringify(corps);
  res.writeHead(statut, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...entetes,
  });
  res.end(charge);
}

function entetesCors(origine: string | undefined, origines: string[]): Record<string, string> {
  if (!origine || !origines.includes(origine)) return {};
  return {
    'Access-Control-Allow-Origin': origine,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

async function lireCorps(req: IncomingMessage): Promise<unknown> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const morceau of req) {
    taille += (morceau as Buffer).length;
    if (taille > TAILLE_MAX_CORPS) throw new ErreurCommande('Corps de requête trop volumineux.');
    morceaux.push(morceau as Buffer);
  }
  if (!morceaux.length) return {};
  try {
    return JSON.parse(Buffer.concat(morceaux).toString('utf8'));
  } catch {
    throw new ErreurCommande('Corps JSON illisible.');
  }
}

/** MTN envoie la référence dans le corps ou dans l'URL selon la version de callback. */
function referenceDuCallback(url: URL, corps: unknown): string | null {
  const c = (corps ?? {}) as Record<string, unknown>;
  const candidates = [
    c.referenceId,
    c.reference_id,
    c.externalId,
    (c as { resource?: { referenceId?: string } }).resource?.referenceId,
    url.searchParams.get('referenceId'),
  ];
  for (const valeur of candidates) {
    if (typeof valeur === 'string' && valeur.trim()) return valeur.trim();
  }
  return null;
}

export function creerServeur(deps: Dependances) {
  const { config, client, store } = deps;
  const journal = deps.journal ?? ((ligne: string) => console.log(ligne));
  const maintenant = deps.maintenant ?? (() => new Date());

  return async function gerer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const cors = entetesCors(req.headers.origin, config.origines);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    try {
      if (req.method === 'GET' && (url.pathname === '/sante' || url.pathname === '/health')) {
        repondre(res, 200, { ok: true, mode: config.mode, env: config.env, devise: config.devise }, cors);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/momo/payer') {
        const corps = (await lireCorps(req)) as PayloadPayer;

        const commande = String(corps.commande ?? '').trim();
        if (!commande) throw new ErreurCommande('Référence de commande manquante.');

        // Le montant est recalculé ici : le client ne fait que décrire ce qu'il a choisi.
        const montant = calculerMontant({
          produitId: String(corps.produitId ?? ''),
          lignes: corps.lignes ?? [],
          villeId: String(corps.villeId ?? ''),
        });

        const msisdn = normaliserMsisdn(String(corps.telephone ?? ''), config.env);
        const montantEnvoye =
          config.devise === 'XAF' ? String(montant.montantFcfa) : config.montantSandbox;

        const referenceId = randomUUID();
        await store.creer({
          referenceId,
          commande,
          produitId: String(corps.produitId ?? ''),
          montantFcfa: montant.montantFcfa,
          montantEnvoye,
          devise: config.devise,
          msisdn,
        });

        try {
          await client.demarrerPaiement({
            referenceId,
            montant: montantEnvoye,
            devise: config.devise,
            telephone: msisdn,
            externalId: commande,
          });
        } catch (erreur) {
          await store.maj(referenceId, { statut: 'ECHEC', raison: 'DEMANDE_REFUSEE' }, {
            le: maintenant().toISOString(),
            quoi: 'demande refusee',
            detail: erreur instanceof ErreurMomo ? `HTTP ${erreur.statutHttp ?? '?'}` : 'erreur reseau',
          });
          throw erreur;
        }

        journal(
          `paiement demandé — commande ${commande} — ${montant.montantFcfa} FCFA — ${masquerMsisdn(msisdn)} — ${referenceId}`,
        );
        repondre(
          res,
          201,
          {
            referenceId,
            statut: 'PENDING',
            montantFcfa: montant.montantFcfa,
            montantEnvoye,
            devise: config.devise,
            quantiteTotale: montant.quantiteTotale,
            delaiJours: montant.delaiJours,
          },
          cors,
        );
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/momo/callback') {
        const corps = await lireCorps(req);
        const referenceId = referenceDuCallback(url, corps);
        if (!referenceId) {
          journal('callback ignoré : aucune référence exploitable');
          repondre(res, 200, { recu: true, traite: false }, cors);
          return;
        }

        const transaction = store.parReferenceId(referenceId);
        if (!transaction) {
          journal(`callback pour une référence inconnue : ${referenceId}`);
          repondre(res, 200, { recu: true, traite: false }, cors);
          return;
        }

        // Un paiement tranché ne se rejoue pas : le callback peut arriver plusieurs fois.
        if (transaction.statut === 'PAYE' || transaction.statut === 'ECHEC') {
          repondre(res, 200, { recu: true, traite: false, statut: transaction.statut }, cors);
          return;
        }

        // On ne croit pas la notification : on redemande le statut à MTN.
        const etat = await client.statut(referenceId);
        if (etat.statut === 'PENDING') {
          await store.maj(referenceId, {}, { le: maintenant().toISOString(), quoi: 'callback : toujours en attente' });
          repondre(res, 200, { recu: true, traite: true, statut: 'PENDING' }, cors);
          return;
        }

        if (etat.statut === 'FAILED') {
          await store.maj(
            referenceId,
            { statut: 'ECHEC', raison: etat.raison ?? 'REFUSE' },
            { le: maintenant().toISOString(), quoi: 'paiement refuse', detail: etat.raison ?? '' },
          );
          journal(`paiement refusé — commande ${transaction.commande}`);
          repondre(res, 200, { recu: true, traite: true, statut: 'ECHEC' }, cors);
          return;
        }

        // SUCCESSFUL : le montant encaissé doit être exactement celui attendu.
        if (etat.montant != null && String(etat.montant) !== String(transaction.montantEnvoye)) {
          await store.maj(
            referenceId,
            { statut: 'ANOMALIE', raison: `montant recu ${etat.montant} != attendu ${transaction.montantEnvoye}` },
            {
              le: maintenant().toISOString(),
              quoi: 'anomalie de montant',
              detail: `recu ${etat.montant} ${etat.devise ?? ''} / attendu ${transaction.montantEnvoye}`,
            },
          );
          journal(`ANOMALIE de montant — commande ${transaction.commande} — à vérifier avant production`);
          repondre(res, 200, { recu: true, traite: true, statut: 'ANOMALIE' }, cors);
          return;
        }

        await store.maj(
          referenceId,
          { statut: 'PAYE', financialTransactionId: etat.financialTransactionId, raison: null },
          {
            le: maintenant().toISOString(),
            quoi: 'paiement confirme',
            detail: etat.financialTransactionId ?? '',
          },
        );
        journal(`paiement confirmé — commande ${transaction.commande} — ${transaction.montantFcfa} FCFA`);
        repondre(res, 200, { recu: true, traite: true, statut: 'PAYE' }, cors);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/momo/statut') {
        const referenceId = url.searchParams.get('referenceId') ?? '';
        if (!referenceId) throw new ErreurCommande('Paramètre referenceId manquant.');
        const transaction = store.parReferenceId(referenceId);
        if (!transaction) {
          repondre(res, 404, { erreur: 'Référence inconnue.' }, cors);
          return;
        }

        // Tant que le client n'a pas validé sur son téléphone, on interroge MTN.
        if (transaction.statut === 'PENDING') {
          const etat = await client.statut(referenceId);
          if (etat.statut !== 'PENDING') {
            const statut = etat.statut === 'FAILED' ? 'ECHEC' : 'PAYE';
            await store.maj(
              referenceId,
              { statut, financialTransactionId: etat.financialTransactionId, raison: etat.raison },
              { le: maintenant().toISOString(), quoi: `statut ${statut} (interrogation directe)` },
            );
          }
        }

        const aJour = store.parReferenceId(referenceId);
        repondre(
          res,
          200,
          {
            referenceId,
            commande: aJour?.commande,
            statut: aJour?.statut,
            montantFcfa: aJour?.montantFcfa,
            devise: aJour?.devise,
            financialTransactionId: aJour?.financialTransactionId ?? null,
            raison: aJour?.raison ?? null,
          },
          cors,
        );
        return;
      }

      repondre(res, 404, { erreur: 'Route inconnue.' }, cors);
    } catch (erreur) {
      const cors2 = cors;
      if (erreur instanceof ErreurTelephone || erreur instanceof ErreurCommande) {
        repondre(res, 422, { erreur: erreur.message }, cors2);
        return;
      }
      if (erreur instanceof ErreurConfig) {
        repondre(res, 500, { erreur: 'Configuration du service incomplète.' }, cors2);
        return;
      }
      if (erreur instanceof ErreurMomo) {
        repondre(res, 502, { erreur: 'MTN a refusé ou n’a pas répondu.', detail: erreur.message }, cors2);
        return;
      }
      journal(`erreur inattendue : ${(erreur as Error)?.message}`);
      repondre(res, 500, { erreur: 'Erreur interne.' }, cors2);
    }
  };
}

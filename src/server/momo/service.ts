/**
 * La logique de paiement, indépendante du serveur HTTP qui l'appelle.
 *
 *   payer(payload)             le navigateur annonce la commande ; le MONTANT EST RECALCULÉ ici,
 *                              jamais repris du client. Renvoie la référence à suivre.
 *   callback(payload, ref)     MTN prévient d'un changement d'état. On ne le croit pas sur parole :
 *                              on revérifie le statut par l'API, on compare le montant au nôtre.
 *                              Toujours répondu 200 (sinon MTN rejoue la notification en boucle).
 *   statut(referenceId)        le navigateur sonde l'état : PENDING / PAYE / ECHEC.
 *   tarifs()                   tarifs que CE processus appliquera (lecture seule).
 *   sante()                    mode, environnement, devise.
 *
 * Aucune dépendance à `next` : les routes (`src/app/api/momo/*`) ne sont qu'une enveloppe HTTP.
 * C'est ce qui rend la logique testable sans serveur, et réutilisable si l'hébergement change.
 *
 * Sécurité : la clé d'abonnement ne quitte jamais ce module ; le total validé par le client n'est
 * jamais réutilisé comme montant de facturation ; toute divergence de montant produit une
 * ANOMALIE, jamais un paiement accepté.
 */

import { randomUUID } from 'node:crypto';

import { CATALOGUE, FORMATS_TABLEAU, PALIERS_TABLEAU, VILLES } from './catalogue';
import { ErreurConfig, type Config } from './config';
import { ErreurTelephone, masquerMsisdn, normaliserMsisdn } from './msisdn';
import { ErreurCommande, calculerMontant, type Ligne, type LigneTableau, type Montant } from './pricing';
import { ErreurMomo, type ClientMomo } from './mtn';
import { ErreurStockage, type JournalTransactions } from './store';
import { archiveConfiguree } from '../dossiers/archive';
import { telegramConfigure } from '../dossiers/telegram';

export type Reponse = { statut: number; corps: unknown };

export type Dependances = {
  config: Config;
  client: ClientMomo;
  store: JournalTransactions;
  /** Horloge injectable (tests). */
  maintenant?: () => Date;
  journal?: (ligne: string) => void;
};

/** MTN abandonne une demande non validée au bout de 5 minutes : au-delà, la commande est libre. */
const FENETRE_MTN_MS = 5 * 60 * 1000;

export type PayloadPayer = {
  commande?: string;
  produitId?: string;
  lignes?: Ligne[];
  /** Produit « tableau » : une ligne par format (monté ou toile seule). */
  tableaux?: LigneTableau[];
  villeId?: string;
  telephone?: string;
};

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/** Résumé lisible de la commande, conservé avec la transaction (traçabilité atelier). */
function detailCommande(montant: Montant): string | undefined {
  if (!montant.lignesTableaux?.length) return undefined;
  return montant.lignesTableaux
    .map(
      (l) =>
        `${l.formatLibelle} ${l.support === 'chassis' ? 'monté sur châssis' : 'toile seule'} ×${l.quantite}${l.remisePct ? ` (−${l.remisePct} %)` : ''}`,
    )
    .join(' + ');
}

export type Gestionnaire = {
  sante(): Promise<Reponse>;
  tarifs(): Promise<Reponse>;
  payer(payload: unknown): Promise<Reponse>;
  callback(payload: unknown, referenceDuChemin?: string | null): Promise<Reponse>;
  statut(referenceId: string): Promise<Reponse>;
};

export function creerGestionnaire(deps: Dependances): Gestionnaire {
  const { config, client, store } = deps;
  const journal = deps.journal ?? ((ligne: string) => console.log(ligne));
  const maintenant = deps.maintenant ?? (() => new Date());
  const chargeLe = maintenant().toISOString();

  /** Traduction d'une exception en réponse HTTP — jamais de détail interne pour le client. */
  async function executer(action: () => Promise<Reponse>): Promise<Reponse> {
    try {
      return await action();
    } catch (erreur) {
      if (erreur instanceof ErreurTelephone || erreur instanceof ErreurCommande) {
        return { statut: 422, corps: { erreur: erreur.message } };
      }
      if (erreur instanceof ErreurConfig) {
        journal(`configuration incomplète : ${erreur.message}`);
        return { statut: 500, corps: { erreur: 'Configuration du service incomplète.', detail: erreur.message } };
      }
      if (erreur instanceof ErreurStockage) {
        journal(`stockage en erreur : ${erreur.message}`);
        return { statut: 503, corps: { erreur: 'Journal des transactions indisponible.', detail: erreur.message } };
      }
      if (erreur instanceof ErreurMomo) {
        return {
          statut: 502,
          corps: { erreur: 'MTN a refusé ou n’a pas répondu.', detail: erreur.message },
        };
      }
      journal(`erreur inattendue : ${(erreur as Error)?.message}`);
      return { statut: 500, corps: { erreur: 'Erreur interne.', detail: (erreur as Error)?.message } };
    }
  }

  return {
    async sante() {
      // La santé inclut une vérification RÉELLE du journal (PING). Sans cela, un déploiement
      // « vert » pourrait en fait refuser tous les paiements : le seul symptôme serait une
      // commande client qui échoue. Coût : une commande Redis, aucune écriture.
      const etat = {
        mode: config.mode,
        env: config.env,
        devise: config.devise,
        stockage: config.stockage.genre,
        // L'atelier fait partie de la chaîne : un dossier qui n'arrive nulle part est une vente
        // perdue. On rend donc visible l'état de l'archive et du canal d'alerte.
        atelier: {
          archive: archiveConfiguree() ? 'blob' : 'absent',
          notification: telegramConfigure() ? 'telegram' : 'absent',
        },
      };
      try {
        await store.verifier();
        return { statut: 200, corps: { ok: true, ...etat, stockageJoignable: true } };
      } catch (erreur) {
        journal(`journal indisponible : ${(erreur as Error).message}`);
        return {
          statut: 503,
          corps: {
            ok: false,
            ...etat,
            stockageJoignable: false,
            detail: (erreur as Error).message,
          },
        };
      }
    },

    async tarifs() {
      return executer(async () => ({
        statut: 200,
        corps: {
          env: config.env,
          devise: config.devise,
          chargeLe,
          produits: CATALOGUE.map((p) => ({ id: p.id, nom: p.nom, prixFcfa: p.prixFcfa })),
          villes: VILLES.map((v) => ({
            id: v.id,
            nom: v.nom,
            fraisFcfa: v.fraisFcfa,
            delaiMaxJours: v.delaiMaxJours,
          })),
          tableaux: {
            formats: FORMATS_TABLEAU.map((f) => ({
              id: f.id,
              libelle: f.libelle,
              largeurCm: f.largeurCm,
              hauteurCm: f.hauteurCm,
              prixToileSeuleFcfa: f.prixToileSeuleFcfa,
              prixChassisFcfa: f.prixChassisFcfa,
            })),
            paliers: PALIERS_TABLEAU.map((p) => ({ aPartirDe: p.aPartirDe, remisePct: p.remisePct })),
          },
        },
      }));
    },

    async payer(payload) {
      return executer(async () => {
        const corps = (payload ?? {}) as PayloadPayer;

        const commande = texte(corps.commande);
        if (!commande) throw new ErreurCommande('Référence de commande manquante.');

        // Le montant est recalculé ici : le client ne fait que décrire ce qu'il a choisi.
        // La validation vient AVANT le contrôle de doublon : sur une requête mal formée, le
        // client doit lire la vraie raison (produit inconnu, quantité invalide) et non un
        // « paiement déjà en cours » qui masquerait l'erreur de saisie.
        const montant = calculerMontant({
          produitId: texte(corps.produitId),
          lignes: corps.lignes ?? [],
          tableaux: corps.tableaux ?? [],
          villeId: texte(corps.villeId),
        });

        // Prévention des doubles commandes. Le navigateur peut réémettre exactement la même
        // commande (double clic, réponse perdue, rafraîchissement) : c'est ici que ça s'arrête.
        //  - commande déjà PAYÉE  : aucun second débit, jamais ;
        //  - demande encore EN COURS (< fenêtre MTN) : on refuse le doublon, le client valide
        //    celle qui est déjà sur son téléphone ;
        //  - demande EXPIRÉE (MTN abandonne au bout de 5 minutes) : nouvelle tentative permise.
        const tentatives = await store.parCommande(commande);
        const dejaPayee = tentatives.find((t) => t.statut === 'PAYE');
        if (dejaPayee) {
          throw new ErreurCommande(
            `Commande ${commande} déjà payée (référence ${dejaPayee.referenceId}) : aucun second débit.`,
          );
        }
        const enCours = tentatives.find(
          (t) => t.statut === 'PENDING' && maintenant().getTime() - Date.parse(t.creeLe) < FENETRE_MTN_MS,
        );
        if (enCours) {
          throw new ErreurCommande(
            `Un paiement est déjà en cours pour la commande ${commande} : validez-le sur le téléphone, ou attendez son expiration (5 minutes) avant de réessayer.`,
          );
        }

        const msisdn = normaliserMsisdn(texte(corps.telephone), config.env);
        const montantEnvoye = config.devise === 'XAF' ? String(montant.montantFcfa) : config.montantSandbox;

        const referenceId = randomUUID();
        await store.creer({
          referenceId,
          commande,
          produitId: texte(corps.produitId),
          detail: detailCommande(montant),
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

        return {
          statut: 201,
          corps: {
            referenceId,
            statut: 'PENDING',
            montantFcfa: montant.montantFcfa,
            montantEnvoye,
            devise: config.devise,
            quantiteTotale: montant.quantiteTotale,
            delaiJours: montant.delaiJours,
            lignesTableaux: montant.lignesTableaux ?? [],
          },
        };
      });
    },

    async callback(payload, referenceDuChemin = null) {
      return executer(async () => {
        const corps = (payload ?? {}) as Record<string, unknown>;
        const c = corps as {
          referenceId?: unknown;
          reference_id?: unknown;
          externalId?: unknown;
          resource?: { referenceId?: unknown };
        };

        // MTN envoie la référence dans le corps, ou dans le chemin (jamais en paramètre d'URL).
        const candidats = [
          c.referenceId,
          c.reference_id,
          c.externalId,
          c.resource?.referenceId,
          referenceDuChemin,
        ];
        let referenceId: string | null = null;
        for (const candidat of candidats) {
          const v = texte(candidat);
          if (v) {
            referenceId = v;
            break;
          }
        }

        if (!referenceId) {
          journal('callback ignoré : aucune référence exploitable');
          return { statut: 200, corps: { recu: true, traite: false } };
        }

        const transaction = await store.parReferenceId(referenceId);
        if (!transaction) {
          journal(`callback pour une référence inconnue : ${referenceId}`);
          return { statut: 200, corps: { recu: true, traite: false } };
        }

        // Un paiement tranché ne se rejoue pas : le callback peut arriver plusieurs fois.
        if (transaction.statut === 'PAYE' || transaction.statut === 'ECHEC') {
          return { statut: 200, corps: { recu: true, traite: false, statut: transaction.statut } };
        }

        // On ne croit pas la notification : on redemande le statut à MTN.
        const etat = await client.statut(referenceId);
        if (etat.statut === 'PENDING') {
          await store.maj(referenceId, {}, { le: maintenant().toISOString(), quoi: 'callback : toujours en attente' });
          return { statut: 200, corps: { recu: true, traite: true, statut: 'PENDING' } };
        }

        if (etat.statut === 'FAILED') {
          await store.maj(
            referenceId,
            { statut: 'ECHEC', raison: etat.raison ?? 'REFUSE' },
            { le: maintenant().toISOString(), quoi: 'paiement refuse', detail: etat.raison ?? '' },
          );
          journal(`paiement refusé — commande ${transaction.commande}`);
          return { statut: 200, corps: { recu: true, traite: true, statut: 'ECHEC' } };
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
          return { statut: 200, corps: { recu: true, traite: true, statut: 'ANOMALIE' } };
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
        return { statut: 200, corps: { recu: true, traite: true, statut: 'PAYE' } };
      });
    },

    async statut(referenceId) {
      return executer(async () => {
        const ref = texte(referenceId);
        if (!ref) throw new ErreurCommande('Paramètre referenceId manquant.');

        const transaction = await store.parReferenceId(ref);
        if (!transaction) return { statut: 404, corps: { erreur: 'Référence inconnue.' } };

        // Tant que le client n'a pas validé sur son téléphone, on interroge MTN.
        if (transaction.statut === 'PENDING') {
          const etat = await client.statut(ref);
          if (etat.statut !== 'PENDING') {
            const statut = etat.statut === 'FAILED' ? 'ECHEC' : 'PAYE';
            await store.maj(
              ref,
              { statut, financialTransactionId: etat.financialTransactionId, raison: etat.raison },
              { le: maintenant().toISOString(), quoi: `statut ${statut} (interrogation directe)` },
            );
          }
        }

        const aJour = await store.parReferenceId(ref);
        return {
          statut: 200,
          corps: {
            referenceId: ref,
            commande: aJour?.commande,
            statut: aJour?.statut,
            montantFcfa: aJour?.montantFcfa,
            devise: aJour?.devise,
            financialTransactionId: aJour?.financialTransactionId ?? null,
            raison: aJour?.raison ?? null,
          },
        };
      });
    },
  };
}

/* --------------------------------------------------------------------------- CORS -- */

/**
 * Le site et l'API vivent désormais sur le MÊME domaine : le CORS n'est plus nécessaire en
 * production. Il reste utile pendant la transition (site encore sur GitHub Pages) et pour les
 * appels de test. Origines autorisées : `APP_ORIGINS` (séparées par des virgules).
 */
export function entetesCors(origine: string | undefined | null, origines: string[]): Record<string, string> {
  if (!origine || !origines.includes(origine)) return {};
  return {
    'Access-Control-Allow-Origin': origine,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

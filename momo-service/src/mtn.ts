/**
 * Client MTN Mobile Money (produit Collections).
 *
 *   POST {base}/collection/token/                      → jeton d'accès (mis en cache jusqu'à expiration)
 *   POST {base}/collection/v1_0/requesttopay           → 202 : le client reçoit la demande sur son téléphone
 *   GET  {base}/collection/v1_0/requesttopay/{id}      → statut réel (seule source de vérité)
 *
 * Le statut n'est JAMAIS déduit d'un retour navigateur : il vient toujours de MTN.
 */

export type StatutMtn = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export type StatutPaiement = {
  statut: StatutMtn;
  montant: string | null;
  devise: string | null;
  financialTransactionId: string | null;
  raison: string | null;
};

export type DemandePaiement = {
  referenceId: string;
  montant: string;
  devise: string;
  telephone: string;
  externalId: string;
  messagePayer?: string;
  notePayee?: string;
};

export interface ClientMomo {
  demarrerPaiement(demande: DemandePaiement): Promise<void>;
  statut(referenceId: string): Promise<StatutPaiement>;
}

export type ConfigClient = {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  /** « sandbox » ou « mtncongo » : en-tête X-Target-Environment. */
  environnement: string;
  callbackUrl?: string | null;
};

export class ErreurMomo extends Error {
  // Champs explicites plutôt que propriétés de paramètre : Node exécute le TypeScript en mode
  // « strip-only », qui refuse `constructor(readonly x: T)`.
  readonly statutHttp?: number;
  readonly corps?: string;

  constructor(message: string, statutHttp?: number, corps?: string) {
    super(message);
    this.statutHttp = statutHttp;
    this.corps = corps;
  }
}

type ReponseToken = { access_token?: string; expires_in?: number | string };

export type OptionsClient = {
  fetch?: typeof globalThis.fetch;
  maintenant?: () => number;
};

export function creerClientMomo(cfg: ConfigClient, opts: OptionsClient = {}): ClientMomo {
  const appeler = opts.fetch ?? globalThis.fetch;
  const maintenant = opts.maintenant ?? (() => Date.now());

  // Le jeton est valable ~1 h ; on le renouvelle une minute avant l'échéance.
  let cache: { token: string; expireLe: number } | null = null;
  let enCours: Promise<string> | null = null;

  async function token(): Promise<string> {
    if (cache && cache.expireLe > maintenant()) return cache.token;
    if (enCours) return enCours;

    enCours = (async () => {
      const identifiants = Buffer.from(`${cfg.apiUser}:${cfg.apiKey}`).toString('base64');
      const reponse = await appeler(`${cfg.baseUrl}/collection/token/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${identifiants}`,
          'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
        },
      });
      if (!reponse.ok) {
        throw new ErreurMomo(
          `MTN a refusé la demande de jeton (${reponse.status}). Vérifiez l'API USER, l'API KEY et la clé d'abonnement.`,
          reponse.status,
          await texte(reponse),
        );
      }
      const data = (await reponse.json()) as ReponseToken;
      if (!data.access_token) throw new ErreurMomo('Réponse de jeton sans access_token.');
      const duree = Number(data.expires_in ?? 3600);
      cache = { token: data.access_token, expireLe: maintenant() + Math.max(30, duree - 60) * 1000 };
      return cache.token;
    })();

    try {
      return await enCours;
    } finally {
      enCours = null;
    }
  }

  function entetes(jeton: string, extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${jeton}`,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
      'X-Target-Environment': cfg.environnement,
      ...extra,
    };
  }

  return {
    async demarrerPaiement(demande) {
      const jeton = await token();
      const corps = {
        amount: demande.montant,
        currency: demande.devise,
        externalId: demande.externalId,
        payer: { partyIdType: 'MSISDN', partyId: demande.telephone },
        payerMessage: demande.messagePayer ?? 'Commande Elembo',
        payeeNote: demande.notePayee ?? 'T-shirt personnalise',
      };
      const extra: Record<string, string> = {
        'X-Reference-Id': demande.referenceId,
        'Content-Type': 'application/json',
      };
      if (cfg.callbackUrl) extra['X-Callback-Url'] = cfg.callbackUrl;

      const reponse = await appeler(`${cfg.baseUrl}/collection/v1_0/requesttopay`, {
        method: 'POST',
        headers: entetes(jeton, extra),
        body: JSON.stringify(corps),
      });
      // MTN répond 202 : la demande est acceptée, pas encore payée.
      if (reponse.status !== 202) {
        throw new ErreurMomo(
          `MTN a refusé la demande de paiement (${reponse.status}).`,
          reponse.status,
          await texte(reponse),
        );
      }
    },

    async statut(referenceId) {
      const jeton = await token();
      const reponse = await appeler(`${cfg.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
        method: 'GET',
        headers: entetes(jeton),
      });
      if (reponse.status === 404) throw new ErreurMomo('Référence de transaction inconnue chez MTN.', 404);
      if (!reponse.ok) {
        throw new ErreurMomo(`MTN n'a pas pu donner le statut (${reponse.status}).`, reponse.status, await texte(reponse));
      }
      const data = (await reponse.json()) as Record<string, unknown>;
      const brut = String(data.status ?? '').toUpperCase();
      const statut: StatutMtn = brut === 'SUCCESSFUL' ? 'SUCCESSFUL' : brut === 'FAILED' ? 'FAILED' : 'PENDING';
      return {
        statut,
        montant: data.amount != null ? String(data.amount) : null,
        devise: data.currency != null ? String(data.currency) : null,
        financialTransactionId: data.financialTransactionId != null ? String(data.financialTransactionId) : null,
        raison: data.reason != null ? String(data.reason) : null,
      };
    },
  };
}

async function texte(reponse: Response): Promise<string> {
  try {
    return (await reponse.text()).slice(0, 500);
  } catch {
    return '';
  }
}

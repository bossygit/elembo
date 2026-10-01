// Client du service de paiement MoMo (momo-service/).
//
// Le navigateur ne calcule AUCUN montant : il envoie ce que le client a choisi (produit, tailles,
// quantités, ville, téléphone) et le service recalcule. Puis on SONDE le statut — le callback de
// MTN n'est jamais la source de vérité (il est envoyé une seule fois, sans réessai).
//
// Le service tourne ailleurs que dans l'application (voir momo-service/README.md). Son adresse
// vient de NEXT_PUBLIC_MOMO_API_URL ; à défaut, l'adresse de développement local.

export type EtatPaiement = 'PENDING' | 'PAYE' | 'ECHEC' | 'ANOMALIE';

export type Paiement = {
  referenceId: string;
  commande?: string;
  statut: EtatPaiement;
  montantFcfa: number;
  devise: string;
  financialTransactionId?: string | null;
  raison?: string | null;
};

export type DemandePaiement = {
  commande: string;
  produitId: string;
  lignes: { taille: string; quantite: number }[];
  villeId: string;
  telephone: string;
};

export class ErreurPaiement extends Error {
  constructor(
    message: string,
    readonly statutHttp?: number,
  ) {
    super(message);
  }
}

export function urlService(): string {
  const configuree = (process.env.NEXT_PUBLIC_MOMO_API_URL ?? '').trim();
  return (configuree || 'http://localhost:8787').replace(/\/+$/, '');
}

async function lireJson(reponse: Response): Promise<Record<string, unknown>> {
  try {
    return (await reponse.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function messageErreur(corps: Record<string, unknown>, statut: number, defaut: string): string {
  const detail = corps.erreur ?? corps.detail ?? corps.message;
  return typeof detail === 'string' && detail.trim() ? detail : `${defaut} (HTTP ${statut})`;
}

/** Envoie la commande au service : le service recalcule le montant et demande le paiement à MTN. */
export async function demanderPaiement(
  demande: DemandePaiement,
  fetchImpl: typeof fetch = fetch,
): Promise<Paiement> {
  let reponse: Response;
  try {
    reponse = await fetchImpl(`${urlService()}/api/momo/payer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    });
  } catch {
    throw new ErreurPaiement(
      "Le service de paiement est injoignable. Vérifiez qu'il tourne (momo-service) et que son adresse est correcte.",
    );
  }

  const corps = await lireJson(reponse);
  if (!reponse.ok) {
    throw new ErreurPaiement(
      messageErreur(corps, reponse.status, 'Le paiement n’a pas pu être demandé'),
      reponse.status,
    );
  }
  return {
    referenceId: String(corps.referenceId ?? ''),
    statut: 'PENDING',
    montantFcfa: Number(corps.montantFcfa ?? 0),
    devise: String(corps.devise ?? 'XAF'),
  };
}

/** Lit l'état d'un paiement. */
export async function lireStatut(referenceId: string, fetchImpl: typeof fetch = fetch): Promise<Paiement> {
  let reponse: Response;
  try {
    reponse = await fetchImpl(
      `${urlService()}/api/momo/statut?referenceId=${encodeURIComponent(referenceId)}`,
    );
  } catch {
    throw new ErreurPaiement('Le service de paiement est injoignable pendant le suivi.');
  }
  const corps = await lireJson(reponse);
  if (!reponse.ok) {
    throw new ErreurPaiement(messageErreur(corps, reponse.status, 'Statut illisible'), reponse.status);
  }
  return {
    referenceId,
    commande: typeof corps.commande === 'string' ? corps.commande : undefined,
    statut: (corps.statut as EtatPaiement) ?? 'PENDING',
    montantFcfa: Number(corps.montantFcfa ?? 0),
    devise: String(corps.devise ?? 'XAF'),
    financialTransactionId: (corps.financialTransactionId as string | null) ?? null,
    raison: (corps.raison as string | null) ?? null,
  };
}

export type OptionsSondage = {
  /** Délai entre deux interrogations (il s'allonge jusqu'au plafond — MTN recommande un backoff). */
  intervalleMs?: number;
  intervalleMaxMs?: number;
  /** Durée maximale de suivi. MTN abandonne une demande non validée au bout de 5 minutes. */
  delaiMaxMs?: number;
  fetchImpl?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  onEtat?: (paiement: Paiement) => void;
  signal?: AbortSignal;
};

export type ResultatSondage = { paiement: Paiement; expire: boolean };

/** Sonde le statut jusqu'à un état définitif ou la fin du délai de suivi. */
export async function suivrePaiement(
  referenceId: string,
  options: OptionsSondage = {},
): Promise<ResultatSondage> {
  const intervalleInitial = options.intervalleMs ?? 3000;
  const intervalleMax = options.intervalleMaxMs ?? 10000;
  const delaiMax = options.delaiMaxMs ?? 5 * 60 * 1000;
  const dormir = options.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fetchImpl = options.fetchImpl ?? fetch;

  const debut = Date.now();
  let intervalle = intervalleInitial;
  let attendu = 0;
  let dernier: Paiement = { referenceId, statut: 'PENDING', montantFcfa: 0, devise: 'XAF' };

  for (;;) {
    if (options.signal?.aborted) return { paiement: dernier, expire: false };
    dernier = await lireStatut(referenceId, fetchImpl);
    options.onEtat?.(dernier);
    if (dernier.statut !== 'PENDING') return { paiement: dernier, expire: false };
    // On compte le temps d'attente cumulé : un dépassement se mesure en durée de suivi, pas en
    // horloge murale (et le comportement reste déterministe en test).
    if (attendu + intervalle > delaiMax || Date.now() - debut + intervalle > delaiMax) {
      return { paiement: dernier, expire: true };
    }
    await dormir(intervalle);
    attendu += intervalle;
    intervalle = Math.min(Math.round(intervalle * 1.5), intervalleMax);
  }
}

/** Numéro congolais plausible (le service refait la validation, complet, de son côté). */
export function telephonePlausible(brut: string): boolean {
  const chiffres = String(brut ?? '').replace(/[^\d]/g, '');
  if (/^46733\d{6}$/.test(chiffres)) return true; // numéros de test du sandbox MTN
  return /^(00)?2420[456]\d{7}$/.test(chiffres) || /^0[456]\d{7}$/.test(chiffres);
}

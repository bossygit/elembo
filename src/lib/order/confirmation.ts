// Récapitulatif d'une commande payée, conservé sur l'appareil du client pour la page de
// confirmation (/commande/confirmation).
//
// Pourquoi côté navigateur : le serveur ne garde pas le détail visuel de la commande (couleur,
// faces personnalisées, état de l'envoi à l'atelier) sous une forme que le client peut relire sans
// compte. Ce récapitulatif n'est donc qu'un AFFICHAGE : la page de confirmation ne l'affiche
// qu'après avoir fait confirmer le paiement par le serveur (`/api/momo/statut`), et ne prend jamais
// ce qui est stocké ici pour une preuve de paiement.
//
// Module volontairement sans dépendance lourde (ni catalogue, ni canvas) : il est chargé par la
// page de confirmation, qui doit rester légère.

export type LigneRecap = { taille: string; quantite: number };

export type RecapCommande = {
  version: 1;
  /** Référence de commande lisible (ELB-AAAAMMJJ-HHMM-XX). */
  commande: string;
  /** Référence MTN de la demande de paiement (UUID). */
  referenceId: string;
  /** Instant où le paiement a été constaté côté navigateur (ISO 8601). */
  payeLe: string;
  produit: { id: string; nom: string; couleur: string; couleurHex: string };
  lignes: LigneRecap[];
  quantite: number;
  prixUnitaireFcfa: number;
  sousTotalFcfa: number;
  livraison: { ville: string; fraisFcfa: number; delaiJours: number };
  totalFcfa: number;
  financialTransactionId: string | null;
  client: { nom: string | null; telephoneMasque: string };
  /** Libellés des faces personnalisées (« Face avant », « Face arrière »). */
  faces: string[];
  /** Résultat de l'envoi du dossier de production à l'atelier. */
  atelier: { envoye: boolean; fichiers: number; notifie: boolean; motif: string | null };
};

const PREFIXE_CLE = 'elembo:commande:';

/** Référence plausible : sert de clé de stockage et de paramètre d'URL, jamais d'autorisation. */
export function referencePlausible(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && /^[A-Za-z0-9-]{6,64}$/.test(valeur);
}

/** `06 123 45 67` → `06 ••• ••• 67` : on rappelle le numéro sans l'étaler à l'écran. */
export function masquerTelephone(brut: string): string {
  let chiffres = String(brut ?? '').replace(/\D/g, '');
  if (chiffres.startsWith('00242')) chiffres = chiffres.slice(5);
  else if (chiffres.startsWith('242') && chiffres.length > 9) chiffres = chiffres.slice(3);
  if (chiffres.length < 4) return '••••';
  return `${chiffres.slice(0, 2)} ••• ••• ${chiffres.slice(-2)}`;
}

/** Lien de la page de confirmation d'une commande payée. */
export function lienConfirmation(commande: string, referenceId: string): string {
  const q = new URLSearchParams({ ref: commande, paiement: referenceId });
  return `/commande/confirmation?${q.toString()}`;
}

export type EntreeRecap = {
  commande: string;
  referenceId: string;
  produit: { id: string; nom: string; couleur: string; couleurHex: string };
  lignes: LigneRecap[];
  prixUnitaireFcfa: number;
  sousTotalFcfa: number;
  livraison: { ville: string; fraisFcfa: number; delaiJours: number };
  totalFcfa: number;
  financialTransactionId?: string | null;
  nom?: string;
  telephone: string;
  faces: string[];
  atelier: { envoye: boolean; fichiers: number; notifie?: boolean; motif?: string };
  maintenant?: Date;
};

export function construireRecap(entree: EntreeRecap): RecapCommande {
  const lignes = entree.lignes
    .filter((l) => l.quantite > 0)
    .map((l) => ({ taille: l.taille, quantite: Math.floor(l.quantite) }));
  return {
    version: 1,
    commande: entree.commande,
    referenceId: entree.referenceId,
    payeLe: (entree.maintenant ?? new Date()).toISOString(),
    produit: entree.produit,
    lignes,
    quantite: lignes.reduce((total, l) => total + l.quantite, 0),
    prixUnitaireFcfa: entree.prixUnitaireFcfa,
    sousTotalFcfa: entree.sousTotalFcfa,
    livraison: entree.livraison,
    totalFcfa: entree.totalFcfa,
    financialTransactionId: entree.financialTransactionId ?? null,
    client: { nom: entree.nom?.trim() || null, telephoneMasque: masquerTelephone(entree.telephone) },
    faces: entree.faces,
    atelier: {
      envoye: entree.atelier.envoye,
      fichiers: entree.atelier.fichiers,
      notifie: Boolean(entree.atelier.notifie),
      motif: entree.atelier.motif ?? null,
    },
  };
}

type Stockage = Pick<Storage, 'getItem' | 'setItem'>;

/** `localStorage` quand il est utilisable (navigation privée, quota ou SSR : `null`, sans jeter). */
function stockageNavigateur(): Stockage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Conserve le récapitulatif. Renvoie `false` si le navigateur refuse : la page s'adapte. */
export function enregistrerRecap(recap: RecapCommande, stockage: Stockage | null = stockageNavigateur()): boolean {
  if (!stockage || !referencePlausible(recap.commande)) return false;
  try {
    stockage.setItem(`${PREFIXE_CLE}${recap.commande}`, JSON.stringify(recap));
    return true;
  } catch {
    return false;
  }
}

function nombre(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function chaine(v: unknown): v is string {
  return typeof v === 'string';
}

/** Relit un récapitulatif ; toute donnée altérée ou d'une autre commande est ignorée. */
export function lireRecap(
  commande: string,
  referenceId: string,
  stockage: Stockage | null = stockageNavigateur(),
): RecapCommande | null {
  if (!stockage || !referencePlausible(commande)) return null;
  let brut: unknown;
  try {
    const texte = stockage.getItem(`${PREFIXE_CLE}${commande}`);
    if (!texte) return null;
    brut = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!brut || typeof brut !== 'object') return null;
  const r = brut as Partial<RecapCommande>;

  const valide =
    r.version === 1 &&
    r.commande === commande &&
    r.referenceId === referenceId &&
    chaine(r.payeLe) &&
    Boolean(r.produit && chaine(r.produit.nom) && chaine(r.produit.couleur) && chaine(r.produit.couleurHex)) &&
    Array.isArray(r.lignes) &&
    r.lignes.every((l) => l && chaine(l.taille) && nombre(l.quantite)) &&
    nombre(r.quantite) &&
    nombre(r.prixUnitaireFcfa) &&
    nombre(r.sousTotalFcfa) &&
    Boolean(
      r.livraison &&
        chaine(r.livraison.ville) &&
        nombre(r.livraison.fraisFcfa) &&
        nombre(r.livraison.delaiJours),
    ) &&
    nombre(r.totalFcfa) &&
    Boolean(r.client && chaine(r.client.telephoneMasque)) &&
    Array.isArray(r.faces) &&
    r.faces.every(chaine) &&
    Boolean(r.atelier && typeof r.atelier.envoye === 'boolean' && nombre(r.atelier.fichiers));

  return valide ? (brut as RecapCommande) : null;
}

/** Formatage FCFA identique à celui du tunnel (séparateur de milliers insécable remplacé). */
export function formaterFcfa(montant: number): string {
  return `${montant.toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`;
}

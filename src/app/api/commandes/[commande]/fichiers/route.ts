import { telechargerFichier } from '@/server/dossiers/archive';
import { normaliserFichiers, recapDossier, verifierDepot } from '@/server/dossiers/dossier';
import { envoyerNotification, telegramConfigure } from '@/server/dossiers/telegram';
import { journal } from '@/server/momo/instance';

// Enregistrement du dossier APRÈS l'envoi des fichiers vers l'archive (voir `/upload`).
// Le corps ne contient que des métadonnées : quelques kilo-octets, jamais les images.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Contexte = { params: Promise<{ commande: string }> };

function tokenAtelier(demande: Request): string {
  const attendu = (process.env.ATELIER_TOKEN ?? '').trim();
  if (!attendu) return '';
  const entete = demande.headers.get('x-atelier-token') ?? '';
  const query = new URL(demande.url).searchParams.get('token') ?? '';
  return entete === attendu || query === attendu ? attendu : '';
}

/** Liste des dossiers reçus pour une commande — réservé à l'atelier (ATELIER_TOKEN). */
export async function GET(demande: Request, contexte: Contexte) {
  const { commande } = await contexte.params;
  if (!tokenAtelier(demande)) {
    return Response.json({ erreur: 'Accès atelier requis.' }, { status: 401 });
  }
  const store = await journal();
  const toutes = await store.toutes();
  const commandes = toutes.filter((t) => t.commande === commande);
  return Response.json({
    commande,
    transactions: commandes.map((t) => ({
      referenceId: t.referenceId,
      statut: t.statut,
      montantFcfa: t.montantFcfa,
      detail: t.detail ?? null,
      dossierLe: t.dossierLe ?? null,
      fichiers: (t.fichiers ?? []).map((f) => ({
        nom: f.nom,
        taille: f.taille,
        type: f.type,
        url: `/api/commandes/${encodeURIComponent(commande)}/fichiers/${encodeURIComponent(f.nom)}`,
      })),
    })),
  });
}

export async function POST(demande: Request, contexte: Contexte) {
  const { commande } = await contexte.params;
  const corps = (await demande.json().catch(() => ({}))) as {
    referenceId?: string;
    fichiers?: unknown;
  };

  const referenceId = String(corps.referenceId ?? '').trim();
  if (!referenceId) {
    return Response.json({ erreur: 'Référence de paiement manquante.' }, { status: 422 });
  }

  const store = await journal();
  const transaction = await store.parReferenceId(referenceId);

  const verdict = verifierDepot({ transaction, commande, fichiers: corps.fichiers });
  if (!verdict.ok) return Response.json({ erreur: verdict.motif }, { status: verdict.statut });

  // Idempotence : un dépôt rejoué (réseau, double clic, retour arrière) ne duplique ni fichier
  // ni notification. Le premier dossier reçu fait foi.
  if (transaction?.fichiers?.length) {
    return Response.json({
      enregistre: true,
      dejaRecu: true,
      fichiers: transaction.fichiers,
      dossierLe: transaction.dossierLe ?? null,
    });
  }

  const fichiers = normaliserFichiers(corps.fichiers);
  const le = new Date().toISOString();
  const maj = await store.maj(
    referenceId,
    { fichiers, dossierLe: le },
    { le, quoi: 'dossier de production recu', detail: `${fichiers.length} fichier(s)` },
  );

  // Notification : un échec ici ne remet pas en cause la commande déjà payée et déjà archivée.
  let notifie = false;
  let motif: string | undefined;
  if (telegramConfigure()) {
    const documents = [];
    for (const f of fichiers) {
      const archive = await telechargerFichier(f.chemin);
      if (archive) documents.push({ nom: f.nom, contenu: archive.contenu, type: archive.type });
    }
    const resultat = await envoyerNotification(recapDossier(maj, fichiers), documents);
    notifie = resultat.envoye;
    motif = resultat.motif;
  } else {
    motif = 'Telegram non configuré : dossier archivé, atelier non prévenu.';
  }

  return Response.json(
    {
      enregistre: true,
      dejaRecu: false,
      dossierLe: le,
      notifie,
      motif,
      fichiers,
    },
    { status: 201 },
  );
}

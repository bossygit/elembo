import { telechargerFichier } from '@/server/dossiers/archive';
import { journal } from '@/server/momo/instance';
import { referenceValide } from '@/server/momo/reference';
import { atelierAutorise } from '@/server/security/token';

// Téléchargement d'un fichier de dossier par l'atelier. L'archive est privée : l'URL Vercel Blob
// n'est jamais exposée au navigateur, tout passe par cette route protégée.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Contexte = { params: Promise<{ commande: string; nom: string }> };

export async function GET(demande: Request, contexte: Contexte) {
  const { commande, nom } = await contexte.params;

  if (!atelierAutorise(demande)) {
    return Response.json({ erreur: 'Accès atelier requis.' }, { status: 401 });
  }
  if (!referenceValide(commande)) {
    return Response.json({ erreur: 'Référence de commande invalide.' }, { status: 400 });
  }

  let nomDecode: string;
  try {
    nomDecode = decodeURIComponent(nom);
  } catch {
    return Response.json({ erreur: 'Nom de fichier illisible.' }, { status: 400 });
  }
  if (!nomDecode || nomDecode.includes('/') || nomDecode.includes('..') || /[\r\n]/.test(nomDecode)) {
    return Response.json({ erreur: 'Nom de fichier invalide.' }, { status: 400 });
  }

  const store = await journal();
  const transactions = await store.toutes();
  const fichier = transactions
    .filter((t) => t.commande === commande)
    .flatMap((t) => t.fichiers ?? [])
    .find((f) => f.nom === nomDecode);

  if (!fichier) {
    return Response.json({ erreur: 'Fichier inconnu pour cette commande.' }, { status: 404 });
  }

  const archive = await telechargerFichier(fichier.chemin);
  if (!archive) {
    return Response.json({ erreur: 'Fichier absent de l’archive.' }, { status: 404 });
  }

  return new Response(archive.contenu, {
    status: 200,
    headers: {
      'Content-Type': archive.type,
      'Content-Length': String(archive.taille),
      'Content-Disposition': `attachment; filename="${fichier.nom.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

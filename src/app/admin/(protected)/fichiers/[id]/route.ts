import { estUuid } from '@/lib/admin/format';
import { verifierAccesRoute } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { fichierCommande, nomTelechargement, preparerTelechargement } from '@/server/admin/fichiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Téléchargement d'un fichier du dossier de production. Réservé à `production.fichiers`
 * (administrateur, atelier). Chaque téléchargement est tracé sur la commande. Le navigateur
 * est redirigé vers une URL signée valable 60 s ; aucune URL permanente n'est exposée.
 */
export async function GET(_request: Request, contexte: { params: Promise<{ id: string }> }) {
  const acces = await verifierAccesRoute('production.fichiers');
  if (!acces.ok) return acces.reponse;

  const { id } = await contexte.params;
  if (!estUuid(id)) return Response.json({ erreur: 'Fichier invalide.' }, { status: 400 });

  const fichier = await fichierCommande(id);
  if (!fichier) return Response.json({ erreur: 'Fichier introuvable.' }, { status: 404 });

  const livraison = await preparerTelechargement(fichier);
  if (livraison.type === 'indisponible') {
    return Response.json({ erreur: livraison.raison }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }

  await journaliser({
    staff: acces.staff,
    action: 'FICHIER_TELECHARGE',
    entite: 'commande',
    entiteId: fichier.commande_id,
    apres: { fichier: fichier.nom, type: fichier.type_fichier },
  });

  if (livraison.type === 'redirection') {
    return new Response(null, {
      status: 303,
      headers: { Location: livraison.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  }
  return new Response(livraison.contenu, {
    headers: {
      'Content-Type': livraison.typeMime,
      'Content-Disposition': `attachment; filename="${nomTelechargement(fichier.nom)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

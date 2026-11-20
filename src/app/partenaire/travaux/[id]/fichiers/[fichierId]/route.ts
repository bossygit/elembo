import { estUuid } from '@/lib/admin/format';
import { fichierCommande, nomTelechargement, preparerTelechargement } from '@/server/admin/fichiers';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { journaliserTelechargement, monAffectation } from '@/server/partenaires/travaux';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Téléchargement d'un fichier partagé avec l'atelier. Réservé au portail : le fichier doit être
 * listé dans `mon_affectation()`, donc rattaché à une affectation de son entreprise. URL signée
 * 60 s ; le téléchargement est audité.
 */
export async function GET(_request: Request, contexte: { params: Promise<{ id: string; fichierId: string }> }) {
  const session = await exigerPartenaire('travaux.voir');
  const { id, fichierId } = await contexte.params;
  if (!estUuid(id) || !estUuid(fichierId)) {
    return Response.json({ erreur: 'Fichier invalide.' }, { status: 400 });
  }

  const affectation = await monAffectation(id);
  const accessible = affectation && ['PROPOSEE', 'ACCEPTEE', 'TERMINEE'].includes(affectation.statut);
  const lien = accessible ? affectation.fichiers.find((f) => f.fichier_id === fichierId) : undefined;
  if (!lien) return Response.json({ erreur: 'Fichier introuvable.' }, { status: 404 });

  const fichier = await fichierCommande(fichierId);
  if (!fichier || !fichier.verifie) {
    return Response.json({ erreur: 'Fichier indisponible.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }

  const livraison = await preparerTelechargement(fichier);
  if (livraison.type === 'indisponible') {
    return Response.json({ erreur: livraison.raison }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }

  await journaliserTelechargement(session, id, fichierId, fichier.nom);

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

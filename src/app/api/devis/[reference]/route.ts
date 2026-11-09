import { devisDepuisSession } from '@/server/devis/session';
import { devisParId, fichiersDuDevis } from '@/server/devis/repository';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ reference: string }> };

export async function GET(request: Request, contexte: Contexte) {
  const { reference } = await contexte.params;
  const devisId = await devisDepuisSession(request, reference);
  if (!devisId) return jsonErreur('Devis introuvable.', 404);

  const devis = await devisParId(devisId);
  if (!devis || devis.reference !== reference) return jsonErreur('Devis introuvable.', 404);
  const fichiers = await fichiersDuDevis(devisId);

  return Response.json(
    {
      reference: devis.reference,
      statut: devis.statut,
      famille: devis.famille,
      besoin: devis.besoin,
      format: devis.format,
      specifications: devis.specifications,
      quantite: devis.quantite,
      montantProposeFcfa: devis.montant_propose_fcfa,
      creeLe: devis.cree_le,
      expireLe: devis.expire_le,
      fichiers: fichiers.map((f) => ({
        id: f.id,
        nom: f.nom,
        typeMime: f.type_mime,
        tailleOctets: f.taille_octets,
        verifie: f.verifie,
        statutAnalyse: f.statut_analyse,
        telechargementDisponible: f.verifie && f.statut_analyse === 'PROPRE',
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

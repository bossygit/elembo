import { garderRoles } from '@/server/auth/api';
import { transitionnerDevis } from '@/server/devis/repository';
import { lireJson } from '@/server/devis/http';
import { jsonErreur } from '@/server/security/http';
import type { StatutDevis } from '@/lib/devis/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ id: string }> };

const STATUTS: StatutDevis[] = ['EN_ANALYSE', 'PROPOSE', 'ACCEPTE', 'REFUSE', 'EXPIRE'];

export async function PATCH(request: Request, contexte: Contexte) {
  const garde = await garderRoles(request, ['admin', 'commercial']);
  if (!garde.ok) return garde.reponse;

  const { id } = await contexte.params;
  let corps: { statut?: unknown; montant?: unknown; note?: unknown };
  try {
    corps = (await lireJson(request)) as { statut?: unknown; montant?: unknown; note?: unknown };
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }

  const statut = typeof corps.statut === 'string' ? (corps.statut as StatutDevis) : null;
  if (!statut || !STATUTS.includes(statut)) return jsonErreur('Statut invalide.', 422);

  const montant =
    corps.montant === undefined || corps.montant === null || corps.montant === ''
      ? null
      : Number(corps.montant);
  if (montant !== null && (!Number.isSafeInteger(montant) || montant < 0)) {
    return jsonErreur('Montant invalide.', 422);
  }
  const note = typeof corps.note === 'string' ? corps.note.trim().slice(0, 2000) : null;

  try {
    const devis = await transitionnerDevis(id, statut, montant, note, garde.claims.sub ?? null, 'STAFF');
    return Response.json({ devis }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (erreur) {
    if (erreur instanceof Error && /Transition|prix|valide/i.test(erreur.message)) {
      return jsonErreur(erreur.message, 409);
    }
    return jsonErreur('Transition indisponible.', 503);
  }
}

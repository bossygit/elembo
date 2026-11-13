import { validerDemandeDevis } from '@/lib/devis/validation';
import { creerDevisAtomique } from '@/server/devis/repository';
import { traiterCreationDevis } from '@/server/devis/creation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return traiterCreationDevis(request, (corps) => {
    const validation = validerDemandeDevis(corps);
    if (!validation.ok) return { ok: false, erreurs: validation.erreurs };
    const demande = validation.valeur;
    return { ok: true, demande, creer: (options) => creerDevisAtomique(demande, options) };
  });
}

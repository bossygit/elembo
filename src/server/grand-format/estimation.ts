import { supportParId } from '@/lib/grand-format/catalogue';
import { estimer, type Estimation, type ParametresEstimation } from '@/lib/grand-format/estimation';
import { tarifValide } from '@/server/grand-format/repository';

function supabaseServeurConfigure(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * Estimation calculée côté serveur, depuis la grille VALIDÉE en base. Une base indisponible ou
 * non configurée ne produit jamais de prix : la demande passe simplement en devis.
 */
export async function estimationServeur(p: ParametresEstimation): Promise<Estimation> {
  const finitionsApplicables = supportParId(p.support)?.finitionsApplicables ?? false;
  // Les cas « sur devis » qui ne dépendent pas de la grille sont tranchés sans lecture en base.
  const prealable = estimer(null, p, { finitionsApplicables });
  if (!prealable.disponible && prealable.raison !== 'TARIF_NON_VALIDE') return prealable;
  if (!supabaseServeurConfigure()) return prealable;
  try {
    return estimer(await tarifValide(p.support), p, { finitionsApplicables });
  } catch (erreur) {
    console.error('grand_format_estimation_echec', erreur instanceof Error ? erreur.message : erreur);
    return prealable;
  }
}

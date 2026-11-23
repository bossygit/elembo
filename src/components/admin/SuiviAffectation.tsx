import Link from 'next/link';

import { dateCourte, dateHeure } from '@/lib/admin/format';
import type { AffectationCourte } from '@/server/admin/affectations';

/**
 * État de la dernière affectation d'un travail (tâche ou banderole), affiché au staff dans le
 * dossier de production et sur la fiche banderole. Une affectation refusée, expirée, annulée ou
 * terminée reste visible avec son motif : sans cela, le formulaire de proposition réapparaît sans
 * que le staff sache ce que l'atelier a répondu.
 */
export function SuiviAffectation({
  affectation,
  consigneFin,
  cloture = false,
}: {
  affectation: AffectationCourte;
  /** Ce que le staff doit faire après une fin signalée (dépend du travail). */
  consigneFin: string;
  /** Le travail est déjà clôturé par le staff : une fin signalée n'appelle plus d'action. */
  cloture?: boolean;
}) {
  const a = affectation;
  const atelier = a.partenaire?.nom ?? 'l’atelier';
  let etat: string;
  let motif: string | null = null;
  let attention = false;

  switch (a.statut) {
    case 'PROPOSEE':
      etat = `en attente de réponse de ${atelier} · réponse avant le ${dateHeure(a.date_limite_reponse)}`;
      break;
    case 'ACCEPTEE':
      etat = `acceptée par ${atelier}${a.acceptee_le ? ` le ${dateCourte(a.acceptee_le)}` : ''}`;
      break;
    case 'TERMINEE':
      etat = `fin signalée par ${atelier}${a.terminee_le ? ` le ${dateCourte(a.terminee_le)}` : ''} — ${consigneFin}`;
      attention = !cloture;
      break;
    case 'REFUSEE':
      etat = `refusée par ${atelier}${a.refusee_le ? ` le ${dateCourte(a.refusee_le)}` : ''}`;
      motif = a.motif_refus;
      attention = true;
      break;
    case 'EXPIREE':
      etat = `expirée sans réponse de ${atelier}${a.expiree_le ? ` le ${dateCourte(a.expiree_le)}` : ''}`;
      attention = true;
      break;
    case 'ANNULEE':
      etat = `annulée${a.annulee_le ? ` le ${dateCourte(a.annulee_le)}` : ''} (${atelier})`;
      motif = a.motif_annulation;
      break;
    default:
      etat = a.statut;
  }

  return (
    <div
      className={`mt-2 rounded-md px-2.5 py-2 text-xs ${attention ? 'bg-orange-50 text-orange-900' : 'text-neutral-600'}`}
    >
      <p>
        Affectation <span className="tabular-nums">{a.reference}</span> · {etat} ·{' '}
        <Link href="/admin/affectations" className="underline underline-offset-2">
          suivre
        </Link>
      </p>
      {motif ? <p className="mt-1 whitespace-pre-wrap">Motif : {motif}</p> : null}
    </div>
  );
}

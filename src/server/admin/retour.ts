/**
 * Retour d'une action serveur du back-office : redirection vers la page avec un message.
 * `unstable_rethrow` laisse passer les interruptions internes de Next (redirect, notFound)
 * qu'un `catch` générique transformerait sinon en faux message d'erreur.
 */

import { redirect, unstable_rethrow } from 'next/navigation';

function avecParametre(chemin: string, cle: string, valeur: string): string {
  const [base, ancre] = chemin.split('#');
  const separateur = base.includes('?') ? '&' : '?';
  return `${base}${separateur}${cle}=${encodeURIComponent(valeur)}${ancre ? `#${ancre}` : ''}`;
}

export function echec(chemin: string, erreur: unknown): never {
  unstable_rethrow(erreur);
  const message =
    typeof erreur === 'string'
      ? erreur
      : erreur instanceof Error
        ? erreur.message
        : 'Opération refusée.';
  redirect(avecParametre(chemin, 'erreur', message.slice(0, 300)));
}

export function succes(chemin: string, code = 'ok'): never {
  redirect(avecParametre(chemin, 'ok', code));
}

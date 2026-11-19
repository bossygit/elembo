/**
 * État renvoyé par les actions du dossier partenaire à `useActionState`.
 * (Module ordinaire : un fichier « use server » ne peut exporter que des fonctions asynchrones.)
 */

export type EtatDossier = {
  erreur?: string;
  /** Saisie restituée après un refus (valeurs multiples conservées), jamais un secret. */
  valeurs?: Record<string, string[]>;
};

export function valeursDe(formData: FormData): Record<string, string[]> {
  const res: Record<string, string[]> = {};
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur !== 'string' || cle.startsWith('$ACTION')) continue;
    (res[cle] ??= []).push(valeur.slice(0, 4000));
  }
  return res;
}

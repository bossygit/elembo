/**
 * Lecture minimale d'un fichier `.env` — sans dépendance, et sans jamais journaliser une valeur.
 *
 * Pourquoi ne pas se contenter du shell (`set -a; . ./.env`) : une valeur contenant une guillemet
 * non fermée (mot de passe, note libre) fait échouer le sourcing et empêche le service de
 * démarrer, avec un message obscur du type « unmatched " ». Ici, une ligne mal formée est ignorée
 * et le reste des variables est chargé.
 *
 * Les variables déjà présentes dans l'environnement ont la priorité (utile en conteneur/CI).
 */

import { readFileSync } from 'node:fs';

export function chargerFichierEnv(chemin = '.env', env: NodeJS.ProcessEnv = process.env): string[] {
  let contenu: string;
  try {
    contenu = readFileSync(chemin, 'utf8');
  } catch {
    return []; // fichier absent : configuration fournie par l'environnement
  }

  const chargees: string[] = [];
  for (const brute of contenu.split('\n')) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith('#')) continue;
    const egal = ligne.indexOf('=');
    if (egal <= 0) continue;

    const nom = ligne.slice(0, egal).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) continue;

    let valeur = ligne.slice(egal + 1).trim();
    const entouree =
      valeur.length > 1 &&
      ((valeur.startsWith('"') && valeur.endsWith('"')) || (valeur.startsWith("'") && valeur.endsWith("'")));
    if (entouree) valeur = valeur.slice(1, -1);

    if (env[nom] === undefined) {
      env[nom] = valeur;
      chargees.push(nom);
    }
  }
  return chargees;
}

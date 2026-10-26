/**
 * Enveloppe HTTP des routes de paiement : JSON, CORS de transition, erreurs lisibles.
 *
 * Le site et l'API sont désormais sur le même domaine (Vercel) : le CORS ne sert plus qu'aux
 * origines explicitement listées dans APP_ORIGINS (site encore sur GitHub Pages, tests).
 *
 * Règle reprise du service d'origine : une erreur de configuration ou de stockage est renvoyée
 * avec son motif. Un « Erreur interne » sans détail est un bug de diagnostic, pas une sécurité.
 */

import { NextResponse } from 'next/server';

import { ErreurConfig } from './config';
import { gestionnaire } from './instance';
import { entetesCors, type Gestionnaire, type Reponse } from './service';

function origines(): string[] {
  return (process.env.APP_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function cors(origine: string | null): Record<string, string> {
  return entetesCors(origine, origines());
}

export function preflight(demande: Request): Response {
  return new NextResponse(null, { status: 204, headers: cors(demande.headers.get('origin')) });
}

/** Exécute une action du service et la traduit en réponse HTTP. */
export async function executer(
  demande: Request,
  action: (service: Gestionnaire) => Promise<Reponse>,
): Promise<Response> {
  const origine = demande.headers.get('origin');
  try {
    const service = await gestionnaire();
    const resultat = await action(service);
    return NextResponse.json(resultat.corps, {
      status: resultat.statut,
      headers: { 'Cache-Control': 'no-store', ...cors(origine) },
    });
  } catch (erreur) {
    if (erreur instanceof ErreurConfig) {
      return NextResponse.json(
        { erreur: 'Configuration du service incomplète.', detail: erreur.message },
        { status: 500, headers: { 'Cache-Control': 'no-store', ...cors(origine) } },
      );
    }
    return NextResponse.json(
      { erreur: 'Erreur interne.', detail: (erreur as Error)?.message },
      { status: 500, headers: { 'Cache-Control': 'no-store', ...cors(origine) } },
    );
  }
}

/** Corps JSON, tolérant : un corps vide ou invalide ne doit pas jeter avant la validation métier. */
export async function lireJson(demande: Request): Promise<unknown> {
  try {
    return await demande.json();
  } catch {
    return null;
  }
}

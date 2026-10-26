import { executer, lireJson, preflight } from '@/server/momo/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// MTN peut être lent : le défaut (10 s sur Hobby) coupe un requesttopay un peu lent.
export const maxDuration = 30;

/**
 * Variante de callback avec la référence dans le CHEMIN — la forme recommandée par MTN (pas de
 * paramètre de requête). Exemple : /api/momo/callback/<referenceId>.
 */
type Contexte = { params: Promise<{ reference: string[] }> };

async function traiter(demande: Request, contexte: Contexte) {
  const { reference } = await contexte.params;
  const referenceId = reference?.[0] ? decodeURIComponent(reference[0]) : null;
  const corps = await lireJson(demande);
  return executer(demande, (service) => service.callback(corps, referenceId));
}

export async function POST(demande: Request, contexte: Contexte) {
  return traiter(demande, contexte);
}

export async function PUT(demande: Request, contexte: Contexte) {
  return traiter(demande, contexte);
}

export function OPTIONS(demande: Request) {
  return preflight(demande);
}

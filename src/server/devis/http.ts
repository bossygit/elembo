import { jsonErreur, origineAutorisee } from '@/server/security/http';
import { ErreurLimiteIndisponible, limiter } from '@/server/security/rateLimit';

export const MAX_CORPS_JSON = 64 * 1024;

export function verifierOrigine(request: Request): Response | null {
  if (!origineAutorisee(request)) {
    return jsonErreur('Origine refusée.', 403);
  }
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    return jsonErreur('Content-Type application/json requis.', 415);
  }
  return null;
}

export async function lireJson(request: Request): Promise<unknown> {
  const longueur = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(longueur) && longueur > MAX_CORPS_JSON) {
    throw new Error('CORPS_TROP_GRAND');
  }
  const texte = await request.text();
  if (texte.length > MAX_CORPS_JSON) throw new Error('CORPS_TROP_GRAND');
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    throw new Error('JSON_INVALIDE');
  }
}

export async function limiterOuErreur(
  cle: string,
  maximum: number,
  fenetreSecondes: number,
): Promise<Response | null> {
  try {
    const autorise = await limiter(cle, maximum, fenetreSecondes);
    if (!autorise) {
      return jsonErreur('Trop de requêtes. Réessayez plus tard.', 429, {
        'Retry-After': String(fenetreSecondes),
      });
    }
    return null;
  } catch (erreur) {
    if (erreur instanceof ErreurLimiteIndisponible) {
      return jsonErreur('Service temporairement indisponible.', 503);
    }
    return jsonErreur('Service temporairement indisponible.', 503);
  }
}

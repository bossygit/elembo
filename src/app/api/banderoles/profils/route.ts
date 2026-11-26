import { profilPublic } from '@/lib/banner/profils';
import { listerProfils } from '@/server/banner/profils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Profils publics d'impression, pour le Banner Studio. Lecture seule, sans session : rien de
 * confidentiel (ni partenaire, ni notes, ni validateur). Sans base joignable, le Studio garde ses
 * valeurs prudentes intégrées.
 */
export async function GET() {
  try {
    const lignes = await listerProfils({ actifs: true });
    const profils = lignes.filter((l) => l.est_public).map(profilPublic);
    return Response.json({ profils }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } });
  } catch {
    return Response.json({ profils: [] }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

import { garderRoles } from '@/server/auth/api';
import { listerDevis } from '@/server/devis/repository';
import { jsonErreur } from '@/server/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const garde = await garderRoles(request, ['admin', 'commercial', 'finance']);
  if (!garde.ok) return garde.reponse;

  const url = new URL(request.url);
  const statut = url.searchParams.get('statut') ?? undefined;
  const limite = Number(url.searchParams.get('limite') ?? '50');
  try {
    const devis = await listerDevis({
      statut: statut ?? undefined,
      limite: Number.isFinite(limite) ? limite : 50,
    });
    return Response.json({ devis }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonErreur('Liste indisponible.', 503);
  }
}

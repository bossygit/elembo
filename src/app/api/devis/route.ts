import { referenceDevis, creerJetonSuivi } from '@/server/devis/jetons';
import { validerDemandeDevis } from '@/lib/devis/validation';
import { origineAutorisee, ipDepuisRequete, cledepuisValeur, jsonErreur } from '@/server/security/http';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { creerDevisAtomique, ajouterFichierEnAttente } from '@/server/devis/repository';
import { creerUrlEnvoi } from '@/server/storage/supabase';
import { ajouterCookiesSession, creerSession } from '@/server/devis/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const refusOrigine = verifierOrigine(request);
  if (refusOrigine) return refusOrigine;
  if (!origineAutorisee(request)) return jsonErreur('Origine refusée.', 403);

  let corps: unknown;
  try {
    corps = await lireJson(request);
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === 'CORPS_TROP_GRAND') {
      return jsonErreur('Corps de requête trop volumineux.', 413);
    }
    return jsonErreur('Corps JSON invalide.', 400);
  }

  const validation = validerDemandeDevis(corps);
  if (!validation.ok) {
    return Response.json(
      { erreur: 'Demande invalide.', details: validation.erreurs },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const demande = validation.valeur;

  const idempotencyKey =
    (request.headers.get('idempotency-key') ?? '').trim() ||
    (typeof (corps as Record<string, unknown>)?.idempotencyKey === 'string'
      ? String((corps as Record<string, unknown>).idempotencyKey).trim()
      : '');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return jsonErreur('En-tête Idempotency-Key requis (16 à 128 caractères).', 400);
  }

  const ip = ipDepuisRequete(request);
  const limiteIp = await limiterOuErreur(`devis:creation:ip:${cledepuisValeur('ip', ip)}`, 5, 3600);
  if (limiteIp) return limiteIp;
  const identite = demande.email ?? demande.telephoneNormalise;
  const limiteIdentite = await limiterOuErreur(
    `devis:creation:identite:${cledepuisValeur('id', identite)}`,
    3,
    3600,
  );
  if (limiteIdentite) return limiteIdentite;

  const jeton = creerJetonSuivi();
  const expire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const reference = referenceDevis();

  try {
    const creation = await creerDevisAtomique(demande, {
      idempotencyKey,
      reference,
      suiviTokenHash: jeton.hash,
      suiviTokenExpireLe: expire,
    });

    const uploads: {
      fichierId: string;
      nom: string;
      chemin: string;
      signedUrl: string;
      token: string;
    }[] = [];
    if (!creation.dejaExistant) {
      for (const fichier of demande.fichiers) {
        const url = await creerUrlEnvoi(creation.devisId, fichier.nom);
        const ligne = await ajouterFichierEnAttente(creation.devisId, fichier, url.chemin);
        uploads.push({
          fichierId: ligne.id,
          nom: fichier.nom,
          chemin: url.chemin,
          signedUrl: url.signedUrl,
          token: url.token,
        });
      }
    }

    const cookies = await creerSession(creation.devisId);
    const reponse = Response.json(
      {
        reference: creation.reference,
        suiviToken: creation.dejaExistant ? null : jeton.token,
        uploads,
        dejaExistant: creation.dejaExistant,
        csrfToken: cookies.csrf,
      },
      { status: creation.dejaExistant ? 200 : 201 },
    );
    ajouterCookiesSession(reponse, cookies);
    return reponse;
  } catch (erreur) {
    console.error('devis_creation_echec', erreur instanceof Error ? erreur.message : erreur);
    return jsonErreur(
      erreur instanceof Error && erreur.message.includes('duplicate')
        ? 'Demande déjà enregistrée.'
        : 'La demande n’a pas pu être enregistrée.',
      500,
    );
  }
}

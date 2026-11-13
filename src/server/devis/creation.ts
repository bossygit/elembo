import { after } from 'next/server';

import { devisConfigure } from '@/lib/devis/configuration';
import type { DemandeDevis } from '@/lib/devis/types';
import { referenceDevis, creerJetonSuivi } from '@/server/devis/jetons';
import { origineAutorisee, ipDepuisRequete, cledepuisValeur, jsonErreur } from '@/server/security/http';
import { limiterOuErreur, lireJson, verifierOrigine } from '@/server/devis/http';
import { ajouterFichierEnAttente } from '@/server/devis/repository';
import { creerUrlEnvoi } from '@/server/storage/supabase';
import { traiterNotifications } from '@/server/devis/notifications';
import { ajouterCookiesSession, creerSession } from '@/server/devis/session';

/**
 * Création d'une demande de devis depuis une requête publique — cœur partagé par
 * `POST /api/devis` (formulaire général) et `POST /api/banderoles` (offre grand format).
 *
 * Contrôles, dans l'ordre : origine et Content-Type, configuration, taille du corps JSON,
 * validation métier, clé d'idempotence, limitation de débit (IP puis identité), création en
 * base, URL d'envoi signées vers le bucket PRIVÉ `devis`, session de suivi (cookie HttpOnly).
 */

export type OptionsCreation = {
  idempotencyKey: string;
  reference: string;
  suiviTokenHash: string;
  suiviTokenExpireLe: string;
};

export type ResultatCreation = { devisId: string; clientId: string; reference: string; dejaExistant: boolean };

export type Preparation =
  | { ok: true; demande: DemandeDevis; creer: (options: OptionsCreation) => Promise<ResultatCreation> }
  | { ok: false; erreurs: Record<string, string> }
  | { ok: false; reponse: Response };

export async function traiterCreationDevis(
  request: Request,
  preparer: (corps: unknown) => Promise<Preparation> | Preparation,
): Promise<Response> {
  const refusOrigine = verifierOrigine(request);
  if (refusOrigine) return refusOrigine;
  if (!origineAutorisee(request)) return jsonErreur('Origine refusée.', 403);
  if (!devisConfigure) return jsonErreur('Le service de devis n’est pas configuré.', 503);

  let corps: unknown;
  try {
    corps = await lireJson(request);
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === 'CORPS_TROP_GRAND') {
      return jsonErreur('Corps de requête trop volumineux.', 413);
    }
    return jsonErreur('Corps JSON invalide.', 400);
  }

  const preparation = await preparer(corps);
  if (!preparation.ok) {
    if ('reponse' in preparation) return preparation.reponse;
    return Response.json(
      { erreur: 'Demande invalide.', details: preparation.erreurs },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const { demande } = preparation;

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
    const creation = await preparation.creer({
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
    // La tâche planifiée ne passe qu'une fois par jour (plan Hobby) : on traite l'outbox
    // tout de suite après la réponse pour que l'atelier soit prévenu en quelques secondes.
    after(() => traiterNotifications(10).catch(() => undefined));
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

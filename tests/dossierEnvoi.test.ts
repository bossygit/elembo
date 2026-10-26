// Envoi du dossier depuis le navigateur : ce que le client poste réellement, et comment on
// rapporte un échec — sans jamais prétendre que l'atelier a reçu un dossier absent.

import { describe, expect, it } from 'vitest';

import { cheminArchive, envoyerDossier } from '../src/lib/payment/dossier';

const COMMANDE = 'ELB-20261026-1200-AB';
const REF = '11111111-2222-4333-8444-555555555555';

function png(taille = 1024): Blob {
  return new Blob([new Uint8Array(taille)], { type: 'image/png' });
}

describe('chemin d’archive', () => {
  it('reste sous le dossier de la commande', () => {
    expect(cheminArchive(COMMANDE, 'avant.png')).toBe(`dossiers/${COMMANDE}/avant.png`);
  });
});

describe('envoi du dossier', () => {
  it('dépose chaque fichier puis enregistre les métadonnées', async () => {
    const depots: { chemin: string; access?: string; payload?: string }[] = [];
    const uploadImpl = (async (chemin: string, _blob: Blob, options: { access?: string; clientPayload?: string }) => {
      depots.push({ chemin, access: options.access, payload: options.clientPayload });
      return { pathname: chemin, url: `https://blob.exemple/${chemin}` };
    }) as unknown as typeof import('@vercel/blob/client').upload;

    const appels: { url: string; corps: unknown }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      appels.push({ url: String(url), corps: JSON.parse(String(init?.body ?? '{}')) });
      return new Response(JSON.stringify({ enregistre: true, notifie: true, fichiers: [{}, {}] }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const resultat = await envoyerDossier({
      commande: COMMANDE,
      referenceId: REF,
      fichiers: [
        { nom: 'avant.png', blob: png(2048) },
        { nom: 'fiche.txt', blob: new Blob(['fiche'], { type: 'text/plain' }) },
      ],
      uploadImpl,
      fetchImpl,
    });

    expect(resultat).toEqual({ envoye: true, fichiers: 2, notifie: true, motif: undefined });
    expect(depots).toHaveLength(2);
    expect(depots[0]!.chemin).toBe(`dossiers/${COMMANDE}/avant.png`);
    // Archive privée et référence de paiement transmise au serveur, jamais un montant.
    expect(depots[0]!.access).toBe('private');
    expect(JSON.parse(String(depots[0]!.payload))).toEqual({ referenceId: REF });

    expect(appels[0]!.url).toBe(`/api/commandes/${COMMANDE}/fichiers`);
    expect((appels[0]!.corps as { fichiers: { chemin: string; taille: number }[] }).fichiers[0]).toMatchObject({
      nom: 'avant.png',
      chemin: `dossiers/${COMMANDE}/avant.png`,
      taille: 2048,
      type: 'image/png',
    });
  });

  it('rapporte un refus du serveur (commande non payée) sans mentir', async () => {
    const uploadImpl = (async (chemin: string) => ({ pathname: chemin, url: '' })) as unknown as typeof import('@vercel/blob/client').upload;
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ erreur: "La commande n'est pas payée (statut PENDING) : dossier refusé." }), {
        status: 409,
      })) as unknown as typeof fetch;

    const resultat = await envoyerDossier({
      commande: COMMANDE,
      referenceId: REF,
      fichiers: [{ nom: 'avant.png', blob: png() }],
      uploadImpl,
      fetchImpl,
    });

    expect(resultat.envoye).toBe(false);
    expect(resultat.fichiers).toBe(0);
    expect(resultat.motif).toMatch(/pas payée/);
  });

  it('signale un transfert interrompu', async () => {
    const uploadImpl = (async () => {
      throw new Error('413 Payload Too Large');
    }) as unknown as typeof import('@vercel/blob/client').upload;

    const resultat = await envoyerDossier({
      commande: COMMANDE,
      referenceId: REF,
      fichiers: [{ nom: 'avant.png', blob: png() }],
      uploadImpl,
      fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch,
    });

    expect(resultat.envoye).toBe(false);
    expect(resultat.motif).toMatch(/413|interrompu/);
  });

  it('ne fait rien quand il n’y a aucun fichier', async () => {
    const resultat = await envoyerDossier({
      commande: COMMANDE,
      referenceId: REF,
      fichiers: [],
      fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch,
    });
    expect(resultat.envoye).toBe(false);
    expect(resultat.motif).toMatch(/Aucun fichier/);
  });
});

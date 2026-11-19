/**
 * Routes publiques de l'offre grand format. Redis, Supabase et le stockage sont simulés : on
 * vérifie ici les contrôles d'accès, la validation et surtout que le PRIX est calculé côté
 * serveur depuis la grille validée — jamais repris du navigateur.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TarifGrandFormat } from '../src/lib/grand-format/estimation';

const tarifValide = vi.fn<(support: string) => Promise<TarifGrandFormat | null>>();
const creerDemandeGrandFormat = vi.fn();

vi.mock('@/server/security/rateLimit', () => ({
  limiter: vi.fn(async () => true),
  ErreurLimiteIndisponible: class extends Error {},
}));
vi.mock('@/server/grand-format/repository', () => ({
  tarifValide: (support: string) => tarifValide(support),
  creerDemandeGrandFormat: (...args: unknown[]) => creerDemandeGrandFormat(...args),
}));
vi.mock('@/server/devis/session', () => ({
  creerSession: vi.fn(async () => ({ csrf: 'csrf-test' })),
  ajouterCookiesSession: vi.fn(),
}));
vi.mock('@/server/storage/supabase', () => ({
  creerUrlEnvoi: vi.fn(async (devisId: string, nom: string) => ({
    chemin: `devis/${devisId}/x-${nom}`,
    signedUrl: 'https://stockage.test/signe',
    token: 't',
  })),
}));
vi.mock('@/server/devis/repository', () => ({
  ajouterFichierEnAttente: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000001' })),
  creerDevisAtomique: vi.fn(),
}));
vi.mock('@/server/devis/notifications', () => ({ traiterNotifications: vi.fn(async () => undefined) }));
vi.mock('next/server', () => ({ after: vi.fn() }));

const TARIF: TarifGrandFormat = {
  support: 'BANDEROLE',
  libelle: 'Banderole PVC',
  prixM2Fcfa: 5000,
  minimumPieceFcfa: null,
  supplementOeilletsMlFcfa: 200,
  supplementOurletsMlFcfa: null,
  supplementFourreauxMlFcfa: null,
  fraisCreationFcfa: 15000,
  laizeMaxM: null,
  statutPrix: 'VALIDE',
  actif: true,
};

const PARAMETRES = {
  usage: 'EGLISE',
  support: 'BANDEROLE',
  largeurM: '3',
  hauteurM: '1',
  quantite: 2,
  finition: 'OEILLETS',
  delai: 'STANDARD',
  prestation: 'CREATION',
};

const env = { ...process.env };

function requete(chemin: string, corps: unknown, entetes: Record<string, string> = {}): Request {
  return new Request(`https://elembo.test${chemin}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: JSON.stringify(corps),
  });
}

beforeEach(() => {
  vi.resetModules();
  tarifValide.mockReset();
  creerDemandeGrandFormat.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
});

afterEach(() => {
  process.env = { ...env };
});

describe('POST /api/banderoles/estimation', () => {
  it('refuse une origine étrangère et un Content-Type non JSON', async () => {
    const { POST } = await import('../src/app/api/banderoles/estimation/route');
    expect((await POST(requete('/api/banderoles/estimation', PARAMETRES, { origin: 'https://pirate.test' }))).status).toBe(403);
    const brut = new Request('https://elembo.test/api/banderoles/estimation', { method: 'POST', body: 'x' });
    expect((await POST(brut)).status).toBe(415);
  });

  it('valide les paramètres (422 détaillé)', async () => {
    const { POST } = await import('../src/app/api/banderoles/estimation/route');
    const r = await POST(requete('/api/banderoles/estimation', { ...PARAMETRES, largeurM: '0', quantite: -1 }));
    expect(r.status).toBe(422);
    const corps = (await r.json()) as { details: Record<string, string> };
    expect(Object.keys(corps.details).sort()).toEqual(['largeurM', 'quantite']);
  });

  it('ne donne aucun prix tant que la grille n’est pas validée', async () => {
    tarifValide.mockResolvedValue(null);
    const { POST } = await import('../src/app/api/banderoles/estimation/route');
    const r = await POST(requete('/api/banderoles/estimation', PARAMETRES));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toMatchObject({ estimation: { disponible: false, raison: 'TARIF_NON_VALIDE' } });
  });

  it('ne donne aucun prix si Supabase n’est pas configuré, sans même interroger la base', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { POST } = await import('../src/app/api/banderoles/estimation/route');
    const r = await POST(requete('/api/banderoles/estimation', PARAMETRES));
    expect(await r.json()).toMatchObject({ estimation: { disponible: false } });
    expect(tarifValide).not.toHaveBeenCalled();
  });

  it('calcule depuis la grille validée et ignore tout montant envoyé par le navigateur', async () => {
    tarifValide.mockResolvedValue(TARIF);
    const { POST } = await import('../src/app/api/banderoles/estimation/route');
    const r = await POST(requete('/api/banderoles/estimation', { ...PARAMETRES, montantFcfa: 1, prixM2Fcfa: 1 }));
    // 3 m² × 5 000 + 8 ml × 200 = 16 600 / pièce ; × 2 + création 15 000 = 48 200
    expect(await r.json()).toMatchObject({
      estimation: { disponible: true, montantFcfa: 48200, prixPieceFcfa: 16600, creationFcfa: 15000 },
    });
    expect(tarifValide).toHaveBeenCalledWith('BANDEROLE');
  });

  it('une base en erreur ne produit jamais de prix', async () => {
    tarifValide.mockRejectedValue(new Error('panne'));
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { POST } = await import('../src/app/api/banderoles/estimation/route');
    const r = await POST(requete('/api/banderoles/estimation', PARAMETRES));
    expect(await r.json()).toMatchObject({ estimation: { disponible: false } });
    erreur.mockRestore();
  });
});

const DEMANDE = {
  ...PARAMETRES,
  commentaire: 'Grande croisade, verset et dates en pièce jointe.',
  contact: { nom: 'Pasteur Test', telephone: '06 123 45 67', ville: 'Brazzaville' },
  fichiers: [{ nom: 'logo.png', typeMime: 'image/png', tailleOctets: 1024 }],
  consentement: true,
  // Tentatives de fixer le prix depuis le navigateur : doivent être ignorées.
  estimation: { disponible: true, montantFcfa: 1 },
  estimation_fcfa: 1,
};

describe('POST /api/banderoles', () => {
  it('est fermé tant que le devis n’est pas configuré', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { POST } = await import('../src/app/api/banderoles/route');
    const r = await POST(requete('/api/banderoles', DEMANDE, { 'idempotency-key': 'cle-idempotence-0000001' }));
    expect(r.status).toBe(503);
    expect(creerDemandeGrandFormat).not.toHaveBeenCalled();
  });

  it('refuse une origine étrangère', async () => {
    const { POST } = await import('../src/app/api/banderoles/route');
    const r = await POST(requete('/api/banderoles', DEMANDE, { origin: 'https://pirate.test' }));
    expect(r.status).toBe(403);
  });

  it('renvoie les erreurs de validation sans rien créer', async () => {
    const { POST } = await import('../src/app/api/banderoles/route');
    const r = await POST(
      requete('/api/banderoles', { ...DEMANDE, usage: 'X', contact: { nom: 'P' }, consentement: false }, { 'idempotency-key': 'cle-idempotence-0000002' }),
    );
    expect(r.status).toBe(422);
    const corps = (await r.json()) as { details: Record<string, string> };
    expect(Object.keys(corps.details)).toEqual(expect.arrayContaining(['usage', 'nom', 'telephone', 'consentement']));
    expect(creerDemandeGrandFormat).not.toHaveBeenCalled();
  });

  it('exige une clé d’idempotence', async () => {
    const { POST } = await import('../src/app/api/banderoles/route');
    const r = await POST(requete('/api/banderoles', DEMANDE));
    expect(r.status).toBe(400);
  });

  it('crée la demande avec l’estimation SERVEUR et des URL d’envoi signées vers le stockage privé', async () => {
    tarifValide.mockResolvedValue(TARIF);
    creerDemandeGrandFormat.mockResolvedValue({
      devisId: '00000000-0000-4000-8000-0000000000aa',
      clientId: '00000000-0000-4000-8000-0000000000bb',
      reference: 'DEV-TEST-0001',
      dejaExistant: false,
    });
    const { POST } = await import('../src/app/api/banderoles/route');
    const r = await POST(requete('/api/banderoles', DEMANDE, { 'idempotency-key': 'cle-idempotence-0000003' }));
    expect(r.status).toBe(201);
    const corps = (await r.json()) as { reference: string; uploads: { signedUrl: string; chemin: string }[] };
    expect(corps.reference).toBe('DEV-TEST-0001');
    expect(corps.uploads).toHaveLength(1);
    expect(corps.uploads[0].chemin).toMatch(/^devis\/00000000-0000-4000-8000-0000000000aa\//);

    expect(creerDemandeGrandFormat).toHaveBeenCalledTimes(1);
    const [devis, parametres, estimation, options] = creerDemandeGrandFormat.mock.calls[0];
    expect(devis).toMatchObject({ famille: 'IMPRESSION', quantite: 2, format: '3 × 1 m' });
    expect(devis.specifications['Estimation en ligne']).toBe('48 200 FCFA (indicatif, hors livraison)');
    expect(parametres).toMatchObject({ usage: 'EGLISE', largeurM: 3, quantite: 2 });
    expect(estimation).toMatchObject({ disponible: true, montantFcfa: 48200 });
    expect(options.idempotencyKey).toBe('cle-idempotence-0000003');
  });
});

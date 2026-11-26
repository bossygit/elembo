/**
 * Banner Studio, lot 7 — tests d'abus des routes publiques du Studio : rendu du visuel, reprise,
 * profils, suivi. Session, base et stockage simulés ; les contrôles testés sont ceux des routes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const etat = vi.hoisted(() => ({
  session: 'devis-1' as string | null,
  csrf: true,
  limite: true,
  devis: { id: 'devis-1', reference: 'DEV-1', statut: 'NOUVEAU' } as Record<string, unknown> | null,
  demande: { largeur_m: 3, hauteur_m: 1, quantite: 1, support: 'BANDEROLE', finition: 'OEILLETS', partenaire_id: null } as Record<string, unknown> | null,
  fichiers: [] as Record<string, unknown>[],
  ajoutes: [] as Record<string, unknown>[],
  finaliser: vi.fn(),
  visuel: null as Record<string, unknown> | null,
}));

vi.mock('@/server/devis/session', () => ({
  devisDepuisSession: async () => etat.session,
  csrfValide: () => etat.csrf,
}));
vi.mock('@/server/devis/http', async (original) => ({
  ...(await original<typeof import('../src/server/devis/http')>()),
  limiterOuErreur: async () => (etat.limite ? null : new Response('{}', { status: 429 })),
}));
vi.mock('@/server/devis/repository', () => ({
  devisParId: async () => etat.devis,
  fichiersDuDevis: async () => etat.fichiers,
  ajouterFichierEnAttente: async (_: string, f: Record<string, unknown>) => (etat.ajoutes.push(f), { id: `f-${etat.ajoutes.length}` }),
}));
vi.mock('@/server/commandes/repository', () => ({ commandeDuDevis: async () => null }));
vi.mock('@/server/storage/supabase', () => ({ creerUrlEnvoi: async (_: string, nom: string) => ({ chemin: `devis/devis-1/x-${nom}`, signedUrl: 'https://stockage.test/signe', token: 't' }) }));
vi.mock('@/server/banner/repository', () => ({
  demandeDuDevis: async () => etat.demande,
  visuelCourant: async () => etat.visuel,
  urlApercu: async () => 'https://stockage.test/apercu',
}));
vi.mock('@/server/banner/finaliser', async (original) => ({
  ...(await original<typeof import('../src/server/banner/finaliser')>()),
  finaliserVisuel: (...a: unknown[]) => etat.finaliser(...a),
}));
vi.mock('@/server/banner/profils', () => ({ listerProfils: async () => { throw new Error('base indisponible'); } }));

const BASE = 'https://elembo.test';
const requete = (chemin: string, corps: unknown = {}, entetes: Record<string, string> = {}) =>
  new Request(`${BASE}${chemin}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, ...entetes }, body: typeof corps === 'string' ? corps : JSON.stringify(corps) });
const ctx = (reference = 'DEV-1') => ({ params: Promise.resolve({ reference }) });
const FORMAT = { largeurMm: 3000, hauteurMm: 1000, support: 'BANDEROLE', finition: 'OEILLETS' };
const PAQUET = [
  { nom: 'projet-banner.json', typeMime: 'application/json', tailleOctets: 4000 },
  { nom: 'apercu-banner.jpg', typeMime: 'image/jpeg', tailleOctets: 80_000 },
  { nom: 'studio-photo.jpg', typeMime: 'image/jpeg', tailleOctets: 900_000 },
];

const env = { ...process.env };
beforeEach(() => {
  process.env.APP_ORIGINS = BASE;
  Object.assign(etat, { session: 'devis-1', csrf: true, limite: true, fichiers: [], ajoutes: [], visuel: null, devis: { id: 'devis-1', reference: 'DEV-1', statut: 'NOUVEAU' } });
  etat.finaliser.mockReset().mockResolvedValue({ etat: 'RENDU', version: 1, alertes: [] });
});
afterEach(() => { process.env = { ...env }; });

describe('POST /api/banderoles/[reference]/visuel', () => {
  it('refuse origine étrangère, corps non JSON, CSRF absent, devis d’un autre, abus', async () => {
    const { POST } = await import('../src/app/api/banderoles/[reference]/visuel/route');
    expect((await POST(requete('/api/banderoles/DEV-1/visuel', {}, { origin: 'https://pirate.test' }), ctx())).status).toBe(403);
    expect((await POST(new Request(`${BASE}/x`, { method: 'POST', headers: { origin: BASE }, body: 'x' }), ctx())).status).toBe(415);
    etat.csrf = false;
    expect((await POST(requete('/api/banderoles/DEV-1/visuel'), ctx())).status).toBe(403);
    etat.csrf = true;
    etat.session = null;
    expect((await POST(requete('/api/banderoles/DEV-2/visuel'), ctx('DEV-2'))).status).toBe(404);
    etat.session = 'devis-1';
    etat.limite = false;
    expect((await POST(requete('/api/banderoles/DEV-1/visuel'), ctx())).status).toBe(429);
    expect(etat.finaliser).not.toHaveBeenCalled();
  });

  it('ne laisse jamais filer le détail d’un incident', async () => {
    const { POST } = await import('../src/app/api/banderoles/[reference]/visuel/route');
    etat.finaliser.mockRejectedValue(new Error('chemin interne devis/abc : clé service_role invalide'));
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await POST(requete('/api/banderoles/DEV-1/visuel'), ctx());
    expect(r.status).toBe(500);
    expect(await r.text()).not.toMatch(/service_role|devis\/abc/);
    erreur.mockRestore();
  });

  it('rendu en cours : 202', async () => {
    const { POST } = await import('../src/app/api/banderoles/[reference]/visuel/route');
    etat.finaliser.mockResolvedValue({ etat: 'EN_COURS', version: 2, alertes: [] });
    expect((await POST(requete('/api/banderoles/DEV-1/visuel'), ctx())).status).toBe(202);
  });
});

describe('POST /api/banderoles/[reference]/reprise', () => {
  const reprise = async (corps: unknown, entetes: Record<string, string> = {}) => {
    const { POST } = await import('../src/app/api/banderoles/[reference]/reprise/route');
    const r = await POST(requete('/api/banderoles/DEV-1/reprise', corps, entetes), ctx());
    return { statut: r.status, corps: await r.json() };
  };

  it('révision suivante, images déjà reçues non renvoyées', async () => {
    etat.fichiers = [
      { nom: 'projet-banner.json', verifie: true, taille_octets: 4000 },
      { nom: 'apercu-banner.jpg', verifie: true, taille_octets: 80_000 },
      { nom: 'studio-photo.jpg', verifie: true, taille_octets: 900_000 },
    ];
    const r = await reprise({ format: FORMAT, fichiers: [...PAQUET, { nom: 'studio-logo.png', typeMime: 'image/png', tailleOctets: 1000 }] });
    expect(r.statut).toBe(200);
    expect(r.corps.revision).toBe(2);
    expect(r.corps.uploads.map((u: { nom: string; nomOrigine: string }) => [u.nomOrigine, u.nom])).toEqual([
      ['projet-banner.json', 'projet-banner-r2.json'], ['apercu-banner.jpg', 'apercu-banner-r2.jpg'], ['studio-logo.png', 'studio-logo.png'],
    ]);
  });

  it('refuse : session, CSRF, devis établi, format changé, fichiers suspects, trop de révisions', async () => {
    etat.csrf = false;
    expect((await reprise({ format: FORMAT, fichiers: PAQUET })).statut).toBe(403);
    etat.csrf = true;
    etat.session = null;
    expect((await reprise({ format: FORMAT, fichiers: PAQUET })).statut).toBe(404);
    etat.session = 'devis-1';
    etat.devis = { ...etat.devis, statut: 'PROPOSE' };
    expect(await reprise({ format: FORMAT, fichiers: PAQUET })).toMatchObject({ statut: 409, corps: { erreur: expect.stringMatching(/établi/) } });
    etat.devis = { ...etat.devis, statut: 'EN_ANALYSE' };
    for (const f of [{ ...FORMAT, largeurMm: 4000 }, { ...FORMAT, support: 'BACHE' }, { ...FORMAT, finition: 'SANS' }, {}]) {
      expect((await reprise({ format: f, fichiers: PAQUET })).statut).toBe(409);
    }
    for (const fichiers of [
      PAQUET.slice(1), PAQUET.slice(0, 1), [...PAQUET, { nom: '../../etc/passwd.jpg', typeMime: 'image/jpeg', tailleOctets: 10 }],
      [...PAQUET, { nom: 'page.html', typeMime: 'text/html', tailleOctets: 10 }], [...PAQUET, { nom: 'autre.jpg', typeMime: 'image/jpeg', tailleOctets: 10 }],
      [{ ...PAQUET[0], tailleOctets: 2 * 1024 * 1024 }, PAQUET[1]], 'pas une liste', Array.from({ length: 11 }, (_, i) => ({ nom: `studio-${i}.jpg`, typeMime: 'image/jpeg', tailleOctets: 10 })),
    ]) expect((await reprise({ format: FORMAT, fichiers })).statut, JSON.stringify(fichiers).slice(0, 80)).toBe(422);
    etat.fichiers = Array.from({ length: 19 }, (_, i) => ({ nom: i ? `projet-banner-r${i + 1}.json` : 'projet-banner.json', verifie: true, taille_octets: 10 }));
    expect((await reprise({ format: FORMAT, fichiers: PAQUET })).statut).toBe(429);
    expect(etat.ajoutes).toEqual([]);
  });

  it('corps illisible ou démesuré', async () => {
    expect((await reprise('{')).statut).toBe(400);
    expect((await reprise(JSON.stringify({ x: 'a'.repeat(70_000) }))).statut).toBe(400);
  });
});

describe('GET /api/banderoles/profils', () => {
  it('base indisponible : 503, sans détail, sans cache', async () => {
    const { GET } = await import('../src/app/api/banderoles/profils/route');
    const r = await GET();
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ profils: [] });
  });
});

describe('GET /api/devis/[reference] — visuel', () => {
  it('le client voit son visuel en mots simples, sans alertes ni profil', async () => {
    etat.visuel = {
      version: 3, statut: 'A_REVOIR', apercu_chemin: 'visuels/devis-1/apercu-v3.jpg', fichier_production_id: null, projet: { id: 'projet-1', contraintes: { laizeMaxMm: 900 } },
      avertissements: [{ message: 'Les deux côtés dépassent la laize de l’imprimeur Atelier Secret' }], preflight: { profil: { nom: 'Atelier Secret' } },
    };
    Object.assign(etat.devis!, { famille: 'IMPRESSION', besoin: 'x', format: null, specifications: {}, quantite: 1, montant_propose_fcfa: null, cree_le: '', expire_le: null });
    const { GET } = await import('../src/app/api/devis/[reference]/route');
    const r = await GET(new Request(`${BASE}/api/devis/DEV-1`), ctx());
    const corps = await r.json();
    expect(corps.visuel).toEqual({ version: 3, etat: 'VERIFICATION', apercuUrl: 'https://stockage.test/apercu', pdfFichierId: null, projetId: 'projet-1', modifiable: true });
    expect(JSON.stringify(corps)).not.toMatch(/Atelier Secret|laize/i);
  });
});

/**
 * Banner Studio, lot 6 — profils d'impression, régénération, archivage à la commande. La base et le
 * stockage sont simulés ; le rendu du PDF est réel.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PROFILS_PUBLICS } from '../src/lib/banner/constraints';
import { peut } from '../src/lib/admin/permissions';
import { creerDocument, type DocumentBanner } from '../src/lib/banner/model';
import { choisirProfil, ecartsCapacite, lireSaisieProfil, profilPublic, SUPPORTS_PROFILS, versProfil, type LigneProfil } from '../src/lib/banner/profils';
import { creerStudio } from '../src/stores/banner-studio-store';

const sha = (o: Uint8Array | string) => createHash('sha256').update(o).digest('hex');

/** Ligne de base équivalente au profil public intégré. */
function ligne(p: Partial<LigneProfil> = {}): LigneProfil {
  const pub = PROFILS_PUBLICS.BANDEROLE;
  return {
    id: 'pub-banderole', nom: pub.nom, support: 'BANDEROLE', partenaire_id: null, est_public: true, statut: 'A_VALIDER', version: 1,
    laize_max_mm: null, longueur_max_mm: null, marge_securite_mm: 50, fond_perdu_mm: 0, ourlet_mm: 50, oeillet_diametre_mm: 20,
    oeillet_espacement_mm: 500, oeillet_marge_mm: 30, fourreau_haut_mm: 60, fourreau_bas_mm: 60, dpi_min: 72, dpi_recommande: 150,
    page_max_mm: 5080, mode_grand_format: 'PANNEAUX', notes: 'interne', valide_par_email: null, valide_le: null, maj_le: '2026-11-26', ...p,
  };
}
const IMPRIMEUR = ligne({ id: 'pro-a', nom: 'Banderole — Atelier A', est_public: false, partenaire_id: 'atelier-a', laize_max_mm: 900, statut: 'VALIDE', version: 3, valide_par_email: 'a@exemple.test', valide_le: '2026-11-26' });

describe('profils', () => {
  it('les profils publics de la base sont ceux du code', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261126120000_banner_studio_profils.sql'), 'utf8');
    const valeurs = [...sql.matchAll(/\('([^']+) — profil public', '([A-Z_]+)', (\d+), (\d+), (\d+), (\d+), (\d+)\)/g)];
    expect(valeurs.map((v) => v[2]).sort()).toEqual([...SUPPORTS_PROFILS].sort());
    for (const [, , support, ourlet, haut, bas, marge, dpi] of valeurs) {
      const p = PROFILS_PUBLICS[support as keyof typeof PROFILS_PUBLICS];
      expect([p.ourletMm, p.fourreauHautMm, p.fourreauBasMm, p.margeSecuriteMm, p.dpiRecommande], support).toEqual([ourlet, haut, bas, marge, dpi].map(Number));
      expect([p.dpiMin, p.pageMaxMm, p.fondPerduMm, p.oeillets.diametreMm, p.oeillets.espacementMm, p.oeillets.margeMm]).toEqual([72, 5080, 0, 20, 500, 30]);
    }
  });

  it('profil retenu : imprimeur affecté, sinon public, sinon valeurs intégrées', () => {
    const lignes = [ligne(), IMPRIMEUR];
    expect(choisirProfil('BANDEROLE', 'atelier-a', lignes)).toMatchObject({ id: 'pro-a', laizeMaxMm: 900, statut: 'VALIDE', version: 3 });
    expect(choisirProfil('BANDEROLE', 'atelier-b', lignes)).toMatchObject({ id: 'pub-banderole', estPublic: true });
    expect(choisirProfil('BANDEROLE', 'atelier-a', [ligne(), { ...IMPRIMEUR, statut: 'ARCHIVE' }]).id).toBe('pub-banderole');
    expect(choisirProfil('BANDEROLE', null, [])).toBe(PROFILS_PUBLICS.BANDEROLE);
    expect(choisirProfil('ROLL_UP', 'atelier-a', lignes)).toBe(PROFILS_PUBLICS.ROLL_UP);
  });

  it('conversion fidèle, et rien de confidentiel dans la version publique', () => {
    expect(versProfil(ligne())).toEqual({ ...PROFILS_PUBLICS.BANDEROLE, id: 'pub-banderole' });
    const pub = profilPublic(IMPRIMEUR);
    expect(JSON.stringify(pub)).not.toMatch(/atelier-a|interne|exemple\.test/);
  });

  it('saisie du back-office : bornes, entiers, cohérence des dpi', () => {
    const lire = (p: Record<string, string>) => (cle: string) => ({ ...Object.fromEntries(Object.entries(ligne()).map(([k, v]) => [k, v === null ? '' : String(v)])), ...p })[cle] ?? null;
    expect(lireSaisieProfil(lire({}))).toMatchObject({ ok: true, valeurs: { marge_securite_mm: 50, laize_max_mm: null } });
    expect(lireSaisieProfil(lire({ laize_max_mm: '3200' }))).toMatchObject({ ok: true, valeurs: { laize_max_mm: 3200 } });
    for (const [p, motif] of [
      [{ marge_securite_mm: '' }, /requise/], [{ marge_securite_mm: '-1' }, /entier/], [{ marge_securite_mm: '2,5' }, /entier/],
      [{ page_max_mm: '6000' }, /entre 500 et 5080/], [{ dpi_min: '200', dpi_recommande: '150' }, /inférieure/],
      [{ mode_grand_format: 'AUTRE' }, /inconnu/], [{ nom: 'x' }, /2 à 120/],
    ] as const) expect(lireSaisieProfil(lire(p)), JSON.stringify(p)).toMatchObject({ ok: false, erreur: expect.stringMatching(motif) });
  });

  it('écarts avec la capacité validée du partenaire', () => {
    expect(ecartsCapacite({ laize_max_mm: 3200, longueur_max_mm: null }, { largeur_max_mm: 3200, longueur_max_mm: null, finitions: [] })).toEqual([]);
    expect(ecartsCapacite({ laize_max_mm: 900, longueur_max_mm: null }, { largeur_max_mm: 3200, longueur_max_mm: 50000, finitions: [] })).toHaveLength(2);
    expect(ecartsCapacite({ laize_max_mm: 900, longueur_max_mm: null }, null)[0]).toMatch(/Aucune capacité/);
  });

  it('droits : l’atelier règle les profils sans voir les demandes ; le visuel ne regarde pas la finance', () => {
    expect(['admin', 'atelier'].every((r) => peut(r as never, 'grand_format.profils'))).toBe(true);
    expect(peut('commercial', 'grand_format.profils') || peut('finance', 'grand_format.profils')).toBe(false);
    expect(peut('atelier', 'grand_format.voir')).toBe(false);
    expect(peut('finance', 'grand_format.visuel')).toBe(false);
  });
});

describe('Studio', () => {
  it('les profils de la base remplacent les valeurs intégrées, sans étape d’annulation', () => {
    vi.useFakeTimers();
    const s = creerStudio({ mesurer: () => (t, c) => t.length * c * 0.5, enregistrer: async () => true, id: () => 'p' });
    s.getState().ajouterForme('rect');
    const etapes = s.getState().historique.passe.length;
    s.getState().poserProfils([versProfil(ligne({ marge_securite_mm: 80, statut: 'VALIDE', valide_par_email: 'x', valide_le: 'x', version: 2 }))]);
    expect(s.getState().document).toMatchObject({ contraintes: { margeSecuriteMm: 80 }, profil: { id: 'pub-banderole', version: 2 } });
    expect(s.getState().historique.passe).toHaveLength(etapes);
    expect(s.getState().alertes.map((a) => a.code)).not.toContain('PROFIL_A_VALIDER');
    // Un profil d'imprimeur n'est jamais pris pour le profil public.
    s.getState().poserProfils([versProfil(IMPRIMEUR)]);
    expect(s.getState().profils.BANDEROLE.id).toBe('pub-banderole');
    s.getState().poserSupport('ROLL_UP', 'SANS');
    expect(s.getState().document.contraintes.fourreaux.basMm).toBe(100);
    vi.useRealTimers();
  });
});

/* ---------------------------------------------- régénération et archivage -- */

const etat = vi.hoisted(() => ({
  objets: new Map<string, Uint8Array>(),
  lignes: [] as Record<string, unknown>[],
  demande: null as Record<string, unknown> | null,
  profils: [] as unknown[],
  courant: null as Record<string, unknown> | null,
  reservations: [] as Record<string, unknown>[],
  termine: [] as Record<string, unknown>[],
  archives: [] as { commande: string; fichiers: { nom: string; chemin: string }[] }[],
  commande: null as { id: string } | null,
  notifications: [] as Record<string, unknown>[],
  affectation: null as Record<string, unknown> | null,
}));
vi.mock('@/server/devis/repository', () => ({ fichiersDuDevis: async () => etat.lignes }));
vi.mock('@/server/banner/profils', () => ({ listerProfils: async () => etat.profils }));
vi.mock('@/server/banner/repository', () => ({
  demandeDuDevis: async () => etat.demande,
  reserverVisuel: async (p: Record<string, unknown>) => {
    etat.reservations.push(p);
    return { visuel_id: `v${etat.reservations.length}`, version: etat.reservations.length, etat: 'NOUVEAU', statut: 'EN_COURS' };
  },
  visuelParId: async () => null,
  visuelCourant: async () => etat.courant,
  terminerVisuel: async (p: Record<string, unknown>) => void etat.termine.push(p),
  echouerVisuel: async () => undefined,
  lireObjet: async (_: string, c: string) => etat.objets.get(c) ?? null,
  ecrireObjet: async (b: string, c: string, o: Uint8Array) => void etat.objets.set(`${b}:${c}`, o),
  effacerObjets: async () => undefined,
  commandeDuDevisBanner: async () => etat.commande,
  archiverVisuelCommande: async (commande: string, fichiers: { nom: string; chemin: string }[]) => void etat.archives.push({ commande, fichiers }),
}));
vi.mock('@/server/supabase/client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      insert: async (l: Record<string, unknown>) => (etat.notifications.push({ table, ...l }), { error: null }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: etat.affectation }) }) }),
    }),
  }),
}));

const DEVIS = 'devis-1';
function documentClient(): DocumentBanner {
  const d = creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000, finition: 'OEILLETS' }, { id: () => 'doc', maintenant: () => new Date('2026-11-26T08:00:00Z') });
  d.fond = { type: 'couleur', couleur: '#1F3A8A' };
  return d;
}
function preparer(doc = documentClient()) {
  etat.objets.clear();
  Object.assign(etat, { lignes: [], reservations: [], termine: [], archives: [], notifications: [], commande: null, courant: null, profils: [ligne()] });
  etat.demande = { largeur_m: 3, hauteur_m: 1, quantite: 1, support: 'BANDEROLE', finition: 'OEILLETS', partenaire_id: null };
  const o = new TextEncoder().encode(JSON.stringify(doc));
  etat.objets.set(`devis/${DEVIS}/x-projet.json`, o);
  etat.lignes.push({ id: 'f-projet', nom: 'projet-banner.json', chemin: `devis/${DEVIS}/x-projet.json`, verifie: true, checksum: sha(o), type_mime: 'application/json', type_fichier: 'SOURCE' });
  return doc;
}
const dernier = () => etat.termine.at(-1) as { statut: string; avertissements: { code: string; message: string }[]; projet: DocumentBanner; preflight: { profil: Record<string, unknown> } };

describe('profil appliqué au rendu', () => {
  beforeEach(() => void preparer());

  it('profil public : contraintes de la base, signalées à valider', async () => {
    etat.profils = [ligne({ marge_securite_mm: 70 })];
    const { finaliserVisuel } = await import('../src/server/banner/finaliser');
    expect(await finaliserVisuel(DEVIS, 'DEV-1')).toMatchObject({ etat: 'RENDU' });
    expect(dernier().projet).toMatchObject({ contraintes: { margeSecuriteMm: 70 }, profil: { id: 'pub-banderole', version: 1 } });
    expect(dernier().preflight.profil).toMatchObject({ id: 'pub-banderole', statut: 'A_VALIDER' });
    expect(dernier().avertissements.map((a) => a.code)).toContain('PROFIL_A_VALIDER');
    expect(etat.reservations[0]).toMatchObject({ profilId: 'pub-banderole', profilVersion: 1, origine: 'CLIENT' });
  });

  it('imprimeur affecté : son profil s’applique ; sa laize trop étroite bloque et alerte', async () => {
    etat.profils = [ligne(), IMPRIMEUR];
    etat.demande = { ...etat.demande, partenaire_id: 'atelier-a' };
    const { finaliserVisuel } = await import('../src/server/banner/finaliser');
    expect(await finaliserVisuel(DEVIS, 'DEV-1')).toMatchObject({ etat: 'A_REVOIR' });
    expect(dernier().avertissements.map((a) => a.code)).toContain('HORS_LAIZE');
    expect(dernier().avertissements.map((a) => a.code)).not.toContain('PROFIL_A_VALIDER');
  });

  it('chaque profil, et chaque version d’un profil, donne un rendu distinct', async () => {
    const { finaliserVisuel } = await import('../src/server/banner/finaliser');
    await finaliserVisuel(DEVIS, 'DEV-1');
    etat.profils = [ligne({ version: 2 })];
    await finaliserVisuel(DEVIS, 'DEV-1');
    etat.profils = [ligne(), { ...IMPRIMEUR, laize_max_mm: 3200 }];
    etat.demande = { ...etat.demande, partenaire_id: 'atelier-a' };
    await finaliserVisuel(DEVIS, 'DEV-1');
    expect(new Set(etat.reservations.map((r) => r.checksum)).size).toBe(3);
  });
});

describe('régénération par l’équipe', () => {
  beforeEach(() => void preparer());

  it('repart du document enregistré, avec le profil actuel, et suit la commande existante', async () => {
    const { finaliserVisuel, regenererVisuel } = await import('../src/server/banner/finaliser');
    await finaliserVisuel(DEVIS, 'DEV-1');
    const premier = dernier();
    // Le visuel courant en base, avec ses fichiers.
    const fichiers = (etat.termine[0] as { fichiers: { role: string; nom: string; chemin: string; checksum: string; type_mime: string; type_fichier: string }[] }).fichiers;
    fichiers.forEach((f, i) => etat.lignes.push({ id: `srv-${i}`, nom: f.nom, chemin: f.chemin, verifie: true, checksum: f.checksum, type_mime: f.type_mime, type_fichier: f.type_fichier }));
    for (const f of fichiers) etat.objets.set(f.chemin, etat.objets.get(`devis:${f.chemin}`)!);
    etat.courant = { id: 'v1', statut: 'RENDU', projet: premier.projet, preflight: premier.preflight, fichier_production_id: 'srv-0', fichier_projet_id: 'srv-1', fichier_fiche_id: 'srv-2' };
    etat.lignes = etat.lignes.filter((l) => l.nom !== 'projet-banner.json'); // le projet client n'est plus nécessaire
    etat.profils = [ligne(), { ...IMPRIMEUR, laize_max_mm: 3200 }];
    etat.demande = { ...etat.demande, partenaire_id: 'atelier-a' };
    etat.commande = { id: 'cmd-1' };

    expect(await regenererVisuel(DEVIS, 'DEV-1')).toMatchObject({ etat: 'RENDU', version: 2 });
    expect(etat.reservations[1]).toMatchObject({ origine: 'STAFF', profilId: 'pro-a', profilVersion: 3 });
    expect(dernier().projet.contraintes.laizeMaxMm).toBe(3200);
    // Archivage : vers le stockage de production, dans le dossier de la commande.
    expect(etat.archives[0].commande).toBe('cmd-1');
    expect(etat.archives[0].fichiers.map((f) => f.chemin).every((c) => c.startsWith('commandes/cmd-1/'))).toBe(true);
    expect([...etat.objets.keys()].filter((k) => k.startsWith('production:commandes/cmd-1/'))).toHaveLength(3);
  });

  it('sans visuel rendu : rien à archiver', async () => {
    const { archiverVisuel } = await import('../src/server/banner/finaliser');
    expect(await archiverVisuel(DEVIS, 'cmd-1')).toBe(0);
    etat.courant = { statut: 'A_REVOIR' };
    expect(await archiverVisuel(DEVIS, 'cmd-1')).toBe(0);
    expect(etat.archives).toEqual([]);
  });

  it('un fichier altéré n’est pas archivé', async () => {
    const { archiverVisuel } = await import('../src/server/banner/finaliser');
    etat.courant = { statut: 'RENDU', fichier_production_id: 'srv' };
    etat.lignes.push({ id: 'srv', nom: 'visuel-banner-v1.pdf', chemin: `devis/${DEVIS}/visuel-banner-v1.pdf`, checksum: 'a'.repeat(64), type_mime: 'application/pdf' });
    etat.objets.set(`devis/${DEVIS}/visuel-banner-v1.pdf`, new Uint8Array([1]));
    await expect(archiverVisuel(DEVIS, 'cmd-1')).rejects.toThrow(/illisible/);
  });
});

describe('après l’acceptation d’un imprimeur', () => {
  beforeEach(() => void preparer());

  it('sans visuel Studio, rien ne se passe', async () => {
    const { regenererApresAffectation } = await import('../src/server/banner/regeneration');
    etat.affectation = { devis_id: DEVIS, devis: { reference: 'DEV-1' } };
    await regenererApresAffectation('aff-1');
    expect(etat.reservations).toEqual([]);
  });

  it('visuel qui ne passe plus : l’équipe est alertée, une fois par version', async () => {
    const { regenererApresAffectation, alerterVisuel } = await import('../src/server/banner/regeneration');
    const { finaliserVisuel } = await import('../src/server/banner/finaliser');
    await finaliserVisuel(DEVIS, 'DEV-1');
    etat.courant = { id: 'v1', statut: 'RENDU', projet: dernier().projet, preflight: dernier().preflight };
    etat.profils = [ligne(), IMPRIMEUR];
    etat.demande = { ...etat.demande, partenaire_id: 'atelier-a' };
    etat.affectation = { devis_id: DEVIS, devis: { reference: 'DEV-1' } };
    vi.stubEnv('DEVIS_NOTIFY_EMAIL', 'Equipe@Exemple.test');
    vi.stubEnv('TELEGRAM_CHAT_ID', '123');
    await regenererApresAffectation('aff-1');
    expect(etat.reservations.at(-1)).toMatchObject({ origine: 'STAFF', profilId: 'pro-a' });
    expect(etat.notifications.map((n) => [n.canal, n.destinataire, n.cle_idempotence])).toEqual([
      ['EMAIL', 'equipe@exemple.test', 'visuel:devis-1:v2:email'],
      ['TELEGRAM', '123', 'visuel:devis-1:v2:telegram'],
    ]);
    expect(String(etat.notifications[0].corps)).toMatch(/laize|imprimeur affecté/i);
    await alerterVisuel(DEVIS, 'DEV-1', { etat: 'RENDU', version: 3, alertes: [] }, '');
    expect(etat.notifications).toHaveLength(2);
    vi.unstubAllEnvs();
  });

  it('une erreur ne remonte jamais jusqu’à la décision de l’imprimeur', async () => {
    const { regenererApresAffectation } = await import('../src/server/banner/regeneration');
    etat.affectation = { devis_id: DEVIS, devis: { reference: 'DEV-1' } };
    etat.courant = { id: 'v1', statut: 'RENDU', projet: { invalide: true }, preflight: {} };
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(regenererApresAffectation('aff-1')).resolves.toBeUndefined();
    expect(erreur).toHaveBeenCalledWith('visuel_regeneration_echec', 'aff-1', expect.anything());
    erreur.mockRestore();
  });
});

describe('route publique des profils', () => {
  it('seulement les profils publics, sans rien de confidentiel', async () => {
    etat.profils = [ligne(), IMPRIMEUR];
    const { GET } = await import('../src/app/api/banderoles/profils/route');
    const r = await GET();
    const corps = await r.json();
    expect(corps.profils).toHaveLength(1);
    expect(JSON.stringify(corps)).not.toMatch(/atelier-a|interne|Atelier A/);
    expect(r.headers.get('cache-control')).toContain('max-age=300');
  });
});

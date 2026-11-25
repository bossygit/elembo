/**
 * Banner Studio, lot 4 — modèles, variables, projets, paquet et contrôles serveur du paquet.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { CATEGORIES } from '../src/lib/banner/categories';
import { evaluer } from '../src/lib/banner/constraints';
import * as op from '../src/lib/banner/edition';
import { creerDocument, type Asset, type DocumentBanner, type ElementTexte } from '../src/lib/banner/model';
import { assemblerPaquet, LIMITES_PAQUET, NOM_APERCU, NOM_PROJET, nomFichierAsset } from '../src/lib/banner/paquet';
import { glyphesManquants, policeConnue, varianteDe, type Mesureur } from '../src/lib/banner/polices';
import { lireDocument, validerDocument } from '../src/lib/banner/schema';
import { enregistrerPaquet, enregistrerProjet, lirePaquet, lireProjet, lireProjetCourant, listerProjets, marquerEnvoye, poserCourant, supprimerProjet } from '../src/lib/banner/stockage';
import { documentDepuisModele, documentVignette, MODELES_STUDIO, modeleStudio, remplacerVariables, textesExemple, valeursExemple } from '../src/lib/banner/templates';
import { validerDemandeDevis } from '../src/lib/devis/validation';
import { validerDemandeGrandFormat } from '../src/lib/grand-format/validation';
import { verifierProjetBanner } from '../src/server/storage/projetBanner';
import { creerStudio } from '../src/stores/banner-studio-store';

const mesurer: Mesureur = () => (t, corps) => [...t].length * 0.5 * corps;
const base = { id: 'p1', creeLe: '2026-11-25T10:00:00.000Z', modifieLe: '2026-11-25T10:00:00.000Z' };

describe('modèles', () => {
  it('dix modèles, identifiants uniques, au moins un par catégorie, un fichier chacun', () => {
    expect(MODELES_STUDIO).toHaveLength(10);
    expect(new Set(MODELES_STUDIO.map((m) => m.id)).size).toBe(10);
    for (const c of CATEGORIES) expect(MODELES_STUDIO.some((m) => m.categorie === c.id), c.id).toBe(true);
    const fichiers = readdirSync(join(process.cwd(), 'src/lib/banner/templates')).filter((f) => f.endsWith('.json'));
    expect(fichiers.sort()).toEqual(MODELES_STUDIO.map((m) => `${m.id}.json`).sort());
  });

  it.each(MODELES_STUDIO.map((m) => [m.id, m] as const))('%s : document valide, variables cohérentes, polices réelles', (_, m) => {
    expect(validerDocument(m.document)).toMatchObject({ ok: true });
    expect(m.document).toMatchObject({ modeleId: m.id, categorie: m.categorie, meta: { createur: 'modele' } });
    expect([m.document.dimensions.largeurMm % 10, m.document.dimensions.hauteurMm % 10]).toEqual([0, 0]);
    const declarees = m.variables.map((v) => v.id);
    expect(new Set(declarees).size).toBe(declarees.length);
    const citees = m.document.elements.flatMap((e) => (e.type === 'texte' ? [...e.texte.contenu.matchAll(/\{\{([a-z]+)\}\}/g)].map((x) => x[1]) : []));
    expect([...new Set(citees)].sort()).toEqual([...declarees].sort());
    expect(m.variables.some((v) => v.personnel)).toBe(true);
    for (const v of m.variables) expect(v.exemple.length, v.id).toBeLessThanOrEqual(v.max);
    for (const e of m.document.elements) {
      if (e.type !== 'texte') continue;
      expect(policeConnue(e.texte.policeId)).toBe(true);
      expect(varianteDe(e.texte), `${m.id}/${e.nom}`).toEqual({ graisse: e.texte.graisse, italique: e.texte.italique });
      expect(glyphesManquants(e.texte.policeId, remplacerVariables(e.texte.contenu, m, {})), `${m.id}/${e.nom}`).toEqual([]);
    }
    // Aucune photo : seulement l'emplacement d'exemple, à remplacer.
    for (const a of m.document.assets) expect(a.placeholder).toBe(true);
  });

  it('la place de chaque texte est dans la zone de sécurité', () => {
    for (const m of MODELES_STUDIO) {
      const place = evaluer(m.document).filter((a) => a.severite !== 'info' && a.code !== 'PLACEHOLDER');
      expect(place.map((a) => `${m.id} ${a.code} ${a.message}`)).toEqual([]);
    }
  });

  it('variables : valeur, exemple si vide, longueur bornée, une seule ligne sauf exception', () => {
    const m = modeleStudio('hommage-portrait')!;
    expect(remplacerVariables('A {{nom}} B', m, { nom: ' Mama Rose ' })).toBe('A Mama Rose B');
    expect(remplacerVariables('{{nom}}', m, { nom: '  ' })).toBe('Papa Joseph Malonga');
    expect(remplacerVariables('{{dates}}', m, { dates: 'x'.repeat(200) })).toHaveLength(40);
    expect(remplacerVariables('{{nom}}', m, { nom: 'Papa\nJoseph' })).toBe('Papa Joseph');
    expect(remplacerVariables('{{offre}}', modeleStudio('ouverture-commerce')!, { offre: 'A\nB' })).toBe('A\nB');
    expect(remplacerVariables('{{inconnue}}', m, {})).toBe('');
  });

  it('un texte trop long est réduit pour tenir dans sa place, jamais tronqué', () => {
    const m = modeleStudio('hommage-portrait')!;
    const long = 'Papa Jean-Baptiste Emmanuel Nkounkou-Malonga de Makélékélé';
    const d = documentDepuisModele(m, { nom: long }, base, mesurer);
    const place = m.document.elements.find((e) => e.nom === 'Nom') as ElementTexte;
    const nom = d.elements.find((e) => e.nom === 'Nom') as ElementTexte;
    expect(nom.texte.contenu).toBe(long);
    expect(nom.largeurMm).toBeLessThanOrEqual(place.largeurMm);
    expect(nom.texte.corpsMm).toBeLessThan(place.texte.corpsMm);
    const court = documentDepuisModele(m, { nom: 'Rose' }, base, mesurer).elements.find((e) => e.nom === 'Nom') as ElementTexte;
    expect(court.texte.corpsMm).toBe(place.texte.corpsMm);
  });

  it('un texte aligné à gauche reste calé à gauche', () => {
    const m = modeleStudio('culte-special')!;
    const bord = (d: DocumentBanner, nom: string) => { const e = d.elements.find((x) => x.nom === nom)!; return e.xMm - e.largeurMm / 2; };
    const d = documentDepuisModele(m, { titre: 'Culte' }, base, mesurer);
    expect(bord(d, 'Titre')).toBeCloseTo(bord(m.document, 'Titre'), 0);
  });

  it('document obtenu : valide, nommé d’après ce que l’utilisateur a saisi, attribué au client', () => {
    for (const m of MODELES_STUDIO) {
      const d = documentDepuisModele(m, valeursExemple(m), base, mesurer);
      expect(validerDocument(d)).toMatchObject({ ok: true });
      expect(d).toMatchObject({ ...base, modeleId: m.id, meta: { createur: 'client' }, nom: m.nom });
      expect(JSON.stringify(d)).not.toContain('{{');
      expect(JSON.stringify(documentVignette(m))).not.toContain('{{');
    }
    const m = modeleStudio('mariage-anneaux')!;
    expect(documentDepuisModele(m, { prenoms: 'Inès & Paul' }, base, mesurer).nom).toBe('Mariage aux anneaux — Inès & Paul');
    expect(m.document.elements.some((e) => e.type === 'texte' && e.texte.contenu === '{{prenoms}}')).toBe(true); // le modèle n'a pas été modifié
  });

  it('un nom ou une date d’exemple oublié est signalé ; une formule générale, non', () => {
    const m = modeleStudio('hommage-portrait')!;
    const d = documentDepuisModele(m, { nom: 'Mama Rose Bouanga' }, base, mesurer);
    const noms = d.elements.filter((e) => textesExemple(d).has(e.id)).map((e) => e.nom);
    expect(noms.sort()).toEqual(['Dates', 'Signature']);
    expect(evaluer(d, { textesExemple: textesExemple(d) }).filter((a) => a.code === 'TEXTE_EXEMPLE')).toHaveLength(2);
    expect(textesExemple({ ...d, modeleId: null }).size).toBe(0);
  });

  it('une photo d’exemple bloque, sans être dite « introuvable »', () => {
    const d = documentDepuisModele(modeleStudio('hommage-portrait')!, {}, base, mesurer);
    const codes = evaluer(d, { assetsDisponibles: new Set() }).map((a) => a.code);
    expect(codes).toContain('PLACEHOLDER');
    expect(codes).not.toContain('IMAGE_MANQUANTE');
  });

  it('appliquer un modèle est une seule étape d’annulation et garde l’identité du projet', () => {
    vi.useFakeTimers();
    let n = 0;
    const s = creerStudio({ mesurer, enregistrer: async () => true, id: () => `id${++n}` });
    s.getState().ajouterForme('rect');
    const avant = s.getState().document;
    s.getState().installerModele(documentDepuisModele(modeleStudio('conference-rollup')!, {}, base, mesurer));
    expect(s.getState().document).toMatchObject({ id: avant.id, creeLe: avant.creeLe, support: 'ROLL_UP', dimensions: { largeurMm: 850, hauteurMm: 2000 } });
    s.getState().annuler();
    expect(s.getState().document).toEqual(avant);
    vi.useRealTimers();
  });
});

describe('format au centimètre', () => {
  it('le format édité est celui que le devis enregistrera', () => {
    const d = creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000 }, { id: () => 'd' });
    expect(op.poserFormat(d, 3004, 996, mesurer).dimensions).toEqual({ largeurMm: 3000, hauteurMm: 1000 });
    expect(op.poserFormat(d, 3456, 1234, mesurer).dimensions).toEqual({ largeurMm: 3460, hauteurMm: 1230 });
  });
});

describe('projets de l’appareil (repli mémoire)', () => {
  const doc = (id: string, nom: string, modifieLe: string) => ({ ...creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000, nom }, { id: () => id }), modifieLe });

  it('liste du plus récent au plus ancien, ouverture, suppression', async () => {
    await enregistrerProjet(doc('a', 'Ancien', '2026-11-01T00:00:00.000Z'));
    await enregistrerProjet(doc('b', 'Récent', '2026-11-20T00:00:00.000Z'));
    expect((await listerProjets()).map((p) => p.nom)).toEqual(['Récent', 'Ancien']);
    await poserCourant('a');
    expect((await lireProjetCourant())?.ok).toBe(true);
    await marquerEnvoye('a', 'DEV-TEST');
    expect((await listerProjets()).find((p) => p.id === 'a')!.envoi?.reference).toBe('DEV-TEST');
    await supprimerProjet('a');
    expect(await lireProjet('a')).toBeNull();
    expect(await lireProjetCourant()).toBeNull();
    expect((await listerProjets()).map((p) => p.id)).toEqual(['b']);
  });

  it('un projet illisible reste listé, sans faire échouer la liste', async () => {
    await enregistrerProjet({ ...doc('c', 'Cassé', '2026-11-22T00:00:00.000Z'), version: 99 } as unknown as DocumentBanner);
    expect((await listerProjets())[0]).toMatchObject({ id: 'c', nom: 'Cassé', document: null });
  });

  it('paquet : aperçu et version du document', async () => {
    expect(await lirePaquet('b')).toBeNull();
    await enregistrerPaquet('b', { modifieLe: 'x', apercu: new Blob(['j'], { type: 'image/jpeg' }) });
    expect((await lirePaquet('b'))?.modifieLe).toBe('x');
  });

  it('export puis import : aller-retour exact ; fichier corrompu refusé', () => {
    const d = documentDepuisModele(modeleStudio('promotion')!, {}, base, mesurer);
    const r = lireDocument(JSON.stringify(d, null, 2));
    expect(r.ok && r.document).toEqual(d);
    for (const f of ['', '{', '[]', '{"schema":"autre"}', JSON.stringify({ ...d, version: 2 }), JSON.stringify({ ...d, script: 'x' })]) expect(lireDocument(f).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ paquet -- */

const PHOTO: Asset = { id: 'photo-1', nom: 'photo.jpg', mime: 'image/jpeg', largeurPx: 2000, hauteurPx: 1500 };
const LOGO: Asset = { id: 'logo-1', nom: 'logo.png', mime: 'image/png', largeurPx: 800, hauteurPx: 800 };
const avecImages = (...assets: Asset[]): DocumentBanner => ({ ...creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000 }, { id: () => 'p' }), assets });
const apercu = new Blob(['jpeg'], { type: 'image/jpeg' });
const blobs = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, new Blob([a.id], { type: a.mime })]));

describe('paquet', () => {
  it('projet, aperçu puis images, noms déterministes et types justes', () => {
    const d = avecImages(PHOTO, LOGO);
    const r = assemblerPaquet({ document: d, apercu, images: blobs(PHOTO, LOGO) });
    expect(r.ok && r.fichiers.map((f) => [f.name, f.type])).toEqual([
      [NOM_PROJET, 'application/json'], [NOM_APERCU, 'image/jpeg'], ['studio-photo-1.jpg', 'image/jpeg'], ['studio-logo-1.png', 'image/png'],
    ]);
  });

  it('refuse : image absente, image d’exemple, trop d’images, trop lourd, format au millimètre, document invalide', () => {
    const erreur = (d: DocumentBanner, images = blobs(...d.assets)) => { const r = assemblerPaquet({ document: d, apercu, images }); return r.ok ? '' : r.erreur; };
    expect(erreur(avecImages(PHOTO), new Map())).toMatch(/introuvable/);
    expect(erreur(avecImages({ ...PHOTO, placeholder: true }))).toMatch(/exemple/);
    const neuf = Array.from({ length: 9 }, (_, i) => ({ ...PHOTO, id: `p${i}` }));
    expect(erreur(avecImages(...neuf))).toMatch(/8 au maximum/);
    expect(erreur(avecImages(...neuf.slice(0, 8)))).toBe('');
    const lourd = new Map([['photo-1', { size: 26 * 1024 * 1024 } as Blob]]);
    vi.stubGlobal('File', class { size: number; constructor(p: { size?: number }[], public name: string) { this.size = p[0].size ?? 10; } });
    expect(erreur(avecImages(PHOTO), lourd)).toMatch(/25 Mo/);
    const quatre = neuf.slice(0, 4);
    expect(erreur(avecImages(...quatre), new Map(quatre.map((a) => [a.id, { size: 21 * 1024 * 1024 } as Blob])))).toMatch(/80 Mo/);
    vi.unstubAllGlobals();
    expect(erreur({ ...avecImages(), dimensions: { largeurMm: 3005, hauteurMm: 1000 } })).toMatch(/centimètre/);
    expect(erreur({ ...avecImages(), nom: '' })).toMatch(/invalides/);
  });

  it('noms acceptés par le contrôle de fichiers du devis', () => {
    expect(nomFichierAsset(LOGO)).toBe('studio-logo-1.png');
  });
});

/* ----------------------------------------------------------------- serveur -- */

const demande = (studio: unknown, fichiers: unknown[]) => ({
  usage: 'DEUIL', support: 'BANDEROLE', largeurM: '3', hauteurM: '1', quantite: 1, finition: 'OEILLETS', delai: 'STANDARD', prestation: 'FICHIER_PRET',
  contact: { nom: 'Client Essai', telephone: '06 123 45 67' }, consentement: true, studio, fichiers,
});
const JSON_OK = { nom: NOM_PROJET, typeMime: 'application/json', tailleOctets: 5000 };
const APERCU_OK = { nom: NOM_APERCU, typeMime: 'image/jpeg', tailleOctets: 90_000 };
const img = (i: number, taille = 1000) => ({ nom: `studio-${i}.jpg`, typeMime: 'image/jpeg', tailleOctets: taille });
const erreurs = (d: unknown) => { const r = validerDemandeGrandFormat(d); return r.ok ? {} : r.erreurs; };

describe('demande venant du Studio : contrôles serveur', () => {
  it('acceptée, et identifiée pour l’équipe comme pour le client', () => {
    const r = validerDemandeGrandFormat(demande(true, [JSON_OK, APERCU_OK, img(1)]));
    expect(r.ok && r.valeur.studio).toBe(true);
    expect(r.ok && r.valeur.devis.besoin).toContain('Elembo Banner Studio');
    expect(r.ok && r.valeur.devis.specifications).toMatchObject({ Visuel: 'Réalisé avec Elembo Banner Studio' });
  });

  it('dix fichiers et 80 Mo, pas davantage', () => {
    const huit = Array.from({ length: 8 }, (_, i) => img(i));
    expect(erreurs(demande(true, [JSON_OK, APERCU_OK, ...huit]))).toEqual({});
    expect(erreurs(demande(true, [JSON_OK, APERCU_OK, ...huit, img(9)])).fichiers).toMatch(/Maximum 10/);
    expect(erreurs(demande(true, [JSON_OK, APERCU_OK, ...[1, 2, 3, 4].map((i) => img(i, 21 * 1024 * 1024))])).fichiers).toMatch(/80 Mo/);
  });

  it('exige un seul projet, bien nommé, et son aperçu', () => {
    expect(erreurs(demande(true, [APERCU_OK])).fichiers).toMatch(/projet/);
    expect(erreurs(demande(true, [JSON_OK])).fichiers).toMatch(/aperçu/);
    expect(erreurs(demande(true, [{ ...JSON_OK, nom: 'autre.json' }, APERCU_OK])).fichiers).toMatch(/projet/);
    expect(erreurs(demande(true, [JSON_OK, { ...JSON_OK, nom: 'b.json' }, APERCU_OK])).fichiers).toMatch(/projet/);
    expect(erreurs(demande(true, [{ ...JSON_OK, tailleOctets: LIMITES_PAQUET.octetsJson + 1 }, APERCU_OK])).fichiers).toMatch(/volumineux/);
  });

  it('sans le Studio : JSON refusé, 5 fichiers et 50 Mo, comme avant', () => {
    for (const studio of [undefined, false, 'true', 1]) expect(erreurs(demande(studio, [JSON_OK, APERCU_OK])).fichiers).toMatch(/Type de fichier refusé/);
    expect(erreurs(demande(undefined, [1, 2, 3, 4, 5, 6].map((i) => img(i)))).fichiers).toMatch(/Maximum 5/);
    expect(erreurs(demande(undefined, [1, 2, 3].map((i) => img(i, 20 * 1024 * 1024)))).fichiers).toMatch(/50 Mo/);
    const general = validerDemandeDevis({ famille: 'IMPRESSION', nom: 'Client', telephone: '06 123 45 67', besoin: 'Une impression simple', consentement: true, fichiers: [JSON_OK] });
    expect(general.ok).toBe(false);
  });
});

describe('projet déposé : vérification des octets', () => {
  const doc = documentDepuisModele(modeleStudio('promotion')!, {}, base, mesurer);
  const octets = (s: string) => new TextEncoder().encode(s);
  const raison = (o: Uint8Array, nom = NOM_PROJET) => { const r = verifierProjetBanner(nom, o); return r.ok ? null : r.raison; };

  it('accepte un projet valide', () => expect(raison(octets(JSON.stringify(doc)))).toBeNull());

  it('refuse tout le reste', () => {
    expect(raison(octets(JSON.stringify(doc)), 'projet.json')).toMatch(/nom/);
    expect(raison(new Uint8Array())).toMatch(/taille/);
    expect(raison(new Uint8Array(LIMITES_PAQUET.octetsJson + 1))).toMatch(/taille/);
    expect(raison(new Uint8Array([0xef, 0xbb, 0xbf, ...octets(JSON.stringify(doc))]))).toMatch(/ordre des octets/);
    expect(raison(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]))).toMatch(/illisible/);
    for (const x of ['{}', '[]', 'null', '<html>', JSON.stringify({ ...doc, version: 2 }), JSON.stringify({ ...doc, url: 'https://exemple.test' })]) expect(raison(octets(x))).toMatch(/invalide/);
    const exemple = documentDepuisModele(modeleStudio('hommage-portrait')!, {}, base, mesurer);
    expect(raison(octets(JSON.stringify(exemple)))).toMatch(/exemple/);
  });
});

describe('migration du bucket', () => {
  const lire = (p: string) => readFileSync(join(process.cwd(), 'supabase', p), 'utf8');
  it('additive, idempotente, réversible, sans politique d’accès', () => {
    const sql = lire('migrations/20261125120000_banner_studio_fichiers.sql');
    expect(sql).toContain("array_append(allowed_mime_types, 'application/json')");
    expect(sql).toContain("where id = 'devis'");
    expect(sql).toMatch(/and not \('application\/json' = any/);
    expect(sql).not.toMatch(/create policy|grant |public = true|drop /i);
    expect(lire('rollbacks/20261125120000_banner_studio_fichiers_down.sql')).toContain("array_remove(allowed_mime_types, 'application/json')");
  });
});

/**
 * Banner Studio — projet et images sur l'appareil (audit §4.6).
 *
 * Base IndexedDB **séparée** de celle du textile (`elembo`), dont le ménage supprimerait nos
 * images. Aucune exception ne remonte : sans IndexedDB (navigation privée, quota), l'édition
 * continue en mémoire et l'appelant apprend que rien n'est conservé (`false`).
 *
 * Rien n'est touché au chargement du module : il est aussi importé côté serveur.
 */

import type { DocumentBanner } from './model';
import { lireDocument, type ResultatLecture } from './schema';

const BASE = 'elembo-banner';
const VERSION = 1;
type Magasin = 'projets' | 'assets' | 'meta';

export type AssetStocke = { id: string; blob: Blob };
type Ligne = { id: string } & Record<string, unknown>;

const memoire: Record<Magasin, Map<string, Ligne>> = { projets: new Map(), assets: new Map(), meta: new Map() };
let ouverture: Promise<IDBDatabase | null> | null = null;

function ouvrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  ouverture ??= new Promise<IDBDatabase | null>((fini) => {
    try {
      const r = indexedDB.open(BASE, VERSION);
      r.onupgradeneeded = () => {
        for (const m of ['projets', 'assets', 'meta']) if (!r.result.objectStoreNames.contains(m)) r.result.createObjectStore(m, { keyPath: 'id' });
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          ouverture = null;
        };
        fini(r.result);
      };
      r.onerror = () => fini(null);
      r.onblocked = () => fini(null);
    } catch {
      fini(null);
    }
  });
  return ouverture;
}

async function lire(magasin: Magasin, id: string): Promise<Ligne | null> {
  const db = await ouvrir();
  const local = memoire[magasin].get(id) ?? null;
  if (!db) return local;
  return new Promise((fini) => {
    try {
      const r = db.transaction(magasin).objectStore(magasin).get(id);
      r.onsuccess = () => fini((r.result as Ligne | undefined) ?? local);
      r.onerror = () => fini(local);
    } catch {
      fini(local);
    }
  });
}

/** Écrit plusieurs lignes en une transaction ; `true` seulement si elles sont sur l'appareil. */
async function ecrire(lignes: { magasin: Magasin; ligne: Ligne }[]): Promise<boolean> {
  const db = await ouvrir();
  const enMemoire = () => {
    for (const { magasin, ligne } of lignes) memoire[magasin].set(ligne.id, ligne);
    return false;
  };
  if (!db) return enMemoire();
  return new Promise((fini) => {
    try {
      const t = db.transaction([...new Set(lignes.map((l) => l.magasin))], 'readwrite');
      for (const { magasin, ligne } of lignes) t.objectStore(magasin).put(ligne);
      // Le quota n'est connu qu'à la validation : on attend la transaction, pas la requête.
      t.oncomplete = () => {
        for (const { magasin, ligne } of lignes) memoire[magasin].delete(ligne.id);
        fini(true);
      };
      t.onabort = t.onerror = () => fini(enMemoire());
    } catch {
      fini(enMemoire());
    }
  });
}

export async function enregistrerProjet(doc: DocumentBanner): Promise<boolean> {
  return ecrire([
    { magasin: 'projets', ligne: { id: doc.id, document: doc } },
    { magasin: 'meta', ligne: { id: 'courant', projet: doc.id } },
  ]);
}

async function tout(magasin: Magasin): Promise<Ligne[]> {
  const db = await ouvrir();
  const locales = [...memoire[magasin].values()];
  if (!db) return locales;
  return new Promise((fini) => {
    try {
      const r = db.transaction(magasin).objectStore(magasin).getAll();
      r.onsuccess = () => fini([...(r.result as Ligne[]).filter((l) => !memoire[magasin].has(l.id)), ...locales]);
      r.onerror = () => fini(locales);
    } catch {
      fini(locales);
    }
  });
}

async function effacer(lignes: { magasin: Magasin; id: string }[]): Promise<void> {
  for (const { magasin, id } of lignes) memoire[magasin].delete(id);
  const db = await ouvrir();
  if (!db) return;
  await new Promise<void>((fini) => {
    try {
      const t = db.transaction([...new Set(lignes.map((l) => l.magasin))], 'readwrite');
      for (const { magasin, id } of lignes) t.objectStore(magasin).delete(id);
      t.oncomplete = t.onabort = t.onerror = () => fini();
    } catch {
      fini();
    }
  });
}

export async function lireProjet(id: string): Promise<ResultatLecture | null> {
  const ligne = await lire('projets', id);
  return ligne ? lireDocument(ligne.document) : null;
}

/** Dernier projet ouvert : `null` s'il n'y en a pas, sinon le résultat de la lecture tolérante. */
export async function lireProjetCourant(): Promise<ResultatLecture | null> {
  const courant = await lire('meta', 'courant');
  return typeof courant?.projet === 'string' ? lireProjet(courant.projet) : null;
}

export const poserCourant = (projet: string) => ecrire([{ magasin: 'meta', ligne: { id: 'courant', projet } }]);

export type Envoi = { reference: string; le: string };
export type ResumeProjet = { id: string; nom: string; modifieLe: string; document: DocumentBanner | null; envoi: Envoi | null };

/** Projets de l'appareil, du plus récent au plus ancien ; un projet illisible reste listé. */
export async function listerProjets(): Promise<ResumeProjet[]> {
  const [projets, meta] = await Promise.all([tout('projets'), tout('meta')]);
  const texte = (v: unknown) => (typeof v === 'string' ? v : '');
  return projets
    .map((p) => {
      const r = lireDocument(p.document);
      const brut = (p.document ?? {}) as Record<string, unknown>;
      const envoi = meta.find((m) => m.id === `envoi:${p.id}`);
      return {
        id: p.id,
        nom: r.ok ? r.document.nom : texte(brut.nom) || 'Projet illisible',
        modifieLe: r.ok ? r.document.modifieLe : texte(brut.modifieLe),
        document: r.ok ? r.document : null,
        envoi: envoi ? { reference: texte(envoi.reference), le: texte(envoi.le) } : null,
      };
    })
    .sort((a, b) => b.modifieLe.localeCompare(a.modifieLe));
}

export async function supprimerProjet(id: string): Promise<void> {
  const courant = await lire('meta', 'courant');
  await effacer([
    { magasin: 'projets', id },
    { magasin: 'meta', id: `paquet:${id}` },
    { magasin: 'meta', id: `envoi:${id}` },
    ...(courant?.projet === id ? [{ magasin: 'meta' as const, id: 'courant' }] : []),
  ]);
}

/** Aperçu produit dans le Studio au moment de finaliser, avec la version du document qu'il montre. */
export type Paquet = { modifieLe: string; apercu: Blob };
export const enregistrerPaquet = (projet: string, p: Paquet) => ecrire([{ magasin: 'meta', ligne: { id: `paquet:${projet}`, ...p } }]);
export async function lirePaquet(projet: string): Promise<Paquet | null> {
  const l = await lire('meta', `paquet:${projet}`);
  return l?.apercu instanceof Blob && typeof l.modifieLe === 'string' ? { modifieLe: l.modifieLe, apercu: l.apercu } : null;
}

export const marquerEnvoye = (projet: string, reference: string) => ecrire([{ magasin: 'meta', ligne: { id: `envoi:${projet}`, reference, le: new Date().toISOString() } }]);

export const enregistrerAsset = (id: string, blob: Blob) => ecrire([{ magasin: 'assets', ligne: { id, blob, cree: Date.now() } }]);

export async function lireAsset(id: string): Promise<Blob | null> {
  const l = await lire('assets', id);
  return l?.blob instanceof Blob ? l.blob : null;
}

/** Identifiants d'images cités dans un document, même illisible : le ménage ne doit rien perdre. */
export function assetsCites(document: unknown): string[] {
  const liste = (document as { assets?: unknown } | null)?.assets;
  return Array.isArray(liste) ? liste.map((a) => (a as { id?: unknown } | null)?.id).filter((id): id is string => typeof id === 'string') : [];
}

/** Délai avant ménage : un autre onglet peut tenir une image dans un projet pas encore enregistré. */
export const DELAI_MENAGE_MS = 24 * 3600 * 1000;

/**
 * Supprime les images anciennes qu'aucun projet ne cite. À n'appeler qu'à l'ouverture, historique
 * vide : en cours d'édition, « annuler » peut encore rappeler une image retirée.
 */
export async function menage(): Promise<number> {
  const db = await ouvrir();
  if (!db) return 0;
  return new Promise((fini) => {
    try {
      let n = 0;
      const t = db.transaction(['projets', 'assets'], 'readwrite');
      const projets = t.objectStore('projets').getAll();
      projets.onsuccess = () => {
        const gardes = new Set((projets.result as Ligne[]).flatMap((p) => assetsCites(p.document)));
        // Curseur : on ne charge pas toutes les images en mémoire.
        const curseur = t.objectStore('assets').openCursor();
        curseur.onsuccess = () => {
          const c = curseur.result;
          if (!c) return;
          const a = c.value as Ligne;
          if (!gardes.has(a.id) && Date.now() - Number(a.cree ?? 0) > DELAI_MENAGE_MS) {
            c.delete();
            n++;
          }
          c.continue();
        };
      };
      t.oncomplete = () => fini(n);
      t.onabort = t.onerror = () => fini(0);
    } catch {
      fini(0);
    }
  });
}

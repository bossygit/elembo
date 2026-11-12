/**
 * Stockage local des fichiers du configurateur (images déposées par l'utilisateur).
 *
 * POURQUOI INDEXEDDB : les object URLs (`blob:`) ne survivent pas à un rechargement de page.
 * Pour retrouver un projet — et surtout ses images — après un refresh ou depuis le panier,
 * il faut conserver les Blobs sur l'appareil. `localStorage` ne sait stocker que des chaînes
 * et son quota (~5 Mo) est bien trop petit pour plusieurs photos ; IndexedDB accepte les
 * Blobs et un volume plus large. C'est donc le seul choix raisonnable ici.
 *
 * POURQUOI UN REPLI MÉMOIRE : IndexedDB n'existe pas côté serveur (SSR), peut être refusé
 * (navigation privée, cookies bloqués, iframe restreinte) ou échouer en écriture (quota).
 * Dans ces cas le configurateur doit continuer à fonctionner pendant la session : on garde
 * les assets dans une `Map` en mémoire. On perd la persistance, jamais l'édition.
 *
 * RÈGLE D'OR : aucune exception ne remonte au composant. Chaque fonction publique attrape
 * tout et répond `null` / `false` : l'interface peut toujours afficher un état dégradé.
 *
 * IMPORTANT (SSR) : ce module est importé côté serveur aussi. On ne touche donc JAMAIS à
 * `window`, `indexedDB` ou `URL` au chargement du module — uniquement à l'intérieur des
 * fonctions, toujours derrière un `typeof`.
 */

/** Un fichier conservé sur l'appareil, avec les métadonnées nécessaires au canvas. */
export type StoredAsset = {
  id: string;
  blob: Blob;
  name: string;
  width: number;
  height: number;
  type: string;
};

const NOM_BASE = 'elembo';
const VERSION_BASE = 1;
const NOM_STORE = 'assets';

/**
 * Repli mémoire, utilisé quand IndexedDB est absent ou refuse l'écriture (SSR, navigation
 * privée, quota). La `Map` est créée au chargement mais ne contient aucune donnée : elle ne
 * dépend d'aucune API navigateur, c'est donc sans danger côté serveur.
 */
const memoire = new Map<string, StoredAsset>();

/** URLs d'objet déjà créées, par id — évite de fuiter une URL à chaque lecture. */
const urls = new Map<string, string>();

/**
 * Ouverture paresseuse et unique de la base. On mémorise la promesse : ouvrir IndexedDB à
 * chaque appel serait coûteux, et un échec (navigation privée) ne doit pas être retenté en
 * boucle. `null` = IndexedDB inutilisable, on passe par le repli mémoire.
 */
let ouverture: Promise<IDBDatabase | null> | null = null;

function ouvrirBase(): Promise<IDBDatabase | null> {
  // `typeof` est le seul accès sûr à `indexedDB` : la variable n'existe pas en Node.
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (ouverture) return ouverture;

  ouverture = new Promise<IDBDatabase | null>((resoudre) => {
    let termine = false;
    const terminer = (db: IDBDatabase | null) => {
      if (termine) return;
      termine = true;
      resoudre(db);
    };

    try {
      const requete = indexedDB.open(NOM_BASE, VERSION_BASE);

      // Première ouverture (ou base effacée par le navigateur) : on crée le store.
      requete.onupgradeneeded = () => {
        const db = requete.result;
        if (!db.objectStoreNames.contains(NOM_STORE)) {
          db.createObjectStore(NOM_STORE, { keyPath: 'id' });
        }
      };
      requete.onsuccess = () => {
        const db = requete.result;
        // `onblocked` a déjà résolu en `null` : cette connexion tardive n'est plus suivie,
        // on la referme pour ne pas la laisser ouverte en arrière-plan.
        if (termine) {
          db.close();
          return;
        }
        // Un autre onglet veut mettre la base à jour : on libère la connexion et on
        // oublie la promesse pour rouvrir à la prochaine utilisation.
        db.onversionchange = () => {
          db.close();
          ouverture = null;
        };
        terminer(db);
      };
      // `onblocked` : un autre onglet bloque l'ouverture. Inutile de faire attendre le
      // composant, le repli mémoire est immédiatement utilisable.
      requete.onerror = () => terminer(null);
      requete.onblocked = () => terminer(null);
    } catch {
      // Accès refusé par le navigateur (mode privé, permissions) : repli mémoire.
      terminer(null);
    }
  });

  return ouverture;
}

/** Génère un identifiant unique, stable à l'échelle de l'appareil. */
function nouvelId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // `crypto` indisponible : on retombe sur l'horodatage ci-dessous.
  }
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validation minimale d'un enregistrement relu : une entrée corrompue (version antérieure,
 * écriture partielle, donnée tierce) ne doit jamais être propagée comme un `StoredAsset`.
 */
function normaliserAsset(brut: unknown): StoredAsset | null {
  if (!brut || typeof brut !== 'object') return null;
  const a = brut as Partial<StoredAsset>;
  if (typeof a.id !== 'string' || a.id.length === 0) return null;
  if (!(a.blob instanceof Blob)) return null;
  if (typeof a.name !== 'string' || typeof a.type !== 'string') return null;
  if (typeof a.width !== 'number' || !Number.isFinite(a.width)) return null;
  if (typeof a.height !== 'number' || !Number.isFinite(a.height)) return null;
  return { id: a.id, blob: a.blob, name: a.name, width: a.width, height: a.height, type: a.type };
}

/** Écrit un asset dans IndexedDB ; la promesse se résout à la validation de la transaction. */
function ecrireDansBase(db: IDBDatabase, asset: StoredAsset): Promise<void> {
  return new Promise<void>((resoudre, rejeter) => {
    try {
      const transaction = db.transaction(NOM_STORE, 'readwrite');
      transaction.oncomplete = () => resoudre();
      transaction.onerror = () => rejeter(transaction.error ?? new Error('écriture IndexedDB refusée'));
      transaction.onabort = () => rejeter(transaction.error ?? new Error('écriture IndexedDB interrompue'));
      transaction.objectStore(NOM_STORE).put(asset);
    } catch (erreur) {
      rejeter(erreur);
    }
  });
}

/** Lit un asset dans IndexedDB ; `null` si l'entrée est absente ou invalide. */
function lireDansBase(db: IDBDatabase, id: string): Promise<StoredAsset | null> {
  return new Promise<StoredAsset | null>((resoudre, rejeter) => {
    try {
      const transaction = db.transaction(NOM_STORE, 'readonly');
      const requete = transaction.objectStore(NOM_STORE).get(id);
      requete.onsuccess = () => resoudre(normaliserAsset(requete.result));
      requete.onerror = () => rejeter(requete.error ?? new Error('lecture IndexedDB refusée'));
    } catch (erreur) {
      rejeter(erreur);
    }
  });
}

/** Supprime un asset d'IndexedDB (transaction courte, résolue à la validation). */
function supprimerDansBase(db: IDBDatabase, id: string): Promise<void> {
  return new Promise<void>((resoudre, rejeter) => {
    try {
      const transaction = db.transaction(NOM_STORE, 'readwrite');
      transaction.oncomplete = () => resoudre();
      transaction.onerror = () => rejeter(transaction.error ?? new Error('suppression IndexedDB refusée'));
      transaction.onabort = () => rejeter(transaction.error ?? new Error('suppression IndexedDB interrompue'));
      transaction.objectStore(NOM_STORE).delete(id);
    } catch (erreur) {
      rejeter(erreur);
    }
  });
}

/**
 * Parcourt les clés du store et supprime celles qui ne sont plus référencées.
 * Renvoie la liste des ids supprimés pour pouvoir révoquer leurs URLs d'objet.
 */
function elaguerDansBase(db: IDBDatabase, idsConserves: Set<string>): Promise<string[]> {
  return new Promise<string[]>((resoudre, rejeter) => {
    const supprimes: string[] = [];
    try {
      const transaction = db.transaction(NOM_STORE, 'readwrite');
      transaction.oncomplete = () => resoudre(supprimes);
      transaction.onerror = () => rejeter(transaction.error ?? new Error('élagage IndexedDB refusé'));
      transaction.onabort = () => rejeter(transaction.error ?? new Error('élagage IndexedDB interrompu'));

      const curseurRequete = transaction.objectStore(NOM_STORE).openKeyCursor();
      curseurRequete.onsuccess = () => {
        const curseur = curseurRequete.result;
        if (!curseur) return; // fin du parcours : la transaction va se valider
        const cle = curseur.key;
        if (typeof cle === 'string' && !idsConserves.has(cle)) {
          transaction.objectStore(NOM_STORE).delete(cle);
          supprimes.push(cle);
        }
        curseur.continue();
      };
      curseurRequete.onerror = () => rejeter(curseurRequete.error ?? new Error('parcours IndexedDB refusé'));
    } catch (erreur) {
      rejeter(erreur);
    }
  });
}

/** Révoque l'URL d'objet d'un asset (sinon le navigateur garde le Blob en mémoire). */
function revoquerUrl(id: string): void {
  const url = urls.get(id);
  if (!url) return;
  urls.delete(id);
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Rien à faire : l'URL est de toute façon oubliée côté applicatif.
  }
}

/** Vrai si le stockage durable (IndexedDB) semble disponible dans ce contexte. */
export function assetStoreDisponible(): boolean {
  try {
    // Test purement synchrone : on ne peut pas attendre l'ouverture réelle de la base ici.
    // `false` signifie donc « repli mémoire seulement » (SSR, navigation privée).
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Enregistre un Blob et renvoie son id, ou `null` si l'entrée est invalide.
 * En cas d'échec d'IndexedDB, l'asset est conservé en mémoire : le configurateur garde son
 * image pour la session, elle ne sera simplement pas retrouvée après rechargement.
 */
export async function putAsset(
  blob: Blob,
  meta: { name: string; width: number; height: number },
): Promise<string | null> {
  if (!(blob instanceof Blob)) return null;
  if (
    !meta ||
    typeof meta.name !== 'string' ||
    typeof meta.width !== 'number' ||
    typeof meta.height !== 'number' ||
    !Number.isFinite(meta.width) ||
    !Number.isFinite(meta.height)
  ) {
    return null;
  }

  const id = nouvelId();
  const asset: StoredAsset = {
    id,
    blob,
    name: meta.name,
    width: meta.width,
    height: meta.height,
    type: blob.type,
  };

  try {
    const db = await ouvrirBase();
    if (db) {
      await ecrireDansBase(db, asset);
      return id;
    }
  } catch {
    // Quota, base fermée, transaction avortée : on bascule sur le repli mémoire.
  }

  memoire.set(id, asset);
  return id;
}

/** Relit un asset par id ; `null` s'il n'existe pas (ou plus) sur cet appareil. */
export async function getAsset(id: string): Promise<StoredAsset | null> {
  if (typeof id !== 'string' || id.length === 0) return null;

  try {
    const db = await ouvrirBase();
    if (db) {
      const asset = await lireDansBase(db, id);
      if (asset) return asset;
    }
  } catch {
    // Lecture IndexedDB impossible : on regarde dans le repli mémoire.
  }

  return memoire.get(id) ?? null;
}

/**
 * Renvoie une URL d'objet (`blob:`) utilisable par le canvas / Three.js.
 * L'URL est mise en cache par id : un même élément image n'en crée qu'une seule.
 */
export async function getAssetUrl(id: string): Promise<string | null> {
  const existante = urls.get(id);
  if (existante) return existante;

  const asset = await getAsset(id);
  if (!asset) return null;

  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const url = URL.createObjectURL(asset.blob);
    urls.set(id, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Supprime un asset et révoque son URL d'objet. Best effort : ne jette jamais.
 * À appeler quand un élément image est retiré du design.
 */
export async function supprimerAsset(id: string): Promise<void> {
  if (typeof id !== 'string' || id.length === 0) return;

  revoquerUrl(id);
  memoire.delete(id);

  try {
    const db = await ouvrirBase();
    if (db) await supprimerDansBase(db, id);
  } catch {
    // L'asset est déjà oublié côté applicatif ; une suppression IndexedDB ratée sera
    // rattrapée par `elaguerAssets` au prochain passage.
  }
}

/**
 * Supprime tous les assets qui ne sont plus référencés par le design et le panier.
 * À appeler après une sauvegarde ou au chargement d'un projet : sans cela, les vieilles
 * images s'accumulent dans IndexedDB jusqu'à saturer le quota du navigateur.
 */
export async function elaguerAssets(idsConserves: string[]): Promise<void> {
  const conserves = new Set(idsConserves.filter((id) => typeof id === 'string' && id.length > 0));

  // Le repli mémoire est élagué en premier : c'est le seul stockage garanti.
  for (const id of [...memoire.keys()]) {
    if (conserves.has(id)) continue;
    memoire.delete(id);
    revoquerUrl(id);
  }

  try {
    const db = await ouvrirBase();
    if (!db) return;
    const supprimes = await elaguerDansBase(db, conserves);
    for (const id of supprimes) revoquerUrl(id);
  } catch {
    // Élagage IndexedDB impossible : il sera retenté au prochain appel.
  }
}

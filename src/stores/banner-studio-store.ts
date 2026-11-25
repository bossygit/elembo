/**
 * Banner Studio — état de l'éditeur : document, sélection, historique, vue, sauvegarde.
 * Store indépendant du configurateur textile. Ce qui dépend du navigateur (mesure du texte,
 * stockage, horloge) est injecté, pour être testé sans DOM.
 */

import { createStore } from 'zustand/vanilla';

import { evaluer, zones, type Alerte } from '@/lib/banner/constraints';
import * as op from '@/lib/banner/edition';
import type { ModeAlignement } from '@/lib/banner/geometry';
import { annuler, enregistrer, historiqueVide, retablir, type Historique } from '@/lib/banner/historique';
import {
  creerDocument, creerForme, creerImage, creerTexte,
  type Asset, type DocumentBanner, type Element, type FinitionStudio, type NatureForme, type StyleTexte, type SupportStudio,
} from '@/lib/banner/model';
import type { Mesureur } from '@/lib/banner/polices';
import { BORNES, type ResultatLecture } from '@/lib/banner/schema';
import { ajuster, contenir, zoomer, type Cadre, type Vue } from '@/lib/banner/vue';

export const AUTOSAVE_MS = 800;

export type EtatSauvegarde = 'vierge' | 'modifie' | 'enregistrement' | 'enregistre' | 'memoire';

export type Dependances = {
  mesurer: Mesureur;
  enregistrer: (doc: DocumentBanner) => Promise<boolean>;
  id?: () => string;
  maintenant?: () => number;
};

export type EtatStudio = {
  document: DocumentBanner;
  selection: string | null;
  historique: Historique<DocumentBanner>;
  alertes: Alerte[];
  vue: Vue;
  cadre: Cadre;
  /** La vue suit l'écran tant que l'utilisateur n'a ni zoomé ni déplacé. */
  vueAjustee: boolean;
  reperes: boolean;
  sauvegarde: EtatSauvegarde;
  message: string | null;
  /** Images réellement disponibles (null tant que le chargement n'est pas fini). */
  disponibles: Set<string> | null;
  charge: boolean;

  ouvrir: (lecture: ResultatLecture | null) => void;
  nouveau: () => void;
  annoncer: (message: string | null) => void;
  declarerImage: (id: string) => void;
  chargementFini: () => void;

  selectionner: (id: string | null) => void;
  annuler: () => void;
  retablir: () => void;

  ajouterTexte: () => void;
  ajouterForme: (nature: NatureForme) => void;
  ajouterImage: (asset: Asset) => boolean;
  supprimer: (id?: string) => void;
  dupliquer: (id?: string) => void;
  reordonner: (id: string, vers: op.Ordre) => void;
  decaler: (dx: number, dy: number) => void;
  aligner: (mode: ModeAlignement) => void;
  poserGeometrie: (id: string, g: op.Geometrie, fusion?: string) => void;
  poserElement: (element: Element) => void;
  poserProprietes: (id: string, p: Parameters<typeof op.poserProprietes>[2]) => void;
  poserTexte: (id: string, style: Partial<StyleTexte>) => void;
  poserForme: (id: string, f: Parameters<typeof op.poserForme>[2]) => void;
  poserAjustement: (id: string, a: 'cover' | 'contain') => void;
  poserFond: (couleur: string) => void;
  poserNom: (nom: string) => void;
  poserSupport: (support: SupportStudio, finition: FinitionStudio) => void;
  poserFormat: (largeurMm: number, hauteurMm: number) => void;

  poserCadre: (cadre: Cadre) => void;
  poserVue: (vue: Vue) => void;
  zoomer: (facteur: number, ancre?: { x: number; y: number }) => void;
  ajusterVue: () => void;
  basculerReperes: () => void;
  enregistrerMaintenant: () => Promise<void>;
};

const MESSAGES: Record<Exclude<Extract<ResultatLecture, { ok: false }>['erreur'], never>, string> = {
  JSON_INVALIDE: 'Votre dernier projet est illisible. Il est conservé sur cet appareil ; voici un plan de travail vierge.',
  DOCUMENT_INVALIDE: 'Votre dernier projet contient des données invalides. Il est conservé sur cet appareil ; voici un plan de travail vierge.',
  SCHEMA_INCONNU: 'Votre dernier projet n’est pas une banderole Elembo. Il est conservé sur cet appareil ; voici un plan de travail vierge.',
  VERSION_INCONNUE: 'Votre dernier projet vient d’une version non reconnue. Il est conservé sur cet appareil ; voici un plan de travail vierge.',
  VERSION_FUTURE: 'Votre dernier projet vient d’une version plus récente du Studio. Rechargez la page ; il est conservé sur cet appareil.',
};

export function documentInitial(id?: () => string): DocumentBanner {
  return op.poserSupport(creerDocument({ support: 'BANDEROLE', largeurMm: 3000, hauteurMm: 1000 }, id ? { id } : {}), 'BANDEROLE', 'OEILLETS');
}

export function creerStudio({ mesurer, enregistrer: persister, id = () => globalThis.crypto.randomUUID(), maintenant = Date.now }: Dependances) {
  return createStore<EtatStudio>()((set, get) => {
    let minuterie: ReturnType<typeof setTimeout> | null = null;
    let ecriture: Promise<void> = Promise.resolve();

    // Les profils publics ne sont pas validés par un imprimeur : le préflight le rappelle.
    const preflight = (d: DocumentBanner, disponibles: Set<string> | null) =>
      evaluer(d, { statutProfil: 'A_VALIDER', assetsDisponibles: disponibles ?? undefined });

    const programmer = () => {
      if (minuterie) clearTimeout(minuterie);
      minuterie = setTimeout(() => void get().enregistrerMaintenant(), AUTOSAVE_MS);
    };

    /** Remplace le document sans toucher à l'historique (annuler, rétablir). */
    const installer = (doc: DocumentBanner, reste: Partial<EtatStudio> = {}) => {
      const { selection, disponibles, cadre, vue, vueAjustee, document } = get();
      const memeFormat = document.dimensions.largeurMm === doc.dimensions.largeurMm && document.dimensions.hauteurMm === doc.dimensions.hauteurMm;
      set({
        document: doc,
        alertes: preflight(doc, disponibles),
        selection: op.trouver(doc, reste.selection === undefined ? selection : reste.selection) ? (reste.selection === undefined ? selection : reste.selection) : null,
        sauvegarde: 'modifie',
        ...(memeFormat && !vueAjustee ? { vue } : { vue: ajuster(cadre, doc.dimensions), vueAjustee: true }),
        ...Object.fromEntries(Object.entries(reste).filter(([k]) => k !== 'selection')),
      });
      programmer();
    };

    /** Applique une opération ; ne fait rien si elle renvoie le même document. */
    const appliquer = (f: (d: DocumentBanner) => DocumentBanner, { fusion = null, selection }: { fusion?: string | null; selection?: string | null } = {}) => {
      const avant = get().document;
      const apres = f(avant);
      if (apres === avant) return;
      const instant = maintenant();
      installer({ ...apres, modifieLe: new Date(instant).toISOString() }, { historique: enregistrer(get().historique, avant, instant, fusion), ...(selection === undefined ? {} : { selection }) });
    };

    const initial = documentInitial(id);
    const cadreInitial = { largeur: 800, hauteur: 500 };
    return {
      document: initial,
      selection: null,
      historique: historiqueVide(),
      alertes: preflight(initial, null),
      vue: ajuster(cadreInitial, initial.dimensions),
      cadre: cadreInitial,
      vueAjustee: true,
      reperes: true,
      sauvegarde: 'vierge',
      message: null,
      disponibles: null,
      charge: false,

      ouvrir: (lecture) => {
        if (!lecture) return;
        if (!lecture.ok) {
          // Le projet illisible garde son identifiant : un nouveau document ne l'écrase pas.
          set({ message: MESSAGES[lecture.erreur] });
          return;
        }
        const d = lecture.document;
        set({ document: d, selection: null, historique: historiqueVide(), alertes: preflight(d, get().disponibles), sauvegarde: 'enregistre', vue: ajuster(get().cadre, d.dimensions), vueAjustee: true });
      },
      nouveau: () => {
        const d = documentInitial(id);
        set({ historique: historiqueVide(), selection: null, vueAjustee: true });
        installer(d, { selection: null });
      },
      annoncer: (message) => set({ message }),
      declarerImage: (idImage) => {
        const disponibles = new Set(get().disponibles ?? []).add(idImage);
        set({ disponibles, alertes: preflight(get().document, get().charge ? disponibles : null) });
      },
      chargementFini: () => {
        const disponibles = get().disponibles ?? new Set<string>();
        set({ charge: true, disponibles, alertes: preflight(get().document, disponibles) });
      },

      selectionner: (idElement) => {
        if (get().selection !== idElement) set({ selection: op.trouver(get().document, idElement) ? idElement : null });
      },
      annuler: () => {
        const r = annuler(get().historique, get().document);
        if (r) installer(r.present, { historique: r.historique });
      },
      retablir: () => {
        const r = retablir(get().historique, get().document);
        if (r) installer(r.present, { historique: r.historique });
      },

      ajouterTexte: () => {
        const e = creerTexte(get().document, 'Votre texte', { id });
        appliquer((d) => op.ajouter(d, op.ajusterCadre(e, mesurer)), { selection: e.id });
      },
      ajouterForme: (nature) => {
        const e = creerForme(get().document, nature, { id });
        appliquer((d) => op.ajouter(d, e), { selection: e.id });
      },
      ajouterImage: (asset) => {
        const d = get().document;
        if (d.assets.length >= BORNES.assetsMax || d.elements.length >= BORNES.elementsMax) return false;
        const e = creerImage(d, asset, { id });
        // Une image très large est ramenée dans le format.
        const k = Math.min(1, (d.dimensions.largeurMm * 0.9) / e.largeurMm);
        appliquer((x) => op.ajouter({ ...x, assets: [...x.assets, asset] }, {
          ...e,
          largeurMm: op.arrondir(e.largeurMm * k),
          hauteurMm: op.arrondir(e.hauteurMm * k),
          // Le cadre reste toujours rempli : étirer un bord recadre, sans bande vide.
          image: { ...e.image, ajustement: 'cover' },
        }), { selection: e.id });
        return true;
      },
      supprimer: (cible = get().selection ?? undefined) => cible && appliquer((d) => op.supprimer(d, cible)),
      dupliquer: (cible = get().selection ?? undefined) => {
        if (!cible) return;
        const copie = id();
        appliquer((d) => op.dupliquer(d, cible, copie), { selection: copie });
      },
      reordonner: (cible, vers) => appliquer((d) => op.reordonner(d, cible, vers)),
      decaler: (dx, dy) => {
        const e = op.trouver(get().document, get().selection);
        if (e && !e.verrouille) appliquer((d) => op.deplacer(d, e.id, e.xMm + dx, e.yMm + dy), { fusion: `fleches:${e.id}` });
      },
      aligner: (mode) => {
        const { selection } = get();
        if (selection) appliquer((d) => op.alignerElement(d, selection, zones(d).zoneSure, mode));
      },
      poserGeometrie: (cible, g, fusion) => appliquer((d) => op.poserGeometrie(d, cible, g, mesurer), { fusion: fusion ? `${fusion}:${cible}` : null }),
      poserElement: (e) => appliquer((d) => op.remplacer(d, e.id, (x) => (x.verrouille ? x : { ...e, rotationDeg: op.normaliserAngle(e.rotationDeg) }))),
      poserProprietes: (cible, p) => appliquer((d) => op.poserProprietes(d, cible, p), { fusion: p.opacite !== undefined ? `opacite:${cible}` : p.nom !== undefined ? `nom:${cible}` : null }),
      poserTexte: (cible, style) => appliquer((d) => op.poserTexte(d, cible, style, mesurer), { fusion: `texte:${Object.keys(style).join(',')}:${cible}` }),
      poserForme: (cible, f) => appliquer((d) => op.poserForme(d, cible, f), { fusion: `forme:${cible}` }),
      poserAjustement: (cible, a) => appliquer((d) => op.poserAjustement(d, cible, a)),
      poserFond: (couleur) => appliquer((d) => ({ ...d, fond: { type: 'couleur', couleur } }), { fusion: 'fond' }),
      poserNom: (nom) => nom.trim() && appliquer((d) => ({ ...d, nom: nom.slice(0, BORNES.nomMax) }), { fusion: 'nom' }),
      poserSupport: (support, finition) => appliquer((d) => op.poserSupport(d, support, finition)),
      poserFormat: (l, h) => appliquer((d) => op.poserFormat(d, l, h, mesurer)),

      poserCadre: (cadre) => {
        const { vueAjustee, vue, document } = get();
        set({ cadre, vue: vueAjustee ? ajuster(cadre, document.dimensions) : contenir(vue, cadre, document.dimensions) });
      },
      poserVue: (vue) => set({ vue: contenir(vue, get().cadre, get().document.dimensions), vueAjustee: false }),
      zoomer: (facteur, ancre) => {
        const { vue, cadre, document } = get();
        set({ vue: zoomer(vue, facteur, ancre ?? { x: cadre.largeur / 2, y: cadre.hauteur / 2 }, cadre, document.dimensions), vueAjustee: false });
      },
      ajusterVue: () => set({ vue: ajuster(get().cadre, get().document.dimensions), vueAjustee: true }),
      basculerReperes: () => set({ reperes: !get().reperes }),

      enregistrerMaintenant: () => {
        if (minuterie) clearTimeout(minuterie);
        minuterie = null;
        // Écritures en file : une version ancienne ne peut pas arriver après une récente.
        ecriture = ecriture.then(async () => {
          const doc = get().document;
          set({ sauvegarde: 'enregistrement' });
          const ok = await persister(doc);
          if (get().document === doc) set({ sauvegarde: ok ? 'enregistre' : 'memoire' });
          else if (get().sauvegarde === 'enregistrement') set({ sauvegarde: 'modifie' });
        });
        return ecriture;
      },
    };
  });
}

export type StudioStore = ReturnType<typeof creerStudio>;

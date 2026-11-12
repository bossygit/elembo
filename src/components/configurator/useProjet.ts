'use client';

// Persistance du travail en cours : brouillon automatique, sauvegarde explicite, panier.
//
// Le configurateur est un studio : perdre une composition en fermant l'onglet serait un
// défaut rédhibitoire. On écrit donc un BROUILLON (localStorage) après chaque modification,
// débouncé. Les FICHIERS d'image, eux, sont conservés dans IndexedDB (`assetId`) : le
// brouillon ne contient que la mise en page, jamais les octets.
//
// À la réouverture, le brouillon est restauré et les images sont ré-attachées depuis
// IndexedDB par leur `assetId` : l'utilisateur retrouve son travail à l'identique.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { CATALOG, getProductById } from '../../lib/products/catalog';
import { formatFcfa } from '../../lib/order/order';
import { getAssetUrl, elaguerAssets } from '../../lib/storage/asset-store';
import {
  ajouterAuPanier,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
  listerPanier,
  listerProjets,
  sauverProjet,
} from '../../lib/projects/project-storage';
import type { ProjetSauvegarde } from '../../lib/projects/project-storage';
import type { DesignElement } from '../../types/configurator';
import { apercuProjet } from '../../lib/projects/preview';
import { useElementImages } from './useElementImages';

export type MessageProjet = { ton: 'ok' | 'erreur'; texte: string } | null;

function identifiant(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `projet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function maintenant(): string {
  return new Date().toISOString();
}

/** Lit le travail en cours sur l'appareil et le charge dans le store. */
export function restaurerTravail(): { ok: boolean; avertissement: string | null } {
  const brouillon = lireBrouillon();
  if (!brouillon) return { ok: false, avertissement: null };
  const resultat = useConfiguratorStore.getState().loadConfig(brouillon.config);
  if (!resultat.ok) return { ok: false, avertissement: resultat.errors.join(' · ') };
  return { ok: true, avertissement: resultat.warnings.join(' · ') || null };
}

/** Ré-attache les images conservées dans IndexedDB (après un rechargement ou un panier). */
export async function reattacherImages(): Promise<number> {
  const state = useConfiguratorStore.getState();
  let restaurees = 0;
  for (const element of state.elements) {
    if (element.type !== 'image' || !element.assetId) continue;
    const url = await getAssetUrl(element.assetId);
    if (url) {
      useConfiguratorStore.getState().setImageSource(element.id, url);
      restaurees++;
    }
  }
  return restaurees;
}

export function useProjet() {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const elements = useConfiguratorStore((s) => s.elements);
  const images = useElementImages(elements);
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const [pret, setPret] = useState(false);
  const [message, setMessage] = useState<MessageProjet>(null);
  const [nombrePanier, setNombrePanier] = useState(0);
  const [reprise, setReprise] = useState(false);
  const [enregistreLe, setEnregistreLe] = useState<string | null>(null);
  const projetId = useRef<string>(identifiant());
  const creeLe = useRef<string>(maintenant());

  // Restauration au montage : brouillon puis images d'IndexedDB. C'est une synchronisation
  // avec un système EXTERNE (stockage du navigateur), d'où les écritures d'état ici.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let actif = true;
    const restauration = restaurerTravail();
    if (restauration.ok) {
      setReprise(true);
      setNombrePanier(listerPanier().length);
      void reattacherImages().then((n) => {
        if (actif && n > 0) {
          setMessage({ ton: 'ok', texte: `${n} image(s) restaurée(s) depuis cet appareil.` });
        }
      });
    } else {
      setNombrePanier(listerPanier().length);
    }
    setPret(true);
    return () => {
      actif = false;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Efface le message après quelques secondes.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  // Brouillon automatique : une seule écriture après 900 ms de calme.
  useEffect(() => {
    if (!pret) return;
    const timer = setTimeout(() => {
      const state = useConfiguratorStore.getState();
      const product = getProductById(state.productId);
      const projet: ProjetSauvegarde = {
        id: 'brouillon',
        nom: product?.name ?? 'Création Elembo',
        creeLe: creeLe.current,
        modifieLe: maintenant(),
        config: state.serialize(),
        prixFcfa: product?.priceFcfa ?? null,
      };
      ecrireBrouillon(projet);
    }, 900);
    return () => clearTimeout(timer);
  }, [pret, productId, color, profileId, elements]);

  /** Construit le projet sérialisable courant (avec aperçu facultatif). */
  const construire = useCallback(
    async (avecApercu: boolean): Promise<ProjetSauvegarde | null> => {
      const state = useConfiguratorStore.getState();
      const product = getProductById(state.productId);
      if (!product) return null;
      const config = state.serialize();
      const apercu = avecApercu
        ? await apercuProjet({
            config,
            elements: state.elements,
            images: imagesRef.current,
            measure: state.measure,
          })
        : undefined;
      return {
        id: identifiant(),
        nom: `${product.name} — ${new Date().toLocaleDateString('fr-FR')}`,
        creeLe: maintenant(),
        modifieLe: maintenant(),
        config,
        ...(apercu ? { apercu } : {}),
        prixFcfa: product.priceFcfa ?? null,
      };
    },
    [],
  );

  /** Enregistre la création dans « Mes créations » (remplace l'entrée si déjà enregistrée). */
  const enregistrer = useCallback(async () => {
    const projet = await construire(true);
    if (!projet) {
      setMessage({ ton: 'erreur', texte: 'Impossible de sauvegarder : produit inconnu.' });
      return;
    }
    const entree: ProjetSauvegarde = {
      ...projet,
      id: projetId.current,
      creeLe: creeLe.current,
      modifieLe: maintenant(),
    };
    if (sauverProjet(entree)) {
      setEnregistreLe(entree.modifieLe);
      setMessage({ ton: 'ok', texte: 'Création enregistrée sur cet appareil.' });
      void elaguerAssets(assetsAConserver());
    } else {
      setMessage({
        ton: 'erreur',
        texte: 'Enregistrement refusé : le stockage du navigateur est plein. Supprimez une création.',
      });
    }
  }, [construire]);

  /** Ajoute la création au panier en conservant toutes les personnalisations. */
  const ajouterLePanier = useCallback(async () => {
    const projet = await construire(true);
    if (!projet) {
      setMessage({ ton: 'erreur', texte: 'Impossible d’ajouter au panier : produit inconnu.' });
      return;
    }
    if (ajouterAuPanier(projet)) {
      setNombrePanier(listerPanier().length);
      setMessage({
        ton: 'ok',
        texte: `Ajouté au panier — ${formatFcfa(projet.prixFcfa ?? null)} l’unité, couleur et zones conservées.`,
      });
      // Le brouillon reste en place : le client peut continuer à modifier, le panier garde
      // une copie figée de ce qui a été ajouté.
      void elaguerAssets(assetsAConserver());
    } else {
      setMessage({
        ton: 'erreur',
        texte: 'Panier non enregistré : le stockage du navigateur est plein ou indisponible.',
      });
    }
  }, [construire]);

  /**
   * Ouvre l'atelier sur un autre produit (lien « ?produit= » de la boutique, ou changement de
   * support dans le studio). Le travail en cours n'est jamais perdu : s'il contient des
   * éléments, il est rangé dans « Mes créations » avant de démarrer un projet vierge.
   */
  const ouvrirProduit = useCallback(
    async (id: string) => {
      const state = useConfiguratorStore.getState();
      const cible = getProductById(id);
      if (!cible || id === state.productId) return;
      let misDeCote = false;
      if (state.elements.length > 0) {
        const projet = await construire(false);
        if (projet) {
          misDeCote = sauverProjet({ ...projet, id: projetId.current, creeLe: creeLe.current, modifieLe: maintenant() });
        }
      }
      const store = useConfiguratorStore.getState();
      store.reset();
      store.setProduct(id);
      projetId.current = identifiant();
      creeLe.current = maintenant();
      setEnregistreLe(null);
      setReprise(false);
      setMessage({
        ton: 'ok',
        texte: misDeCote
          ? `Nouvelle création : ${cible.name}. Votre création précédente est rangée dans « Mes créations ».`
          : `Nouvelle création : ${cible.name}.`,
      });
    },
    [construire],
  );

  // Lien direct vers un produit (`/personnalisation?produit=mug-personnalise`) : traité une
  // fois, APRÈS la restauration du brouillon, puis retiré de l'URL pour qu'un rechargement ne
  // rebascule pas le studio. Lu côté client : la page reste exportable en statique.
  const lienTraite = useRef(false);
  useEffect(() => {
    if (!pret || lienTraite.current || typeof window === 'undefined') return;
    // Différé (et annulable) : en mode strict, React monte deux fois — le lien n'est traité
    // qu'une seule fois, par le montage qui reste.
    const timer = setTimeout(() => {
      lienTraite.current = true;
      const url = new URL(window.location.href);
      const demande = url.searchParams.get('produit');
      if (!demande) return;
      url.searchParams.delete('produit');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      if (CATALOG.some((p) => p.id === demande)) void ouvrirProduit(demande);
    }, 0);
    return () => clearTimeout(timer);
  }, [pret, ouvrirProduit]);

  /** Nouvelle création vierge (le panier n'est pas touché). */
  const nouvelleCreation = useCallback(() => {
    effacerBrouillon();
    useConfiguratorStore.getState().reset();
    useConfiguratorStore.getState().setProduct(useConfiguratorStore.getState().productId);
    projetId.current = identifiant();
    creeLe.current = maintenant();
    setEnregistreLe(null);
    setReprise(false);
    setMessage({ ton: 'ok', texte: 'Nouvelle création vierge. Le panier est conservé.' });
  }, []);

  return {
    pret,
    reprise,
    message,
    remettreMessage: setMessage,
    nombrePanier,
    enregistreLe,
    enregistrer,
    ajouterLePanier,
    nouvelleCreation,
    ouvrirProduit,
  };
}

/** Identifiants des images référencées par une liste d'éléments. */
function idsImages(elements: DesignElement[]): string[] {
  return elements.flatMap((el) => (el.type === 'image' && el.assetId ? [el.assetId] : []));
}

/**
 * Fichiers d'image encore référencés : création courante + panier + créations
 * enregistrées. On ne supprime JAMAIS un fichier qu'un panier ou une commande pourrait
 * encore demander.
 */
function assetsAConserver(): string[] {
  const ids = new Set(idsImages(useConfiguratorStore.getState().elements));
  for (const projet of [...listerPanier(), ...listerProjets()]) {
    for (const element of projet.config.elements) {
      if (element.type === 'image' && element.assetId) ids.add(element.assetId);
    }
  }
  return [...ids];
}

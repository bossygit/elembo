'use client';

// LE STUDIO — coquille du configurateur textile Elembo.
//
// Organisation (desktop) : grande scène 3D à gauche, panneau d'outils à droite, rail de
// zones sous la scène, prix et action panier toujours visibles en bas du panneau.
// Mobile : la scène se colle sous l'en-tête, le panneau défile dessous par onglets.
//
// Le studio ne réimplémente RIEN : il assemble les briques déjà testées (store Zustand,
// éditeur canvas, textures 3D, profils de production, tunnel de commande existant).

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getProductById, productSides, resolveModelUrl } from '../../lib/products/catalog';
import { profilParId } from '../../lib/products/production';
import { facesToProduce, formatFcfa } from '../../lib/order/order';
import { assetStoreDisponible } from '../../lib/storage/asset-store';
import { SIDE_LABELS, SIDE_SHORT } from '../../types/configurator';
import { Bag, Check, ImageIcon, TextIcon, Trash } from '../site/Icons';
import DesignPanel from './DesignPanel';
import ElementControls from './ElementControls';
import ExportPanel from './ExportPanel';
import HistoryControls from './HistoryControls';
import OrderPanel from './OrderPanel';
import ProductColorSelector from './ProductColorSelector';
import ProductionProfileSelector from './ProductionProfileSelector';
import ProductSelector from './ProductSelector';
import UploadDesign from './UploadDesign';
import ZoneEditor from './ZoneEditor';
import ZoneRail from './ZoneRail';
import { useProjet } from './useProjet';

// La 3D n'est jamais rendue côté serveur (WebGL, window) : import dynamique sans SSR.
// Le reste de la page est interactif immédiatement : le GLB ne bloque pas l'interface.
const ProductViewer = dynamic(() => import('./ProductViewer'), {
  ssr: false,
  loading: () => (
    <div className="trame-sombre flex h-full min-h-[240px] items-center justify-center rounded-[22px] bg-sable">
      <p className="animate-pulse rounded-full bg-encre px-4 py-2 text-sm font-medium text-creme">
        Préparation du studio 3D…
      </p>
    </div>
  ),
});

type Onglet = 'creer' | 'produit' | 'commande';

/** Abonnement inerte : la présence d'IndexedDB ne change pas en cours de session. */
const souscrireStockage = () => () => {};

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'creer', label: 'Créer' },
  { id: 'produit', label: 'Produit' },
  { id: 'commande', label: 'Commande' },
];

function BoutonOnglet({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={`relative flex-1 px-3 py-2.5 text-sm font-semibold transition-colors ${
        actif ? 'text-encre' : 'text-attenue hover:text-encre'
      }`}
    >
      {children}
      <span
        aria-hidden
        className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors ${actif ? 'bg-orange' : 'bg-transparent'}`}
      />
    </button>
  );
}

export default function Configurator() {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const side = useConfiguratorStore((s) => s.side);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const elements = useConfiguratorStore((s) => s.elements);
  const selectedId = useConfiguratorStore((s) => s.selectedId);
  const setSide = useConfiguratorStore((s) => s.setSide);
  const addText = useConfiguratorStore((s) => s.addText);
  const duplicateElement = useConfiguratorStore((s) => s.duplicateElement);
  const removeElement = useConfiguratorStore((s) => s.removeElement);

  const [onglet, setOnglet] = useState<Onglet>('creer');
  const [cameraNonce, setCameraNonce] = useState(0);
  // IndexedDB n'existe que côté navigateur : `useSyncExternalStore` fournit un instantané
  // serveur (false) puis l'état réel après hydratation, sans divergence de rendu.
  const imagesPersistantes = useSyncExternalStore(
    souscrireStockage,
    assetStoreDisponible,
    () => false,
  );
  const projet = useProjet();

  const product = getProductById(productId);
  const profil = profilParId(profileId, product);
  const zones = productSides(product);
  const faces = facesToProduce({ elements });
  const nbZonesPersonnalisees = faces.length;
  const prix = product?.priceFcfa ?? null;
  const couleurNom = product?.colors.find((c) => c.hex.toLowerCase() === color.toLowerCase())?.name ?? color;

  // Depuis le panier, « Commander » renvoie vers /personnalisation#commande : on ouvre
  // directement l'onglet de commande. Le hash est lu côté client (rendu statique).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Le hash vient d'un système externe (navigation depuis le panier) : on synchronise
    // l'onglet actif une seule fois au montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.hash === '#commande') setOnglet('commande');
  }, []);

  // Préchargement du GLB en tâche de fond : l'interface est déjà utilisable quand le
  // modèle arrive (le chargement ne bloque donc pas la prise en main).
  useEffect(() => {
    if (!product || product.technique !== 'zones') return;
    const timer = setTimeout(() => {
      void import('@react-three/drei').then(({ useGLTF }) => {
        useGLTF.preload(resolveModelUrl(product));
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [product]);

  const revenirAuCadrage = useCallback(() => {
    // Première zone du produit courant (un mug n'a pas de « face avant »).
    const courant = getProductById(useConfiguratorStore.getState().productId);
    setSide(productSides(courant)[0] ?? 'front');
    setCameraNonce((n) => n + 1);
  }, [setSide]);

  if (!product) {
    return (
      <p className="mx-auto max-w-3xl px-4 py-12 text-center text-attenue">
        Produit introuvable. Retournez à la <Link href="/boutique" className="underline">boutique</Link>.
      </p>
    );
  }

  return (
    <div className="bg-creme">
      <div className="mx-auto w-full max-w-[100rem] px-3 pb-10 sm:px-6">
        {/* ── Barre du studio ─────────────────────────────────────────────────── */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-encre/10 bg-white px-3 py-2 shadow-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/boutique"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-encre/15 text-encre transition-colors hover:border-encre hover:bg-sable"
              aria-label="Retour à la boutique"
            >
              ←
            </Link>
            <div className="min-w-0">
              <p className="surtitre text-orange-action">Studio de personnalisation</p>
              <h1 className="truncate font-display text-base leading-tight text-encre sm:text-lg">{product.name}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <HistoryControls />
            <button
              type="button"
              onClick={() => void projet.enregistrer()}
              data-testid="enregistrer-projet"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-encre/15 bg-white px-3 text-xs font-semibold text-encre transition-colors hover:border-encre"
              title="Enregistrer cette création sur cet appareil"
            >
              {projet.enregistreLe ? <Check className="h-3.5 w-3.5 text-succes" /> : null}
              <span className="hidden sm:inline">{projet.enregistreLe ? 'Enregistré' : 'Enregistrer'}</span>
              <span className="sm:hidden">OK</span>
            </button>
            <Link
              href="/panier"
              data-testid="lien-panier"
              className="relative inline-flex min-h-9 items-center gap-1.5 rounded-full bg-encre px-3 text-xs font-semibold text-creme transition-colors hover:bg-orange hover:text-encre"
            >
              <Bag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Panier</span>
              {projet.nombrePanier > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-orange px-1 font-mono text-[9px] font-bold text-encre">
                  {projet.nombrePanier}
                </span>
              )}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(390px,440px)] xl:grid-cols-[minmax(0,1fr)_minmax(430px,480px)]">
          {/* ── Scène 3D + navigation des zones ─────────────────────────────── */}
          <section className="relative min-w-0 -mx-3 bg-creme px-3 pb-2 pt-0.5 sm:-mx-6 sm:px-6 lg:sticky lg:top-28 lg:z-10 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:pb-0">
            <div className="relative h-[40vh] min-h-[260px] rounded-[26px] border border-encre/40 bg-[#151119] p-1.5 shadow-[0_24px_60px_-30px_rgba(17,13,21,0.55)] lg:h-[min(60vh,660px)] lg:min-h-[400px]">
              <div className="relative h-full overflow-hidden rounded-[20px]">
                <ProductViewer cameraNonce={cameraNonce} />
                <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
                  <span className="rounded-full bg-encre/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-creme backdrop-blur">
                    Aperçu 3D temps réel
                  </span>
                  <button
                    type="button"
                    onClick={revenirAuCadrage}
                    data-testid="reset-camera"
                    className="pointer-events-auto rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-encre shadow-sm backdrop-blur transition-colors hover:bg-white"
                    title="Revenir à la vue d’ensemble"
                  >
                    ↺ Vue d’ensemble
                  </button>
                </div>
                <p className="pointer-events-none absolute inset-x-0 bottom-2 hidden text-center text-[10px] font-medium text-creme/70 sm:block">
                  Glisser pour tourner · molette ou pincer pour zoomer
                </p>
              </div>
            </div>

            <div className="mt-2">
              <ZoneRail />
            </div>

            <p className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[11px] text-attenue">
              <span>
                Zone active : <strong className="font-semibold text-encre">{SIDE_LABELS[side]}</strong>
                {zones.length > 2 ? ` · ${zones.length} zones disponibles` : ''}
              </span>
              <span className="hidden sm:inline">
                Sélectionner une zone présente automatiquement la bonne face du produit.
              </span>
            </p>
          </section>

          {/* ── Panneau d'outils ─────────────────────────────────────────────── */}
          <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-[26px] border border-encre/10 bg-white shadow-[0_18px_50px_-32px_rgba(17,13,21,0.45)] lg:sticky lg:top-[6.25rem] lg:max-h-[min(60vh,660px)]">
            <div className="flex shrink-0 border-b border-encre/10" role="tablist" aria-label="Sections du studio">
              {ONGLETS.map((t) => (
                <BoutonOnglet key={t.id} actif={onglet === t.id} onClick={() => setOnglet(t.id)}>
                  {t.label}
                </BoutonOnglet>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
              {projet.reprise && elements.length > 0 && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-succes/25 bg-succes/5 px-3 py-2 text-[11px] text-succes">
                  <span>Travail précédent restauré sur cet appareil.</span>
                  <button
                    type="button"
                    onClick={projet.nouvelleCreation}
                    className="shrink-0 font-semibold underline underline-offset-2"
                  >
                    Nouvelle création
                  </button>
                </div>
              )}

              {onglet === 'creer' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-encre">
                        Éditeur · {SIDE_LABELS[side]}
                      </h2>
                      <span className="rounded-full bg-sable px-2 py-0.5 text-[10px] font-semibold text-attenue">
                        {SIDE_SHORT[side]} · {profil.dpi} dpi
                      </span>
                    </div>
                    <ZoneEditor />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <UploadDesign compact />
                    <button
                      type="button"
                      data-testid="add-text"
                      onClick={() => addText()}
                      className="group flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-encre/20 bg-white p-3 text-sm font-semibold text-encre transition-colors duration-200 hover:border-encre"
                    >
                      <TextIcon className="h-6 w-6 text-orange-action transition-transform duration-300 group-hover:-translate-y-0.5" />
                      Ajouter du texte
                    </button>
                    <button
                      type="button"
                      disabled={!selectedId}
                      onClick={() => selectedId && duplicateElement(selectedId)}
                      data-testid="duplicate-selected"
                      className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-encre/15 bg-white px-3 text-xs font-semibold text-encre transition-colors hover:border-encre disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ImageIcon className="h-4 w-4 text-attenue" />
                      Dupliquer
                    </button>
                    <button
                      type="button"
                      disabled={!selectedId}
                      onClick={() => selectedId && removeElement(selectedId)}
                      data-testid="remove-selected"
                      className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-encre/15 bg-white px-3 text-xs font-semibold text-encre transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Trash className="h-4 w-4" />
                      Supprimer
                    </button>
                  </div>

                  <DesignPanel />

                  <div className="border-t border-encre/10 pt-3">
                    <h2 className="mb-2 text-sm font-semibold text-encre">Réglages de l’élément</h2>
                    <ElementControls />
                  </div>

                  {!imagesPersistantes && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
                      Ce navigateur ne permet pas de conserver les images sur l’appareil
                      (navigation privée) : la composition sera conservée, mais il faudra
                      recharger les fichiers après un rechargement de page.
                    </p>
                  )}
                </div>
              )}

              {onglet === 'produit' && (
                <div className="flex flex-col gap-5">
                  <section>
                    <h2 className="mb-2 text-sm font-semibold text-encre">Modèle</h2>
                    <ProductSelector onChangerDeSupport={(id) => void projet.ouvrirProduit(id)} />
                  </section>
                  <section className="border-t border-encre/10 pt-4">
                    <h2 className="mb-2 text-sm font-semibold text-encre">Couleur du produit</h2>
                    <ProductColorSelector />
                  </section>
                  <section className="border-t border-encre/10 pt-4">
                    <h2 className="mb-2 text-sm font-semibold text-encre">Procédé de production</h2>
                    <ProductionProfileSelector />
                  </section>
                </div>
              )}

              {onglet === 'commande' && (
                <div className="flex flex-col gap-5">
                  <section>
                    <h2 className="mb-2 text-sm font-semibold text-encre">Fichiers de production</h2>
                    <ExportPanel />
                  </section>
                  <section className="border-t border-encre/10 pt-4">
                    <h2 className="mb-2 text-sm font-semibold text-encre">Commande</h2>
                    <OrderPanel />
                  </section>
                </div>
              )}
            </div>

            {/* Prix + actions : toujours visibles, même en faisant défiler les outils. */}
            <div className="shrink-0 border-t border-encre/10 bg-white px-4 py-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="surtitre text-attenue">Prix unitaire</p>
                  <p className="font-display text-xl leading-tight text-encre" data-testid="prix-unitaire">
                    {formatFcfa(prix)}
                  </p>
                </div>
                <p className="max-w-[55%] text-right text-[10px] leading-snug text-attenue">
                  {couleurNom} · {profil.nom}
                  <br />
                  {nbZonesPersonnalisees === 0
                    ? 'T-shirt uni — aucune zone personnalisée'
                    : `${nbZonesPersonnalisees} zone(s) personnalisée(s)`}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => void projet.ajouterLePanier()}
                  data-testid="ajouter-panier"
                  className="rounded-full border border-encre bg-white px-3 py-2.5 text-xs font-semibold text-encre transition-colors hover:bg-sable"
                >
                  Ajouter au panier
                </button>
                <button
                  type="button"
                  onClick={() => setOnglet('commande')}
                  data-testid="aller-commande"
                  className="rounded-full bg-orange px-3 py-2.5 text-xs font-bold text-encre transition-colors hover:bg-encre hover:text-creme"
                >
                  Commander
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-attenue">
                Sauvegarde automatique sur cet appareil · Livraison calculée à la commande
              </p>
            </div>
          </aside>
        </div>
      </div>

      {projet.message && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 right-3 z-50 max-w-[min(92vw,380px)] rounded-xl px-4 py-3 text-xs font-medium shadow-lg sm:bottom-6 sm:right-6 ${
            projet.message.ton === 'ok' ? 'bg-encre text-creme' : 'bg-red-700 text-white'
          }`}
        >
          {projet.message.texte}
        </div>
      )}
    </div>
  );
}

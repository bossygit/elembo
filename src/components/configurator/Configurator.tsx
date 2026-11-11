'use client';

// Configurateur : assemble la vue 3D (élément dominant) et les panneaux de contrôle.
// Responsive : sur mobile tout s'empile sous le viewer, sur desktop les contrôles passent
// en colonne à droite ; le tunnel de commande reste en bas, sur toute la largeur.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getProductById } from '../../lib/products/catalog';
import DesignPanel from './DesignPanel';
import ElementControls from './ElementControls';
// Composants retirés de l'interface à la demande : `DesignCanvas` (aperçu 2D) et
// `DesignControls` (téléchargement du visuel + qualité dpi) restent sur le disque, non
// importés, pour pouvoir être remis en une ligne. L'export d'impression est désormais
// produit par le panneau « Commande » à la validation.
import OrderPanel from './OrderPanel';
import ProductColorSelector from './ProductColorSelector';
import ProductSelector from './ProductSelector';
import ViewControls from './ViewControls';

// La 3D n'est jamais rendue côté serveur (WebGL, window) : import dynamique sans SSR.
const ProductViewer = dynamic(() => import('./ProductViewer'), {
  ssr: false,
  loading: () => (
    <div className="trame-sombre flex h-full min-h-[240px] items-center justify-center rounded-2xl bg-sable lg:min-h-[380px]">
      <p className="rounded-full bg-encre px-4 py-2 text-sm font-medium text-creme">Chargement de l’atelier 3D…</p>
    </div>
  ),
});

function Panel({
  step,
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
  /** Panneau repliable : utile pour les blocs techniques ou encombrants. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [ouvert, setOuvert] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section className="rounded-2xl border border-encre/15 bg-white p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-3 font-display text-lg text-encre">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-encre font-mono text-xs font-semibold tracking-normal text-creme">
            {step}
          </span>
          {title}
        </h2>
        {children}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-encre/15 bg-white">
      <h2 className="m-0">
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-controls={`panel-${step}-contenu`}
          data-testid={`panel-${step}-toggle`}
          className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left font-display text-lg text-encre hover:bg-sable/60"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-encre font-mono text-xs font-semibold tracking-normal text-creme">
              {step}
            </span>
            {title}
          </span>
          <span aria-hidden className="text-xs text-attenue">
            {ouvert ? '▾' : '▸'}
          </span>
        </button>
      </h2>
      {ouvert && (
        <div id={`panel-${step}-contenu`} className="px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

export default function Configurator() {
  const productId = useConfiguratorStore((s) => s.productId);
  const [cameraNonce, setCameraNonce] = useState(0);
  const product = getProductById(productId);

  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 py-6 sm:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/boutique" className="text-xs font-medium text-attenue hover:text-orange-action">
            ← Boutique
          </Link>
          <p className="surtitre mt-2 text-orange-action">Modèle en cours</p>
          <h2 className="titre-editorial text-3xl text-encre sm:text-4xl">{product?.name ?? 'Produit'}</h2>
        </div>
        <ProductSelector />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/*
          La scène reste visible pendant les réglages, sur mobile aussi : elle se colle sous
          l'en-tête, en hauteur réduite, pour que chaque changement se voie tout de suite.
          Elle se décolle à la fin de la grille, avant le formulaire de commande.
        */}
        <div className="sticky top-[6.25rem] z-10 -mx-4 flex flex-col gap-2 bg-creme px-4 pb-3 pt-1 sm:-mx-8 sm:px-8 lg:top-28 lg:z-auto lg:mx-0 lg:gap-3 lg:self-start lg:bg-transparent lg:p-0">
          <div className="relative h-[34vh] min-h-[240px] lg:h-[62vh]">
            <ProductViewer cameraNonce={cameraNonce} />
            <span className="surtitre pointer-events-none absolute left-3 top-3 rounded-full bg-encre px-3 py-1.5 text-creme">
              Aperçu 3D
            </span>
          </div>
          <ViewControls onResetCamera={() => setCameraNonce((n) => n + 1)} />
        </div>

        <aside className="flex flex-col gap-4">
          <Panel step="1" title="Couleur du produit">
            <ProductColorSelector />
          </Panel>
          <Panel step="2" title="Design">
            <DesignPanel />
          </Panel>
          <Panel step="3" title="Élément sélectionné">
            <ElementControls />
          </Panel>
        </aside>
      </div>

      <div className="mt-5">
        <Panel step="4" title="Commande">
          <OrderPanel />
        </Panel>
      </div>
    </div>
  );
}

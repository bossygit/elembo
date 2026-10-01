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
    <div className="flex h-full min-h-[380px] items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50">
      <p className="text-sm text-neutral-500">Chargement du configurateur 3D…</p>
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
      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {step}. {title}
        </h2>
        {children}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <h2 className="m-0">
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-controls={`panel-${step}-contenu`}
          data-testid={`panel-${step}-toggle`}
          className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-neutral-500 hover:bg-neutral-50"
        >
          <span>
            {step}. {title}
          </span>
          <span aria-hidden className="text-xs text-neutral-400">
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
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/studio" className="text-xs font-medium text-neutral-500 hover:text-[#E85F00]">
            ← Studio 2D (photo de mockup)
          </Link>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[#E85F00]">
            Elembo — configurateur 3D
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            {product?.name ?? 'Produit'}
          </h1>
        </div>
        <ProductSelector />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          <div className="h-[46vh] min-h-[360px] lg:h-[62vh]">
            <ProductViewer cameraNonce={cameraNonce} />
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

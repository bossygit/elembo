'use client';

// Configurateur : assemble la vue 3D (élément dominant) et les panneaux de contrôle.
// Responsive : sur mobile tout s'empile sous le viewer, sur desktop les contrôles
// passent en colonne à droite et l'aperçu de zone + la configuration en bas.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useConfiguratorStore, serializeConfig } from '../../stores/configurator-store';
import { getProductById } from '../../lib/products/catalog';
import UploadDesign from './UploadDesign';
import DesignControls from './DesignControls';
import DesignCanvas from './DesignCanvas';
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

function Panel({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {step}. {title}
      </h2>
      {children}
    </section>
  );
}

function ConfigPanel() {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const side = useConfiguratorStore((s) => s.side);
  const design = useConfiguratorStore((s) => s.design);
  const transform = useConfiguratorStore((s) => s.transform);
  const loadConfig = useConfiguratorStore((s) => s.loadConfig);

  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // La sérialisation vient du store : une seule définition de la configuration.
  const json = useMemo(
    () => JSON.stringify(serializeConfig({ productId, color, side, design, transform }), null, 2),
    [productId, color, side, design, transform],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setMessage('Configuration copiée.');
    } catch {
      setMessage('Copie refusée par le navigateur — sélectionnez le texte ci-dessus.');
    }
  }

  function load() {
    try {
      const parsed = JSON.parse(importText);
      const result = loadConfig(parsed);
      setMessage(result.ok ? 'Configuration chargée.' : `Refusée : ${result.errors.join(', ')}`);
    } catch {
      setMessage('JSON illisible.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <pre
        data-testid="config-json"
        className="max-h-56 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] leading-relaxed text-neutral-100"
      >
        {json}
      </pre>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Copier la configuration
        </button>
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Effacer le message
        </button>
      </div>
      <details className="rounded-lg border border-neutral-200 p-3">
        <summary className="cursor-pointer text-sm text-neutral-700">Recharger une configuration (JSON)</summary>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={4}
          placeholder='{"version":1,"productId":"tshirt-basic",…}'
          className="mt-2 w-full rounded-lg border border-neutral-300 p-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-[#E85F00]"
        >
          Charger
        </button>
        <p className="mt-2 text-xs text-neutral-500">
          Le visuel lui-même n’est pas inclus (fichier local) : rechargez-le après avoir appliqué la configuration.
        </p>
      </details>
      {message && (
        <p role="status" aria-live="polite" className="text-xs text-neutral-600">
          {message}
        </p>
      )}
    </div>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
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
          <Panel step="2" title="Votre visuel">
            <UploadDesign />
          </Panel>
          <Panel step="3" title="Ajustements">
            <DesignControls />
          </Panel>
        </aside>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel step="4" title="Zone d’impression (aperçu 2D)">
          <DesignCanvas />
        </Panel>
        <Panel step="5" title="Configuration">
          <ConfigPanel />
        </Panel>
      </div>
    </div>
  );
}

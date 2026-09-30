'use client';

// Upload du visuel : réutilise les règles de validation déjà testées du studio 2D
// (src/lib/validate.ts) — aucune règle dupliquée.

import { useRef, useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { validateDimensions, validateFile } from '../../lib/validate';

export default function UploadDesign() {
  const inputRef = useRef<HTMLInputElement>(null);
  const setDesign = useConfiguratorStore((s) => s.setDesign);
  const design = useConfiguratorStore((s) => s.design);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    const check = validateFile(file.size, file.type);
    if (!check.ok) {
      setError(check.reason ?? 'Fichier refusé.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = validateDimensions(img.naturalWidth, img.naturalHeight);
      if (!dims.ok) {
        URL.revokeObjectURL(url);
        setError(dims.reason ?? 'Image refusée.');
        return;
      }
      setError(null);
      setDesign({ originalUrl: url, name: file.name, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Image illisible : le fichier ne peut pas être décodé.');
    };
    img.src = url;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        aria-label="Déposer ou choisir un visuel"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
          dragging ? 'border-[#E85F00] bg-[#E85F00]/10' : 'border-neutral-300 bg-white hover:border-[#E85F00]'
        }`}
      >
        <p className="text-sm font-medium text-neutral-800">
          {design ? 'Changer de visuel' : 'Déposez votre visuel ou cliquez pour parcourir'}
        </p>
        <p className="mt-1 text-xs text-neutral-500">PNG ou JPG · 10 Mo max · ≥ 500 px</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        data-testid="design-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {design && !error && (
        <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={design.originalUrl}
            alt={`Aperçu du visuel ${design.name}`}
            className="h-14 w-14 rounded border border-neutral-200 bg-white object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-800">{design.name}</p>
            <p className="text-xs text-neutral-500">
              {design.width}×{design.height} px — original conservé pour l’impression
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDesign(null)}
            className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-white"
          >
            Retirer
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

// Upload d'une image : réutilise les règles de validation déjà testées du studio 2D
// (src/lib/validate.ts) — aucune règle dupliquée. Chaque image déposée devient un ÉLÉMENT
// du design (positionnable, redimensionnable, tournable), pas « le visuel » unique.

import { useRef, useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { validateDimensions, validateFile } from '../../lib/validate';

export default function UploadDesign({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addImage = useConfiguratorStore((s) => s.addImage);
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
      addImage({ src: url, name: file.name, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Image illisible : le fichier ne peut pas être décodé.');
    };
    img.src = url;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        aria-label="Ajouter une image"
        tabIndex={0}
        data-testid="add-image"
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
        className={`cursor-pointer rounded-xl border-2 border-dashed text-center transition-colors ${
          compact ? 'p-3' : 'p-4'
        } ${dragging ? 'border-[#E85F00] bg-[#E85F00]/10' : 'border-neutral-300 bg-white hover:border-[#E85F00]'}`}
      >
        <p className="text-sm font-medium text-neutral-800">📷 Ajouter une image</p>
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
    </div>
  );
}

'use client';

// UploadZone : drag & drop + input file, validation (format/taille/dimensions),
// miniature de prévisualisation, message d'erreur. ObjectURL révoqué proprement.

import { useRef, useState } from 'react';
import { validateFile, validateDimensions } from '../lib/validate';

export type Design = { url: string; width: number; height: number; name: string };

export default function UploadZone({
  onDesign,
}: {
  onDesign: (d: Design) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Design | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    const v = validateFile(file.size, file.type);
    if (!v.ok) {
      setError(v.reason ?? 'Fichier refusé.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const d = validateDimensions(img.naturalWidth, img.naturalHeight);
      if (!d.ok) {
        URL.revokeObjectURL(url);
        setError(d.reason ?? 'Image refusée.');
        return;
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      const design: Design = {
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
      };
      setError(null);
      setPreview(design);
      onDesign(design);
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
        aria-label="Zone de dépôt du design"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
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
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? 'border-[#E85F00] bg-[#E85F00]/10'
            : 'border-neutral-300 bg-white hover:border-[#E85F00]'
        }`}
      >
        <p className="text-sm font-medium text-neutral-800">
          Glissez votre design ici ou cliquez pour parcourir
        </p>
        <p className="mt-1 text-xs text-neutral-500">PNG ou JPG · 10 Mo max · ≥ 500 px</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
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

      {preview && !error && (
        <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={`Aperçu du design ${preview.name}`}
            className="h-16 w-16 rounded border border-neutral-200 object-contain bg-white"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-800">{preview.name}</p>
            <p className="text-xs text-neutral-500">
              {preview.width}×{preview.height} px — en mémoire, rien n'est stocké
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

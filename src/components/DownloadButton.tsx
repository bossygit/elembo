'use client';

// DownloadButton : export du canvas rendu en PNG (toBlob) + téléchargement.

import type { RefObject } from 'react';

export default function DownloadButton({
  canvasRef,
  filename,
  disabled,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  filename: string;
  disabled: boolean;
}) {
  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={disabled}
      className="w-full rounded-xl bg-[#200233] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00] disabled:cursor-not-allowed disabled:opacity-40"
    >
      ⬇ Télécharger le mockup (PNG)
    </button>
  );
}

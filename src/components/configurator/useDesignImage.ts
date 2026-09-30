'use client';

// Charge le visuel utilisateur en HTMLImageElement (une seule fois par objet URL),
// ce qui évite de le redécoder à chaque changement de transformation.
//
// L'image n'est pas remise à null dans l'effet : on mémorise le couple (url, image)
// et on ne renvoie l'image que si elle correspond à l'URL courante. Aucun setState
// synchrone dans le corps de l'effet, donc aucun rendu en cascade.

import { useEffect, useState } from 'react';
import type { DesignAsset } from '../../types/configurator';

export function useDesignImage(asset: DesignAsset | null): HTMLImageElement | null {
  const url = asset?.originalUrl ?? null;
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!cancelled) setLoaded({ url, image: img });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return url && loaded?.url === url ? loaded.image : null;
}

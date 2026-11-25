'use client';

import dynamic from 'next/dynamic';

/** Konva et IndexedDB n'existent que dans le navigateur. */
const BannerStudio = dynamic(() => import('./BannerStudio'), {
  ssr: false,
  loading: () => <p className="grid h-dvh place-items-center text-sm text-attenue" role="status">Ouverture du Studio…</p>,
});

export function Chargeur() {
  return <BannerStudio />;
}

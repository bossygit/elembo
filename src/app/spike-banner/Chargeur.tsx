'use client';

import dynamic from 'next/dynamic';

// Konva touche au DOM et au canvas : rendu strictement client.
const EditeurSpike = dynamic(() => import('./EditeurSpike'), { ssr: false, loading: () => <p>Chargement de l’éditeur…</p> });

export function Chargeur() {
  return <EditeurSpike />;
}

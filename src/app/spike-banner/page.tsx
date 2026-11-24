import type { Metadata } from 'next';

import { Chargeur } from './Chargeur';

// Lot 0 du Banner Studio — PROTOTYPE JETABLE, branche spike/banner-studio-lot0, ne pas fusionner.
export const metadata: Metadata = { title: 'Spike Banner Studio', robots: { index: false, follow: false } };

export default function PageSpikeBanner() {
  return (
    <main style={{ padding: 24, background: '#f5f1e8', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Spike Banner Studio — lot 0</h1>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
        Document 3 × 1 m en millimètres, rendu par Konva avec la même mise en page que le PDF serveur. Cliquez un élément
        pour le déplacer, le redimensionner ou le faire pivoter.
      </p>
      <Chargeur />
    </main>
  );
}

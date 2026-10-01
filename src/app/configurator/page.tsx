'use client';

// Ancienne URL du configurateur (/configurator) : conservée pour ne pas casser les liens
// déjà partagés — le configurateur 3D est désormais la page d'accueil.
// Redirection côté client (un export statique n'émet pas de redirection serveur), avec un
// lien de secours visible si JavaScript est désactivé.

import { useEffect } from 'react';
import Link from 'next/link';

export default function LegacyConfiguratorPage() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    window.location.replace(`${base}/`);
  }, []);

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-[#FEFCF6] px-4">
      <p className="text-center text-sm text-neutral-600">
        Le configurateur 3D est maintenant sur la page d’accueil.{' '}
        <Link href="/" className="font-semibold text-[#E85F00] underline">
          Continuer →
        </Link>
      </p>
    </main>
  );
}

'use client';

// Ancienne URL du configurateur (/configurator) : conservée pour ne pas casser les liens
// déjà partagés — le configurateur vit désormais sur /personnalisation.
// Redirection côté client (un export statique n'émet pas de redirection serveur), avec un
// lien de secours visible si JavaScript est désactivé.

import { useEffect } from 'react';
import Link from 'next/link';

export default function LegacyConfiguratorPage() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    window.location.replace(`${base}/personnalisation/`);
  }, []);

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-creme px-4">
      <p className="text-center text-sm text-attenue">
        Le configurateur 3D est maintenant sur la page Personnalisation.{' '}
        <Link href="/personnalisation" className="font-semibold text-orange-action underline">
          Continuer
        </Link>
      </p>
    </main>
  );
}

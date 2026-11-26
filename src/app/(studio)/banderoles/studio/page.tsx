import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { Chargeur } from '@/components/banner-studio/Chargeur';
import { studioOuvert } from '@/lib/banner/ouverture';

// Indexée seulement une fois le Studio ouvert au public (`ouverture.ts`).
export const metadata: Metadata = { title: 'Studio banderole', ...(studioOuvert ? {} : { robots: { index: false, follow: false } }) };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function PageStudioBanderole() {
  // L'export statique (GitHub Pages) n'a pas les routes serveur dont le Studio dépendra.
  if (process.env.DEPLOY_TARGET === 'gh-pages') {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Studio indisponible sur cette version du site</h1>
        <p className="mt-3 text-attenue">Vous pouvez décrire votre banderole dans le formulaire de commande.</p>
        <Link href="/banderoles" className="mt-6 inline-block underline">Retour aux banderoles</Link>
      </main>
    );
  }
  return <Chargeur />;
}

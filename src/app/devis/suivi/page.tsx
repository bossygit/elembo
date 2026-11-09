import type { Metadata } from 'next';
import Link from 'next/link';

import RecuperationDevis from '@/components/devis/RecuperationDevis';
import { devisConfigure } from '@/lib/devis/configuration';
import { Etiquette } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'Retrouver mon devis',
  description: 'Récupérez l’accès à votre devis Elembo avec un code envoyé par email ou SMS.',
};

export default function PageRecuperationDevis() {
  if (!devisConfigure) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
        <Etiquette>Suivi</Etiquette>
        <h1 className="titre-editorial mt-4 text-4xl text-encre">Le suivi sera activé prochainement.</h1>
        <p className="mt-4 text-attenue">La récupération d’un devis nécessite la configuration Supabase de l’environnement.</p>
        <Link href="/contact" className="mt-6 inline-block underline">Nous contacter</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <Etiquette>Récupération</Etiquette>
      <h1 className="titre-editorial mt-4 text-4xl text-encre">Retrouver mon devis</h1>
      <p className="mt-3 text-sm leading-relaxed text-attenue">
        Si vous avez perdu l’accès à votre devis — cookie effacé, changement d’appareil — saisissez
        sa référence. Un code à usage unique sera envoyé au contact associé. Le code n’est jamais
        affiché dans l’URL.
      </p>
      <RecuperationDevis />
      <p className="mt-6 text-sm text-attenue">
        Pas encore de devis ?{' '}
        <Link href="/devis" className="underline">
          En faire la demande
        </Link>
      </p>
    </div>
  );
}

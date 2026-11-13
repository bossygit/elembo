import type { Metadata } from 'next';
import Link from 'next/link';

import CommandeBanderole from '@/components/grand-format/CommandeBanderole';
import { Etiquette } from '@/components/site/ui';
import { devisConfigure } from '@/lib/devis/configuration';
import { PRESTATIONS, usageParSlug, type PrestationId } from '@/lib/grand-format/catalogue';
import { lienWhatsApp } from '@/lib/site/marque';

export const metadata: Metadata = {
  title: 'Commander une banderole',
  description:
    'Dimensions libres, finitions, création graphique : décrivez votre banderole en quelques étapes et recevez votre devis Smart Vision.',
};

export default async function PageCommanderBanderole({
  searchParams,
}: {
  searchParams: Promise<{ usage?: string; modele?: string; prestation?: string }>;
}) {
  const { usage, modele, prestation } = await searchParams;

  if (!devisConfigure) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <Etiquette>Banderoles</Etiquette>
        <h1 className="titre-editorial mt-4 text-4xl text-encre">La commande en ligne sera activée prochainement.</h1>
        <p className="mt-4 text-attenue">
          En attendant, décrivez votre banderole sur WhatsApp : dimensions, quantité, occasion et date souhaitée.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <a href={lienWhatsApp('Bonjour Elembo, je souhaite commander une banderole.')} target="_blank" rel="noopener noreferrer" className="underline">
            Écrire sur WhatsApp
          </a>
          <Link href="/contact" className="underline">
            Nous contacter
          </Link>
        </div>
      </div>
    );
  }

  const prestationInitiale = PRESTATIONS.find((p) => p.id === prestation)?.id as PrestationId | undefined;

  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 py-10 sm:px-8 sm:py-14">
      <Link href="/banderoles" className="text-sm text-attenue hover:text-encre">
        ← Banderoles & grand format
      </Link>
      <h1 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Commander une banderole</h1>
      <p className="mt-3 max-w-2xl text-attenue">
        Six étapes rapides. Aucun paiement à ce stade : Smart Vision vérifie votre demande et vous adresse un devis.
      </p>
      <div className="mt-10">
        <CommandeBanderole
          initialUsage={usageParSlug(usage ?? '')?.id}
          initialModele={modele}
          initialPrestation={prestationInitiale}
        />
      </div>
    </div>
  );
}

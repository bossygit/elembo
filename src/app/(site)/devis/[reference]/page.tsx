import type { Metadata } from 'next';

import SuiviDevis from '@/components/devis/SuiviDevis';

export const metadata: Metadata = { title: 'Suivi de mon devis' };
export const dynamic = 'force-dynamic';

export default async function PageSuiviDevis({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-action">Suivi</p>
      <h1 className="titre-editorial mt-3 text-4xl text-encre">Votre devis</h1>
      <p className="mt-2 text-sm text-attenue">Référence : {reference}</p>
      <div className="mt-8">
        <SuiviDevis reference={reference} />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';

import ConfirmationCommande from '@/components/commande/ConfirmationCommande';

export const metadata: Metadata = {
  title: 'Confirmation de commande',
  // Page personnelle (référence de commande dans l'adresse) : pas d'indexation.
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

function premier(valeur: string | string[] | undefined): string {
  return (Array.isArray(valeur) ? valeur[0] : valeur) ?? '';
}

export default async function PageConfirmationCommande({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-action">Commande</p>
      <h1 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Confirmation de commande</h1>
      <div className="mt-8">
        <ConfirmationCommande commande={premier(params.ref)} referenceId={premier(params.paiement)} />
      </div>
    </div>
  );
}

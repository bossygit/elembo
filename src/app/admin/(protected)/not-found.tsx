import Link from 'next/link';

import { bouton } from '@/components/admin/ui';

export default function IntrouvableAdmin() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Introuvable</p>
      <h1 className="mt-2 text-xl font-semibold">Cet élément n’existe pas ou a été supprimé.</h1>
      <Link href="/admin" className={`${bouton('secondaire')} mt-6`}>
        Retour au tableau de bord
      </Link>
    </div>
  );
}

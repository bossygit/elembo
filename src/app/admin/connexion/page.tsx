import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { bouton, champ, libelle } from '@/components/admin/ui';
import { destinationSure } from '@/lib/admin/navigation';
import { devisConfigure } from '@/lib/devis/configuration';
import { staffCourant } from '@/server/admin/acces';
import { connexion } from './actions';

export const metadata: Metadata = { title: 'Connexion' };

const ERREURS: Record<string, string> = {
  champs: 'Renseignez votre email et votre mot de passe.',
  identifiants: 'Identifiants refusés.',
  limite: 'Trop de tentatives. Réessayez dans 15 minutes.',
  acces: 'Ce compte n’a pas accès au back-office. Demandez un rôle à l’administrateur.',
};

export default async function PageConnexionAdmin({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; ok?: string; suite?: string }>;
}) {
  const { erreur, ok, suite } = await searchParams;
  const destination = destinationSure(suite);
  if (await staffCourant()) redirect(destination);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-lg font-semibold tracking-tight">Elembo</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Back-office</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Connexion du personnel</h1>
          <p className="mt-1 text-sm text-neutral-600">Accès réservé aux comptes disposant d’un rôle attribué.</p>

          {!devisConfigure ? (
            <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Back-office indisponible : Supabase n’est pas configuré sur ce déploiement.
            </p>
          ) : null}
          {erreur ? (
            <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {ERREURS[erreur] ?? 'Connexion impossible.'}
            </p>
          ) : null}
          {ok === 'deconnexion' && !erreur ? (
            <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Vous êtes déconnecté.
            </p>
          ) : null}

          <form action={connexion} className="mt-6 space-y-4">
            <input type="hidden" name="suite" value={destination} />
            <label className={libelle}>
              Email professionnel
              <input className={champ} type="email" name="email" autoComplete="username" required maxLength={254} />
            </label>
            <label className={libelle}>
              Mot de passe
              <input className={champ} type="password" name="mot_de_passe" autoComplete="current-password" required maxLength={200} />
            </label>
            <button type="submit" className={`${bouton('primaire')} w-full`} disabled={!devisConfigure}>
              Se connecter
            </button>
          </form>
        </div>
        <Link href="/" className="mt-6 block text-center text-xs text-neutral-500 hover:text-encre">
          ← Retour au site
        </Link>
      </div>
    </main>
  );
}

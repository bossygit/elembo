import type { Metadata } from 'next';
import Link from 'next/link';

import { connexion } from './actions';

export const metadata: Metadata = { title: 'Connexion staff — Elembo' };

export default async function PageConnexionAdmin({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Elembo</p>
      <h1 className="mt-3 text-3xl font-semibold">Espace staff</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Connexion réservée aux collaborateurs Smart Vision. Les rôles sont attribués par l’administrateur.
      </p>

      {erreur ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {erreur === 'champs' ? 'Renseignez votre email et votre mot de passe.' : 'Identifiants refusés.'}
        </p>
      ) : null}

      <form action={connexion} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Email professionnel
          <input
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-[var(--accent)]"
            type="email"
            name="email"
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Mot de passe
          <input
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-[var(--accent)]"
            type="password"
            name="mot_de_passe"
            autoComplete="current-password"
            required
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white"
        >
          Se connecter
        </button>
      </form>

      <Link href="/" className="mt-8 text-center text-sm text-neutral-500 underline">
        Retour au site
      </Link>
    </main>
  );
}

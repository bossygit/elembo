import type { Metadata } from 'next';
import Link from 'next/link';

import { NavPortail } from '@/components/partenaire/NavPortail';
import { peutPartenaire, type DroitPartenaire } from '@/lib/partenaires/droits';
import { accesPortail } from '@/lib/partenaires/statuts';
import { etatCompte } from '@/server/partenaires/acces';
import { deconnecter } from './actions';

/** Rubriques du dossier, affichées selon le droit du rôle (utilisateurs : sous-lot 1.6). */
const RUBRIQUES: { href: string; libelle: string; droit: DroitPartenaire }[] = [
  { href: '/partenaire', libelle: 'Mon dossier', droit: 'entreprise.voir' },
  { href: '/partenaire/entreprise', libelle: 'Entreprise', droit: 'entreprise.voir' },
  { href: '/partenaire/machines', libelle: 'Machines', droit: 'machines.voir' },
  { href: '/partenaire/capacites', libelle: 'Capacités', droit: 'capacites.voir' },
  { href: '/partenaire/services', libelle: 'Services', droit: 'services.voir' },
  { href: '/partenaire/tarifs', libelle: 'Tarifs', droit: 'tarifs.voir' },
  { href: '/partenaire/disponibilites', libelle: 'Disponibilités', droit: 'disponibilites.voir' },
];

export const metadata: Metadata = {
  title: { default: 'Espace partenaires', template: '%s · Espace partenaires Elembo' },
  description: 'Espace des imprimeurs et ateliers partenaires de Smart Vision Congo.',
  robots: { index: false, follow: false },
};

/**
 * Coque du portail partenaire, distincte du site public et du back-office. Elle ne protège rien
 * (chaque page appelle `exigerPartenaire`) : elle affiche seulement le compte connecté.
 */
export default async function LayoutPartenaire({ children }: { children: React.ReactNode }) {
  const etat = await etatCompte();
  const connecte = etat.type === 'partenaire' || etat.type === 'sans_entreprise';
  const email = etat.type === 'partenaire' ? etat.session.email : etat.type === 'sans_entreprise' ? etat.email : null;
  const avecNav = etat.type === 'partenaire' && accesPortail(etat.session.statutPartenaire) !== 'aucun';

  return (
    <div className="flex min-h-screen flex-col bg-creme text-encre">
      <header className="border-b border-filet bg-creme/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/partenaire" className="leading-none">
            <span className="block font-display text-xl font-semibold tracking-tight">Elembo</span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-attenue">Espace partenaires</span>
          </Link>
          {connecte ? (
            <div className="flex min-w-0 items-center gap-4">
              <span className="hidden max-w-56 truncate text-sm text-attenue sm:block" title={email ?? undefined}>
                {email}
              </span>
              <form action={deconnecter}>
                <button type="submit" className="text-sm font-medium underline underline-offset-4 hover:text-orange-action">
                  Se déconnecter
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>
      {avecNav && etat.type === 'partenaire' ? (
        <NavPortail
          entrees={RUBRIQUES.filter((r) => peutPartenaire(etat.session.role, r.droit, etat.session.statutPartenaire)).map(({ href, libelle }) => ({ href, libelle }))}
        />
      ) : null}
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-filet">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-attenue">
          Smart Vision Congo · Brazzaville — espace réservé aux ateliers partenaires.
        </div>
      </footer>
    </div>
  );
}

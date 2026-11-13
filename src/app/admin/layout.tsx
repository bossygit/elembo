import type { Metadata } from 'next';

/**
 * Base de tout /admin (connexion comprise) : aucun élément du site public, pas d'indexation.
 * Le contrôle d'accès est fait page par page (`exigerAcces`), pas ici.
 */
export const metadata: Metadata = {
  title: { default: 'Back-office', template: '%s · Back-office Elembo' },
  robots: { index: false, follow: false, nocache: true },
};

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f5f4f1] font-sans text-encre">{children}</div>;
}

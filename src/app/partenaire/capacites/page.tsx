import type { Metadata } from 'next';
import Link from 'next/link';

import { BadgeValidation, EnTeteRubrique, Ligne, MessageOk, PageDossier, Pastille, metres, nombre } from '@/components/partenaire/affichage';
import { bouton } from '@/components/partenaire/ui';
import { UNITES_CAPACITE, nomFamille } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesCapacites } from '@/server/partenaires/dossier';

export const metadata: Metadata = { title: 'Mes capacités' };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  ajoutee: 'Capacité ajoutée. Smart Vision la vérifiera avec votre dossier.',
  modifiee: 'Capacité enregistrée.',
  desactivee: 'Capacité mise en pause : elle ne sera plus proposée.',
  reactivee: 'Capacité réactivée.',
};

export default async function PageCapacites({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const session = await exigerPartenaire('capacites.voir');
  const { ok } = await searchParams;
  const capacites = await mesCapacites();
  const ajout = peutPartenaire(session.role, 'capacites.modifier', session.statutPartenaire);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mes capacités"
        intro="Ce que votre atelier produit réellement : dimensions, volumes par jour, délais et finitions. C’est sur cette base que Smart Vision vous confie des travaux."
        action={
          ajout ? (
            <Link href="/partenaire/capacites/nouvelle" className={bouton('primaire')}>
              Ajouter une capacité
            </Link>
          ) : undefined
        }
      />
      <MessageOk code={ok} messages={MESSAGES} />

      {capacites.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-filet p-6 text-sm text-attenue">Aucune capacité déclarée pour l’instant.</p>
      ) : (
        <ul className="space-y-3">
          {capacites.map((c) => {
            const unite = UNITES_CAPACITE.find((u) => u.id === c.unite_capacite);
            return (
              <Ligne
                key={c.id}
                href={`/partenaire/capacites/${c.id}`}
                titre={c.nom}
                sousTitre={[
                  nomFamille(c.categorie),
                  c.capacite_journaliere !== null ? `${nombre(c.capacite_journaliere)} ${unite?.parJour ?? ''}` : null,
                  c.largeur_max_mm !== null ? `jusqu’à ${metres(c.largeur_max_mm)}` : null,
                  c.delai_jours !== null ? `${c.delai_jours} j` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                pastilles={
                  <>
                    {!c.actif ? <Pastille>En pause</Pastille> : null}
                    <BadgeValidation statut={c.statut_validation} />
                  </>
                }
              />
            );
          })}
        </ul>
      )}
    </PageDossier>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { BadgeValidation, EnTeteRubrique, Ligne, MessageOk, PageDossier, Pastille } from '@/components/partenaire/affichage';
import { bouton } from '@/components/partenaire/ui';
import { CATEGORIES_SERVICE } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesServices } from '@/server/partenaires/dossier';

export const metadata: Metadata = { title: 'Mes services' };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  ajoute: 'Service ajouté. Smart Vision le vérifiera avec votre dossier.',
  modifie: 'Service enregistré.',
  desactive: 'Service mis en pause.',
  reactive: 'Service réactivé.',
};

export default async function PageServices({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const session = await exigerPartenaire('services.voir');
  const { ok } = await searchParams;
  const services = await mesServices();
  const ajout = peutPartenaire(session.role, 'services.modifier', session.statutPartenaire);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mes services"
        intro="Les prestations que vous acceptez de réaliser pour Smart Vision : impression seule ou avec finition, pose, livraison, installation…"
        action={
          ajout ? (
            <Link href="/partenaire/services/nouveau" className={bouton('primaire')}>
              Ajouter un service
            </Link>
          ) : undefined
        }
      />
      <MessageOk code={ok} messages={MESSAGES} />

      {services.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-filet p-6 text-sm text-attenue">Aucun service déclaré pour l’instant (facultatif pour soumettre votre dossier).</p>
      ) : (
        <ul className="space-y-3">
          {services.map((s) => (
            <Ligne
              key={s.id}
              href={`/partenaire/services/${s.id}`}
              titre={s.nom}
              sousTitre={[CATEGORIES_SERVICE.find((c) => c.id === s.categorie)?.nom, s.delai_jours !== null ? `${s.delai_jours} j` : null].filter(Boolean).join(' · ')}
              pastilles={
                <>
                  {s.realise_par_tiers ? <Pastille>Avec un autre atelier</Pastille> : null}
                  {!s.actif ? <Pastille>En pause</Pastille> : null}
                  <BadgeValidation statut={s.statut_validation} />
                </>
              }
            />
          ))}
        </ul>
      )}
    </PageDossier>
  );
}

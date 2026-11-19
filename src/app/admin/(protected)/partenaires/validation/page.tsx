import type { Metadata } from 'next';
import Link from 'next/link';

import { DecisionElement } from '@/components/admin/partenaires';
import { Carte, EnTete, Flash, Vide, bouton } from '@/components/admin/ui';
import { dateCourte } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { CATEGORIES_SERVICE, nomPrestation, nomTypeMachine } from '@/lib/partenaires/catalogue';
import { exigerAcces } from '@/server/admin/acces';
import { fileValidation, type ElementAValider } from '@/server/admin/partenaires';

export const metadata: Metadata = { title: 'Partenaires à valider' };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  'element-valide': 'Élément validé.',
  'element-refuse': 'Élément refusé : l’atelier est prévenu par e-mail.',
};

function ListeElements({
  titre,
  elements,
  libelle,
  decision,
}: {
  titre: string;
  elements: ElementAValider[];
  libelle: (e: ElementAValider) => string | null;
  decision?: 'machine' | 'capacite' | 'service';
}) {
  return (
    <Carte titre={`${titre} (${elements.length})`}>
      {elements.length === 0 ? <Vide>Rien à valider.</Vide> : null}
      <ul className="divide-y divide-neutral-100">
        {elements.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{e.nom}</p>
              <p className="text-xs text-neutral-500">
                <Link href={`/admin/partenaires/${e.partenaire_id}`} className="hover:underline">
                  {e.partenaire}
                </Link>
                {libelle(e) ? ` · ${libelle(e)}` : ''} · modifié le {dateCourte(e.maj_le)}
              </p>
            </div>
            {decision ? (
              <DecisionElement type={decision} id={e.id} partenaireId={e.partenaire_id} statut="A_VALIDER" depuis="file" />
            ) : (
              <Link href={`/admin/partenaires/${e.partenaire_id}#tarifs`} className={bouton('secondaire', 'sm')}>
                Examiner
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Carte>
  );
}

export default async function PageValidationPartenaires({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const staff = await exigerAcces('partenaires.voir');
  const messages = await searchParams;
  const valider = peut(staff.role, 'partenaires.valider');
  const tarifs = peut(staff.role, 'partenaires.tarifs_valider');
  const file = await fileValidation(tarifs);

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/partenaires', label: 'Partenaires' }}
        surtitre="Elembo Partners"
        titre="À valider"
        description="Dossiers soumis, et éléments ajoutés ou modifiés par les ateliers. Une modification technique (dimensions, supports, capacité) remet l’élément à valider."
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={MESSAGES} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Carte titre={`Dossiers soumis (${file.dossiers.length})`}>
          {file.dossiers.length === 0 ? <Vide>Aucun dossier en attente.</Vide> : null}
          <ul className="divide-y divide-neutral-100">
            {file.dossiers.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{d.nom}</p>
                  <p className="text-xs text-neutral-500">
                    {d.ville ?? '—'} · soumis le {dateCourte(d.soumis_le)}
                  </p>
                </div>
                <Link href={`/admin/partenaires/${d.id}#decision`} className={bouton('primaire', 'sm')}>
                  Examiner
                </Link>
              </li>
            ))}
          </ul>
        </Carte>
        <ListeElements titre="Machines" elements={file.machines} libelle={(e) => (e.detail ? nomTypeMachine(e.detail) : null)} decision={valider ? 'machine' : undefined} />
        <ListeElements titre="Capacités" elements={file.capacites} libelle={(e) => (e.detail ? nomPrestation(e.detail) : null)} decision={valider ? 'capacite' : undefined} />
        <ListeElements
          titre="Services"
          elements={file.services}
          libelle={(e) => CATEGORIES_SERVICE.find((c) => c.id === e.detail)?.nom ?? null}
          decision={valider ? 'service' : undefined}
        />
        {tarifs ? <ListeElements titre="Tarifs proposés" elements={file.tarifs} libelle={(e) => e.detail} /> : null}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';

import { Cache, Choix, Formulaire } from '@/components/partenaire/Formulaire';
import { FormulaireInvitation } from '@/components/partenaire/FormulairesEquipe';
import { EnTeteRubrique, PageDossier, Pastille } from '@/components/partenaire/affichage';
import { Carte } from '@/components/partenaire/ui';
import { dateCourte } from '@/lib/admin/format';
import { ROLES_PARTENAIRE } from '@/lib/partenaires/droits';
import { LIBELLES_ETAT_INVITATION } from '@/lib/partenaires/invitations';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { invitations, membres } from '@/server/partenaires/invitations';
import { modifierMembreAction, revoquerInvitationAction } from '../utilisateurs-actions';

export const metadata: Metadata = { title: 'Mes utilisateurs' };
export const dynamic = 'force-dynamic';

const nomRole = (id: string) => ROLES_PARTENAIRE.find((r) => r.id === id)?.label ?? id;

export default async function PageUtilisateurs() {
  const session = await exigerPartenaire('utilisateurs.gerer');
  // L'atelier vient de la session : seuls ses membres et ses invitations sont lus.
  const [equipe, liste] = await Promise.all([membres(session.partenaireId), invitations(session.partenaireId)]);
  const enAttente = liste.filter((i) => i.etat === 'EN_ATTENTE');

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mes utilisateurs"
        intro="Les personnes de votre atelier qui ont accès à l’espace. Un responsable gère tout ; « Production » signale l’état des machines et les disponibilités ; « Lecture » consulte seulement. Les tarifs ne sont visibles que des responsables."
      />

      <Carte titre="Équipe">
        <ul className="divide-y divide-filet">
          {equipe.map((m) => {
            const moi = m.user_id === session.userId;
            return (
              <li key={m.id} className={`space-y-3 py-4 ${m.actif ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">{m.email ?? '—'}</span>
                  <Pastille ton={m.role_partenaire === 'RESPONSABLE' ? 'succes' : 'neutre'}>{nomRole(m.role_partenaire)}</Pastille>
                  {moi ? <Pastille>Vous</Pastille> : null}
                  {!m.actif ? <Pastille ton="alerte">Désactivé</Pastille> : null}
                </div>
                {!moi ? (
                  <div className="flex flex-wrap items-end gap-3">
                    {m.actif ? (
                      <div className="min-w-56 flex-1">
                        <Formulaire action={modifierMembreAction} envoyer="Changer le rôle" variante="secondaire" pleineLargeur={false}>
                          <Cache nom="id" valeur={m.id} />
                          <Choix nom="role" libelle="Rôle" defaut={m.role_partenaire} options={ROLES_PARTENAIRE.map((r) => ({ valeur: r.id, libelle: r.label }))} />
                        </Formulaire>
                      </div>
                    ) : null}
                    <Formulaire action={modifierMembreAction} envoyer={m.actif ? 'Désactiver l’accès' : 'Réactiver l’accès'} variante="secondaire" pleineLargeur={false}>
                      <Cache nom="id" valeur={m.id} />
                      <Cache nom="actif" valeur={m.actif ? 'false' : 'true'} />
                    </Formulaire>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Carte>

      <Carte titre="Inviter une personne">
        <FormulaireInvitation nomAtelier={session.nomPartenaire} />
      </Carte>

      {liste.length ? (
        <Carte titre={`Invitations (${enAttente.length} en attente)`}>
          <ul className="divide-y divide-filet">
            {liste.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-all font-medium">{i.email}</p>
                  <p className="text-attenue">
                    {nomRole(i.role_partenaire)} · {LIBELLES_ETAT_INVITATION[i.etat]}
                    {i.etat === 'EN_ATTENTE' ? ` jusqu’au ${dateCourte(i.expire_le)}` : ''}
                  </p>
                </div>
                {i.etat === 'EN_ATTENTE' ? (
                  <Formulaire action={revoquerInvitationAction} envoyer="Annuler" attente="Annulation…" variante="secondaire" pleineLargeur={false}>
                    <Cache nom="id" valeur={i.id} />
                  </Formulaire>
                ) : null}
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}
    </PageDossier>
  );
}

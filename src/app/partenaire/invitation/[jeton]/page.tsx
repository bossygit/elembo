import type { Metadata } from 'next';

import { BoutonAccepter, FormulaireCompteInvite } from '@/components/partenaire/FormulairesEquipe';
import { Alerte, LienTexte, PageAcces, bouton } from '@/components/partenaire/ui';
import { ROLES_PARTENAIRE } from '@/lib/partenaires/droits';
import { CHEMIN_INVITATION, estJetonInvitation, LIBELLES_ETAT_INVITATION } from '@/lib/partenaires/invitations';
import { etatCompte } from '@/server/partenaires/acces';
import { invitationParJeton } from '@/server/partenaires/invitations';
import { deconnecter } from '../../actions';

export const metadata: Metadata = { title: 'Invitation' };
export const dynamic = 'force-dynamic';

/**
 * Page publique d'une invitation. Le jeton est le seul secret de l'URL ; il ne suffit pas à
 * rejoindre l'atelier : il faut aussi un compte confirmé portant l'adresse invitée (contrôle en
 * base). L'adresse invitée n'est affichée qu'au porteur du lien.
 */
export default async function PageInvitation({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const invitation = estJetonInvitation(jeton) ? await invitationParJeton(jeton) : null;

  if (!invitation) {
    return (
      <PageAcces titre="Invitation introuvable">
        <Alerte ton="attention">Ce lien n’est pas valable. Vérifiez qu’il a été copié en entier, ou demandez une nouvelle invitation.</Alerte>
      </PageAcces>
    );
  }
  if (invitation.etat !== 'EN_ATTENTE' || !invitation.partenaireOuvert) {
    return (
      <PageAcces titre="Invitation plus valable">
        <Alerte ton="attention">
          {!invitation.partenaireOuvert
            ? 'Cet atelier n’accepte plus de nouveaux comptes.'
            : invitation.etat === 'ACCEPTEE'
              ? 'Cette invitation a déjà été utilisée : connectez-vous avec le compte qui l’a acceptée.'
              : `Cette invitation est ${LIBELLES_ETAT_INVITATION[invitation.etat].toLowerCase()}. Demandez-en une nouvelle au responsable de l’atelier.`}
        </Alerte>
        {invitation.etat === 'ACCEPTEE' ? (
          <p className="mt-4 text-sm">
            <LienTexte href="/partenaire/connexion">Se connecter</LienTexte>
          </p>
        ) : null}
      </PageAcces>
    );
  }

  const role = ROLES_PARTENAIRE.find((r) => r.id === invitation.role_partenaire);
  const etat = await etatCompte();
  const retour = `${CHEMIN_INVITATION}${jeton}`;
  const intro = (
    <>
      Vous êtes invité à rejoindre <strong className="text-encre">{invitation.partenaire}</strong> sur l’espace partenaires Elembo,
      avec le rôle <strong className="text-encre">{role?.label ?? invitation.role_partenaire}</strong> : {role?.description.toLowerCase()}
    </>
  );

  if (etat.type === 'anonyme') {
    return (
      <PageAcces
        titre="Rejoindre l’atelier"
        intro={intro}
        pied={
          <p>
            J’ai déjà un compte : <LienTexte href={`/partenaire/connexion?suite=${encodeURIComponent(retour)}`}>me connecter</LienTexte>
          </p>
        }
      >
        <FormulaireCompteInvite jeton={jeton} email={invitation.email} />
      </PageAcces>
    );
  }

  if (etat.type === 'staff') {
    return (
      <PageAcces titre="Rejoindre l’atelier" intro={intro}>
        <Alerte ton="attention">Vous êtes connecté avec un compte du personnel Smart Vision, qui ne peut pas rejoindre un atelier.</Alerte>
      </PageAcces>
    );
  }

  if (etat.type === 'non_confirme') {
    return (
      <PageAcces titre="Rejoindre l’atelier" intro={intro}>
        <Alerte ton="info">Confirmez d’abord votre adresse e-mail avec le lien reçu, puis revenez sur cette page.</Alerte>
      </PageAcces>
    );
  }

  const email = etat.type === 'partenaire' ? etat.session.email : etat.email;
  if (email !== invitation.email) {
    return (
      <PageAcces titre="Rejoindre l’atelier" intro={intro}>
        <div className="space-y-4">
          <Alerte ton="attention">
            Cette invitation est destinée à une autre adresse que celle de votre compte ({email}). Déconnectez-vous, puis
            connectez-vous ou créez un compte avec l’adresse invitée.
          </Alerte>
          <form action={deconnecter}>
            <button type="submit" className={bouton('secondaire')}>
              Me déconnecter
            </button>
          </form>
        </div>
      </PageAcces>
    );
  }

  if (etat.type === 'partenaire' && etat.session.partenaireId === invitation.partenaire_id) {
    return (
      <PageAcces titre="Vous faites déjà partie de l’atelier">
        <p className="text-sm">
          <LienTexte href="/partenaire">Ouvrir mon dossier</LienTexte>
        </p>
      </PageAcces>
    );
  }

  return (
    <PageAcces titre="Rejoindre l’atelier" intro={intro}>
      <div className="space-y-4">
        {etat.type === 'partenaire' ? (
          <Alerte ton="attention">
            Votre compte est déjà rattaché à {etat.session.nomPartenaire}. Un compte ne peut appartenir qu’à un seul atelier :
            demandez d’abord au responsable de {etat.session.nomPartenaire} de désactiver votre accès.
          </Alerte>
        ) : null}
        <BoutonAccepter jeton={jeton} atelier={invitation.partenaire} />
      </div>
    </PageAcces>
  );
}

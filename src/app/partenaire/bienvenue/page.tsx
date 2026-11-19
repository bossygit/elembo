import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FormulaireEntreprise } from '@/components/partenaire/FormulairesAcces';
import { RejoindreAtelier } from '@/components/partenaire/FormulairesEquipe';
import { Alerte, PageAcces } from '@/components/partenaire/ui';
import { ROLES_PARTENAIRE } from '@/lib/partenaires/droits';
import { accesDesactives, etatCompte } from '@/server/partenaires/acces';
import { invitationsPourEmail } from '@/server/partenaires/invitations';

export const metadata: Metadata = { title: 'Créer mon entreprise' };

/**
 * Compte confirmé mais rattaché à aucune entreprise (créé hors du formulaire d'inscription, ou
 * création automatique impossible). Le nom et le téléphone de l'inscription pré-remplissent le
 * formulaire.
 */
export default async function PageBienvenuePartenaire() {
  const etat = await etatCompte();
  if (etat.type === 'partenaire') redirect('/partenaire');
  if (etat.type !== 'sans_entreprise') redirect('/partenaire/connexion');
  const [desactives, invitations] = await Promise.all([accesDesactives(etat.userId), invitationsPourEmail(etat.email)]);

  return (
    <PageAcces
      titre="Bienvenue"
      intro={
        <>
          Votre compte <strong className="text-encre">{etat.email}</strong> n’est rattaché à aucune entreprise.{' '}
          {invitations.length
            ? 'Rejoignez l’atelier qui vous a invité, ou créez le dossier de votre propre atelier.'
            : 'Créez le dossier de votre atelier. Si le responsable de votre atelier vous a invité, ouvrez plutôt le lien reçu par e-mail.'}
        </>
      }
    >
      <div className="space-y-5">
        {desactives.length ? (
          <Alerte ton="attention">
            Votre accès à {desactives.join(', ')} a été désactivé par le responsable de l’atelier. Pour le retrouver,
            adressez-vous à lui. Vous pouvez aussi créer le dossier de votre propre atelier ci-dessous.
          </Alerte>
        ) : null}
        {invitations.map((i) => (
          <RejoindreAtelier
            key={i.id}
            invitationId={i.id}
            atelier={i.partenaire}
            role={ROLES_PARTENAIRE.find((r) => r.id === i.role_partenaire)?.label ?? i.role_partenaire}
          />
        ))}
        {invitations.length ? <p className="pt-2 text-sm font-medium">Ou créez le dossier de votre propre atelier :</p> : null}
        <FormulaireEntreprise nom={etat.intention?.nom} telephone={etat.intention?.telephone} />
      </div>
    </PageAcces>
  );
}

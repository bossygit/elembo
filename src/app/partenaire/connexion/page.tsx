import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FormulaireConnexion } from '@/components/partenaire/FormulairesAcces';
import { Alerte, LienTexte, PageAcces } from '@/components/partenaire/ui';
import { devisConfigure } from '@/lib/devis/configuration';
import { destinationPartenaire } from '@/lib/partenaires/compte';
import { estCheminInvitation } from '@/lib/partenaires/invitations';
import { etatCompte } from '@/server/partenaires/acces';

export const metadata: Metadata = { title: 'Connexion' };

const ERREURS: Record<string, string> = {
  lien: 'Ce lien n’est plus valable (déjà utilisé, expiré, ou ouvert dans un autre navigateur). Connectez-vous, ou demandez un nouveau lien.',
  staff: 'Ce compte est un compte du personnel Smart Vision : connectez-vous depuis le back-office.',
  non_confirme: 'Confirmez d’abord votre adresse e-mail : ouvrez le lien reçu après l’inscription.',
};

export default async function PageConnexionPartenaire({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; ok?: string; suite?: string }>;
}) {
  const { erreur, ok, suite } = await searchParams;
  const destination = destinationPartenaire(suite);
  const etat = await etatCompte();
  if (etat.type === 'partenaire') redirect(destination);
  if (etat.type === 'sans_entreprise') redirect(estCheminInvitation(destination) ? destination : '/partenaire/bienvenue');

  return (
    <PageAcces
      titre="Connexion"
      intro="Accédez au dossier de votre atelier et aux travaux confiés par Smart Vision."
      pied={
        <>
          <p>
            <LienTexte href="/partenaire/mot-de-passe">Mot de passe oublié ?</LienTexte>
          </p>
          <p>
            Pas encore partenaire ? <LienTexte href="/partenaire/inscription">Inscrire mon atelier</LienTexte>
          </p>
        </>
      }
    >
      <div className="space-y-4">
        {!devisConfigure ? <Alerte ton="attention">Espace indisponible : Supabase n’est pas configuré sur ce déploiement.</Alerte> : null}
        <FormulaireConnexion
          suite={destination}
          annonce={
            erreur ? (
              <Alerte ton="erreur">{ERREURS[erreur] ?? 'Connexion impossible.'}</Alerte>
            ) : ok === 'deconnexion' ? (
              <Alerte ton="succes">Vous êtes déconnecté.</Alerte>
            ) : null
          }
        />
      </div>
    </PageAcces>
  );
}

import type { Metadata } from 'next';

import { FormulaireDemandeMotDePasse } from '@/components/partenaire/FormulairesAcces';
import { LienTexte, PageAcces } from '@/components/partenaire/ui';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function PageMotDePasseOublie() {
  return (
    <PageAcces
      titre="Mot de passe oublié"
      intro="Indiquez l’e-mail de votre compte partenaire : nous vous envoyons un lien pour choisir un nouveau mot de passe."
      pied={
        <p>
          <LienTexte href="/partenaire/connexion">Retour à la connexion</LienTexte>
        </p>
      }
    >
      <FormulaireDemandeMotDePasse />
    </PageAcces>
  );
}

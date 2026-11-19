import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FormulaireNouveauMotDePasse } from '@/components/partenaire/FormulairesAcces';
import { PageAcces } from '@/components/partenaire/ui';
import { etatCompte } from '@/server/partenaires/acces';

export const metadata: Metadata = { title: 'Nouveau mot de passe' };

/** Atteinte par le lien de réinitialisation, qui ouvre une session de récupération. */
export default async function PageNouveauMotDePasse() {
  const etat = await etatCompte();
  if (etat.type !== 'partenaire' && etat.type !== 'sans_entreprise') redirect('/partenaire/connexion?erreur=lien');

  return (
    <PageAcces titre="Nouveau mot de passe" intro="Choisissez le mot de passe de votre compte partenaire.">
      <FormulaireNouveauMotDePasse />
    </PageAcces>
  );
}

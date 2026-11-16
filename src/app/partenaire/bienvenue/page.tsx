import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FormulaireEntreprise } from '@/components/partenaire/FormulairesAcces';
import { PageAcces } from '@/components/partenaire/ui';
import { etatCompte } from '@/server/partenaires/acces';

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

  return (
    <PageAcces
      titre="Bienvenue"
      intro={
        <>
          Votre compte <strong className="text-encre">{etat.email}</strong> n’est rattaché à aucune entreprise. Créez le
          dossier de votre atelier. Si le responsable de votre atelier vous a invité, ouvrez plutôt le lien reçu par e-mail.
        </>
      }
    >
      <FormulaireEntreprise nom={etat.intention?.nom} telephone={etat.intention?.telephone} />
    </PageAcces>
  );
}

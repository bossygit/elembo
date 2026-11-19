import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FormulaireInscription } from '@/components/partenaire/FormulairesAcces';
import { Alerte, LienTexte, PageAcces } from '@/components/partenaire/ui';
import { devisConfigure } from '@/lib/devis/configuration';
import { etatCompte } from '@/server/partenaires/acces';

export const metadata: Metadata = { title: 'Inscrire mon atelier' };

export default async function PageInscriptionPartenaire() {
  const etat = await etatCompte();
  if (etat.type === 'partenaire') redirect('/partenaire');
  if (etat.type === 'sans_entreprise') redirect('/partenaire/bienvenue');

  return (
    <PageAcces
      titre="Inscrire mon atelier"
      intro={
        <>
          Imprimeurs, ateliers textile, signalétique : déclarez vos machines et ce que vous savez produire. Smart Vision
          vérifie votre dossier, puis vous confie des travaux. Vos tarifs restent confidentiels.
        </>
      }
      pied={
        <p>
          Déjà inscrit ? <LienTexte href="/partenaire/connexion">Se connecter</LienTexte>
        </p>
      }
    >
      {devisConfigure ? (
        <FormulaireInscription />
      ) : (
        <Alerte ton="attention">Inscriptions indisponibles : Supabase n’est pas configuré sur ce déploiement.</Alerte>
      )}
    </PageAcces>
  );
}

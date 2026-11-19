import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Champ, Formulaire, ZoneTexte } from '@/components/partenaire/Formulaire';
import { Galerie } from '@/components/partenaire/Galerie';
import { Definitions, EnTeteRubrique, MessageOk, PageDossier } from '@/components/partenaire/affichage';
import { Carte } from '@/components/partenaire/ui';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { maFiche } from '@/server/partenaires/dossier';
import { mesFichiers } from '@/server/partenaires/fichiers';
import { enregistrerEntreprise } from '../dossier-actions';

export const metadata: Metadata = { title: 'Mon entreprise' };
export const dynamic = 'force-dynamic';

export default async function PageEntreprise({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const session = await exigerPartenaire('entreprise.voir');
  const { ok } = await searchParams;
  const [f, fichiers] = await Promise.all([maFiche(session), mesFichiers()]);
  if (!f) notFound();
  const deType = (t: string) => fichiers.filter((x) => x.type_fichier === t);
  const modifiable = peutPartenaire(session.role, 'entreprise.modifier', session.statutPartenaire);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mon entreprise"
        intro="Ces informations permettent à Smart Vision de vous identifier et de vous contacter. Elles ne sont jamais communiquées aux clients."
      />
      <MessageOk code={ok} messages={{ enregistre: 'Informations enregistrées.' }} />

      {modifiable ? (
        <Formulaire action={enregistrerEntreprise} envoyer="Enregistrer">
          <Carte titre="Identité">
            <div className="space-y-5">
              <Champ nom="nom" libelle="Nom commercial" defaut={f.nom} requis max={120} />
              <Champ nom="raison_sociale" libelle="Raison sociale" defaut={f.raison_sociale} max={160} />
              <Champ
                nom="specialite"
                libelle="Spécialité"
                defaut={f.specialite === 'À préciser' ? '' : f.specialite}
                requis
                exemple="Grand format, textile, sérigraphie…"
              />
              <ZoneTexte nom="description" libelle="Présentation de l’atelier" defaut={f.description} lignes={4} />
              <div className="grid gap-5 sm:grid-cols-3">
                <Champ nom="annee_creation" libelle="Année de création" defaut={f.annee_creation} mode="numeric" max={4} />
                <Champ nom="rccm" libelle="RCCM" defaut={f.rccm} max={60} />
                <Champ nom="niu" libelle="NIU" defaut={f.niu} max={60} />
              </div>
              <Champ nom="site_web" libelle="Site web" defaut={f.site_web} type="url" mode="url" max={300} exemple="https://" />
            </div>
          </Carte>

          <Carte titre="Coordonnées">
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Champ nom="contact_nom" libelle="Nom du responsable" defaut={f.contact_nom} />
                <Champ nom="contact_fonction" libelle="Fonction" defaut={f.contact_fonction} />
                <Champ nom="telephone" libelle="Téléphone" defaut={f.telephone} type="tel" mode="tel" requis max={32} />
                <Champ nom="whatsapp" libelle="WhatsApp" defaut={f.whatsapp} type="tel" mode="tel" max={32} />
              </div>
              <Champ nom="email" libelle="E-mail de contact" defaut={f.email} type="email" mode="email" max={254} />
              <Champ nom="adresse" libelle="Adresse" defaut={f.adresse} max={300} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Champ nom="ville" libelle="Ville" defaut={f.ville} exemple="Brazzaville" />
                <Champ nom="quartier" libelle="Quartier" defaut={f.quartier} />
              </div>
              <Champ nom="localisation" libelle="Point de repère" defaut={f.localisation} max={300} aide="Pour trouver l’atelier : à côté de…, en face de…" />
              <Champ nom="zone_desservie" libelle="Zone desservie" defaut={f.zone_desservie} max={300} />
            </div>
          </Carte>

          <Carte titre="Conditions de travail">
            <div className="space-y-5">
              <Champ nom="delai_jours" libelle="Délai habituel" defaut={f.delai_jours} mode="numeric" max={3} suffixe="jours" />
              <ZoneTexte nom="quantites_minimales" libelle="Quantités minimales" defaut={f.quantites_minimales} max={1000} />
              <ZoneTexte nom="conditions_particulieres" libelle="Conditions particulières" defaut={f.conditions_particulieres} />
            </div>
          </Carte>
        </Formulaire>
      ) : (
        <Carte>
          <Definitions
            elements={[
              ['Nom commercial', f.nom],
              ['Raison sociale', f.raison_sociale],
              ['Spécialité', f.specialite],
              ['Téléphone', f.telephone],
              ['WhatsApp', f.whatsapp],
              ['E-mail', f.email],
              ['Adresse', [f.adresse, f.quartier, f.ville].filter(Boolean).join(', ')],
              ['Délai habituel', f.delai_jours !== null ? `${f.delai_jours} jours` : null],
            ]}
          />
          <p className="mt-5 text-sm text-attenue">Seul le responsable de l’atelier peut modifier ces informations.</p>
        </Carte>
      )}

      <Carte titre="Logo">
        <Galerie fichiers={deType('LOGO')} type="LOGO" modifiable={modifiable} libelleAjout="Choisir un logo" vide="Aucun logo." />
      </Carte>
      <Carte titre="Photos de l’atelier">
        <Galerie
          fichiers={deType('ATELIER')}
          type="ATELIER"
          modifiable={modifiable}
          libelleAjout="Ajouter des photos"
          vide="Quelques photos de l’atelier aident Smart Vision à valider votre dossier sans visite."
        />
      </Carte>
      <Carte titre="Réalisations">
        <Galerie fichiers={deType('PORTFOLIO')} type="PORTFOLIO" modifiable={modifiable} libelleAjout="Ajouter des réalisations" vide="Aucune réalisation ajoutée." />
      </Carte>
      <Carte titre="Documents">
        <Galerie
          fichiers={deType('DOCUMENT')}
          type="DOCUMENT"
          modifiable={modifiable}
          libelleAjout="Ajouter un document"
          vide="RCCM, NIU, fiche technique… (facultatif, photo ou PDF)."
        />
      </Carte>
    </PageDossier>
  );
}

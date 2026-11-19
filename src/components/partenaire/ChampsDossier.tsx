/**
 * Champs communs aux formulaires de création et de modification (machines, capacités, services).
 * Composants serveur qui assemblent les champs du kit `Formulaire`.
 */

import {
  CATEGORIES_SERVICE,
  ETATS_MACHINE,
  FINITIONS_PRODUCTION,
  MODES_CALCUL,
  NATURES_TARIF,
  UNITES_CAPACITE,
  UNITES_VITESSE,
  nomPrestation,
  nomTypeMachine,
} from '@/lib/partenaires/catalogue';
import { LIGNES_PALIERS, mmEnMetres } from '@/lib/partenaires/formulaires';
import type { VersionTarif } from '@/lib/partenaires/paliers';
import type { Capacite, Machine, Service } from '@/server/partenaires/dossier';
import { Case, Cases, Champ, Choix, ZoneTexte } from './Formulaire';
import { GROUPES_MACHINES, GROUPES_PRESTATIONS } from './affichage';
import { Carte } from './ui';

const liste = (valeurs: string[] | undefined) => (valeurs ?? []).join(', ');

/* ----------------------------------------------------------------- machines -- */

export function ChampsEtatMachine({ m }: { m?: Pick<Machine, 'etat' | 'derniere_maintenance_le' | 'prochaine_maintenance_le'> }) {
  return (
    <div className="space-y-5">
      <Choix nom="etat" libelle="État de fonctionnement" defaut={m?.etat ?? 'OPERATIONNELLE'} options={ETATS_MACHINE.map((e) => ({ valeur: e.id, libelle: e.nom }))} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Champ nom="derniere_maintenance_le" libelle="Dernière maintenance" type="date" defaut={m?.derniere_maintenance_le} max={10} />
        <Champ nom="prochaine_maintenance_le" libelle="Prochaine maintenance" type="date" defaut={m?.prochaine_maintenance_le} max={10} />
      </div>
    </div>
  );
}

export function ChampsMachine({ m }: { m?: Machine }) {
  return (
    <>
      <Carte titre="La machine">
        <div className="space-y-5">
          <Choix nom="type" libelle="Type de machine" defaut={m ? `${m.famille}:${m.type_machine}` : ''} groupes={GROUPES_MACHINES} vide="Choisir…" />
          <Champ nom="nom" libelle="Nom de la machine" defaut={m?.nom} requis exemple="Traceur bâche 3,20 m" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Champ nom="marque" libelle="Marque" defaut={m?.marque} max={80} />
            <Champ nom="modele" libelle="Modèle" defaut={m?.modele} max={80} />
            <Champ nom="technologie" libelle="Technologie" defaut={m?.technologie} max={80} exemple="Éco-solvant, UV, DTF…" />
            <Champ nom="annee_acquisition" libelle="Année d’acquisition" defaut={m?.annee_acquisition} mode="numeric" max={4} />
          </div>
          <Champ nom="quantite" libelle="Nombre de machines identiques" defaut={m?.quantite ?? 1} mode="numeric" requis max={2} />
        </div>
      </Carte>
      <Carte titre="Ce qu’elle peut faire">
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Champ
              nom="largeur_max_m"
              libelle="Largeur maximale (laize)"
              defaut={mmEnMetres(m?.largeur_max_mm)}
              mode="decimal"
              max={10}
              suffixe="m"
              exemple="3,20"
              aide="Largeur utile du rouleau ou du plateau."
            />
            <Champ nom="longueur_max_m" libelle="Longueur maximale" defaut={mmEnMetres(m?.longueur_max_mm)} mode="decimal" max={10} suffixe="m" />
            <Champ nom="resolution_dpi" libelle="Résolution" defaut={m?.resolution_dpi} mode="numeric" max={5} suffixe="dpi" />
            <Champ nom="vitesse" libelle="Vitesse de production" defaut={m?.vitesse === null || m?.vitesse === undefined ? '' : String(m.vitesse).replace('.', ',')} mode="decimal" max={12} />
          </div>
          <Choix
            nom="unite_vitesse"
            libelle="Unité de la vitesse"
            defaut={m?.unite_vitesse}
            requis={false}
            vide="—"
            options={UNITES_VITESSE.map((u) => ({ valeur: u.id, libelle: u.nom }))}
          />
          <Champ nom="supports_compatibles" libelle="Supports compatibles" defaut={liste(m?.supports_compatibles)} max={2000} aide="Séparés par des virgules : bâche, vinyle, papier photo…" />
          <Champ nom="formats_compatibles" libelle="Formats compatibles" defaut={liste(m?.formats_compatibles)} max={2000} aide="Séparés par des virgules : A3, A2, rouleau 1,60 m…" />
        </div>
      </Carte>
      <Carte titre="État">
        <ChampsEtatMachine m={m} />
      </Carte>
    </>
  );
}

export const libelleMachine = (m: Pick<Machine, 'nom' | 'type_machine'>) => `${m.nom} · ${nomTypeMachine(m.type_machine)}`;

/* ---------------------------------------------------------------- capacités -- */

export function ChampsCapacite({ c, machines }: { c?: Capacite; machines: Machine[] }) {
  return (
    <>
      <Carte titre="La prestation">
        <div className="space-y-5">
          <Choix nom="prestation" libelle="Prestation" defaut={c ? `${c.categorie}:${c.prestation}` : ''} groupes={GROUPES_PRESTATIONS} vide="Choisir…" />
          <Champ nom="nom" libelle="Intitulé" defaut={c?.nom} max={120} aide={c ? undefined : 'Laissez vide pour reprendre le nom de la prestation.'} exemple={c ? nomPrestation(c.prestation) : undefined} />
          <Champ nom="technologie" libelle="Technologie utilisée" defaut={c?.technologie} max={80} />
          {machines.length ? (
            <Cases
              nom="machines"
              legende="Machines utilisées"
              options={machines.map((m) => ({ valeur: m.id, libelle: libelleMachine(m) }))}
              cochees={c?.machines ?? []}
            />
          ) : (
            <p className="text-sm text-attenue">Déclarez d’abord vos machines pour les associer à cette capacité.</p>
          )}
        </div>
      </Carte>
      <Carte titre="Dimensions">
        <div className="grid gap-5 sm:grid-cols-2">
          <Champ nom="largeur_min_m" libelle="Largeur minimale" defaut={mmEnMetres(c?.largeur_min_mm)} mode="decimal" max={10} suffixe="m" />
          <Champ nom="largeur_max_m" libelle="Largeur maximale" defaut={mmEnMetres(c?.largeur_max_mm)} mode="decimal" max={10} suffixe="m" />
          <Champ nom="longueur_min_m" libelle="Longueur minimale" defaut={mmEnMetres(c?.longueur_min_mm)} mode="decimal" max={10} suffixe="m" />
          <Champ nom="longueur_max_m" libelle="Longueur maximale" defaut={mmEnMetres(c?.longueur_max_mm)} mode="decimal" max={10} suffixe="m" />
        </div>
      </Carte>
      <Carte titre="Volumes et délais">
        <div className="space-y-5">
          <Choix nom="unite_capacite" libelle="Unité" defaut={c?.unite_capacite ?? 'M2'} options={UNITES_CAPACITE.map((u) => ({ valeur: u.id, libelle: u.nom }))} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Champ nom="capacite_journaliere" libelle="Capacité par jour" defaut={c?.capacite_journaliere === null || c?.capacite_journaliere === undefined ? '' : String(c.capacite_journaliere).replace('.', ',')} mode="decimal" max={14} />
            <Champ nom="capacite_hebdomadaire" libelle="Capacité par semaine" defaut={c?.capacite_hebdomadaire === null || c?.capacite_hebdomadaire === undefined ? '' : String(c.capacite_hebdomadaire).replace('.', ',')} mode="decimal" max={14} />
            <Champ nom="quantite_min" libelle="Quantité minimale" defaut={c?.quantite_min} mode="numeric" max={9} />
            <Champ nom="delai_jours" libelle="Délai habituel" defaut={c?.delai_jours} mode="numeric" max={3} suffixe="jours" />
            <Champ nom="delai_express_jours" libelle="Délai express" defaut={c?.delai_express_jours} mode="numeric" max={3} suffixe="jours" />
          </div>
          <p className="text-sm text-attenue">
            Indiquez une capacité réaliste : elle sert à vous confier des travaux que vous pouvez tenir. Elle ne vous engage pas.
          </p>
        </div>
      </Carte>
      <Carte titre="Supports et finitions">
        <div className="space-y-5">
          <Champ nom="supports_compatibles" libelle="Supports" defaut={liste(c?.supports_compatibles)} max={2000} aide="Séparés par des virgules : bâche 440 g, vinyle, coton…" />
          <Champ nom="matieres" libelle="Matières disponibles en stock" defaut={liste(c?.matieres)} max={2000} />
          <Cases nom="finitions" legende="Finitions proposées" options={FINITIONS_PRODUCTION.map((f) => ({ valeur: f.id, libelle: f.nom }))} cochees={c?.finitions ?? []} />
          <ZoneTexte nom="contraintes" libelle="Contraintes techniques" defaut={c?.contraintes} />
        </div>
      </Carte>
    </>
  );
}

/* ----------------------------------------------------------------- services -- */

export function ChampsService({ s, capacites }: { s?: Service; capacites: Capacite[] }) {
  return (
    <Carte>
      <div className="space-y-5">
        <Choix nom="categorie" libelle="Type de service" defaut={s?.categorie ?? ''} options={CATEGORIES_SERVICE.map((c) => ({ valeur: c.id, libelle: c.nom }))} vide="Choisir…" />
        <Champ nom="nom" libelle="Nom du service" defaut={s?.nom} requis exemple="Banderole imprimée avec œillets" />
        <Choix
          nom="capacite_id"
          libelle="Capacité associée"
          defaut={s?.capacite_id ?? ''}
          requis={false}
          vide="Aucune"
          options={capacites.filter((c) => c.actif || c.id === s?.capacite_id).map((c) => ({ valeur: c.id, libelle: c.nom }))}
        />
        <ZoneTexte nom="description" libelle="Description" defaut={s?.description} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Champ nom="delai_jours" libelle="Délai habituel" defaut={s?.delai_jours} mode="numeric" max={3} suffixe="jours" />
          <Champ nom="quantite_min" libelle="Quantité minimale" defaut={s?.quantite_min} mode="numeric" max={9} />
        </div>
        <ZoneTexte nom="conditions" libelle="Conditions particulières" defaut={s?.conditions} />
        <Case
          nom="realise_par_tiers"
          libelle="Une partie de ce service est réalisée par un autre atelier"
          coche={s?.realise_par_tiers}
          aide="Smart Vision doit le savoir et le valider avant de vous confier ce service."
        />
        <ZoneTexte nom="tiers_precision" libelle="Quel atelier, pour quelle étape ?" defaut={s?.tiers_precision} max={1000} />
      </div>
    </Carte>
  );
}

/* ------------------------------------------------------------------- tarifs -- */

export function ChampsTarif({
  v,
  capacites,
  services,
}: {
  v?: VersionTarif;
  capacites: Capacite[];
  services: Service[];
}) {
  const lignes = Array.from({ length: LIGNES_PALIERS }, (_, i) => v?.paliers[i] ?? null);
  return (
    <>
      <Carte titre="Le tarif">
        <div className="space-y-5">
          <Champ nom="nom" libelle="Nom du tarif" defaut={v?.nom} requis exemple="Impression bâche au m²" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Choix nom="mode_calcul" libelle="Calcul" defaut={v?.mode_calcul ?? 'AU_M2'} options={MODES_CALCUL.map((m) => ({ valeur: m.id, libelle: m.nom }))} />
            <Choix nom="nature" libelle="Nature" defaut={v?.nature ?? 'PRESTATION'} options={NATURES_TARIF.map((n) => ({ valeur: n.id, libelle: n.nom }))} />
          </div>
          <Champ
            nom="prix_fcfa"
            libelle="Prix unitaire"
            defaut={v?.prix_fcfa ?? ''}
            mode="numeric"
            max={14}
            suffixe="FCFA"
            aide="Laissez vide si le prix dépend uniquement de la quantité (paliers ci-dessous)."
          />
          <Choix
            nom="capacite_id"
            libelle="Capacité concernée"
            defaut={v?.capacite_id ?? ''}
            requis={false}
            vide="Aucune en particulier"
            options={capacites.filter((c) => c.actif || c.id === v?.capacite_id).map((c) => ({ valeur: c.id, libelle: c.nom }))}
          />
          <Choix
            nom="service_id"
            libelle="Service concerné"
            defaut={v?.service_id ?? ''}
            requis={false}
            vide="Aucun en particulier"
            options={services.filter((s) => s.actif || s.id === v?.service_id).map((s) => ({ valeur: s.id, libelle: s.nom }))}
          />
        </div>
      </Carte>
      <Carte titre="Prix selon la quantité">
        <p className="mb-4 text-sm text-attenue">
          Facultatif. Les tranches doivent se suivre (1 à 5, puis 6 à 20…). Laissez « jusqu’à » vide sur la dernière ligne pour
          « et plus », et le prix vide pour « sur négociation ».
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-xs font-medium text-attenue" aria-hidden>
            <span>De</span>
            <span>Jusqu’à</span>
            <span>Prix unitaire (FCFA)</span>
          </div>
          {lignes.map((p, i) => (
            <div key={i} className="grid grid-cols-3 gap-3">
              <Champ nom="palier_min" indice={i} libelle={`Palier ${i + 1} : quantité de départ`} libelleMasque defaut={p?.quantiteMin} mode="numeric" max={9} />
              <Champ nom="palier_max" indice={i} libelle={`Palier ${i + 1} : quantité maximale`} libelleMasque defaut={p?.quantiteMax} mode="numeric" max={9} />
              <Champ nom="palier_prix" indice={i} libelle={`Palier ${i + 1} : prix unitaire`} libelleMasque defaut={p?.prixUnitaireFcfa} mode="numeric" max={14} />
            </div>
          ))}
        </div>
      </Carte>
      <Carte>
        <ZoneTexte nom="conditions" libelle="Conditions" defaut={v?.conditions} aide="Œillets inclus, minimum de commande, matière fournie…" />
      </Carte>
    </>
  );
}

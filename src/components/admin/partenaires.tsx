/**
 * Composants serveur du back-office Elembo Partners (statuts, formulaires de décision, champs).
 * Style du back-office : sobre et dense ; les permissions sont revérifiées par chaque action.
 */

import { Badge, Confirmation, bouton, champ, libelle } from '@/components/admin/ui';
import { MODES_CALCUL, NATURES_TARIF } from '@/lib/partenaires/catalogue';
import { LIGNES_PALIERS } from '@/lib/partenaires/formulaires';
import type { VersionTarif } from '@/lib/partenaires/paliers';
import { statutPartenaire, statutTarif, statutValidation, type StatutPartenaire, type StatutTarif, type StatutValidation } from '@/lib/partenaires/statuts';
import { deciderElementAction } from '@/app/admin/(protected)/partenaires/actions';

export function BadgePartenaire({ statut, actif = true }: { statut: StatutPartenaire; actif?: boolean }) {
  const s = statutPartenaire(statut);
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge ton={s.ton}>{s.label}</Badge>
      {!actif ? <Badge>Inactif</Badge> : null}
    </span>
  );
}

export function BadgeValidationAdmin({ statut }: { statut: StatutValidation }) {
  const s = statutValidation(statut);
  return <Badge ton={s.ton}>{s.label}</Badge>;
}

export function BadgeTarif({ statut }: { statut: string }) {
  const s = statutTarif(statut as StatutTarif);
  return <Badge ton={s.ton}>{s.label}</Badge>;
}

/** Valider / refuser (avec motif) une machine, une capacité ou un service. */
export function DecisionElement({
  type,
  id,
  partenaireId,
  statut,
  depuis,
}: {
  type: 'machine' | 'capacite' | 'service';
  id: string;
  partenaireId: string;
  statut: StatutValidation;
  depuis?: 'file';
}) {
  const caches = (
    <>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="partenaire_id" value={partenaireId} />
      {depuis ? <input type="hidden" name="depuis" value={depuis} /> : null}
    </>
  );
  return (
    <div className="flex flex-wrap items-start gap-2">
      {statut !== 'VALIDEE' ? (
        <form action={deciderElementAction}>
          {caches}
          <input type="hidden" name="decision" value="VALIDEE" />
          <button type="submit" className={bouton('succes', 'sm')}>
            Valider
          </button>
        </form>
      ) : null}
      {statut !== 'REFUSEE' ? (
        <Confirmation resume={<span className={bouton('secondaire', 'sm')}>Refuser…</span>}>
          <form action={deciderElementAction} className="space-y-2">
            {caches}
            <input type="hidden" name="decision" value="REFUSEE" />
            <label className={libelle}>
              Motif (transmis à l’atelier)
              <textarea name="motif" required maxLength={1000} rows={2} className={champ} />
            </label>
            <button type="submit" className={bouton('danger', 'sm')}>
              Refuser
            </button>
          </form>
        </Confirmation>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ fiche (staff) -- */

type Fiche = Partial<Record<string, unknown>>;

const v = (f: Fiche | undefined, cle: string) => {
  const x = f?.[cle];
  return x === null || x === undefined ? '' : String(x);
};

export function ChampsFiche({ f }: { f?: Fiche }) {
  const ligne = (nom: string, titre: string, options: { requis?: boolean; max?: number; type?: string; plein?: boolean } = {}) => (
    <label className={`${libelle} ${options.plein ? 'sm:col-span-2' : ''}`}>
      {titre}
      <input name={nom} type={options.type ?? 'text'} required={options.requis} maxLength={options.max ?? 120} defaultValue={v(f, nom)} className={champ} />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ligne('nom', 'Nom commercial', { requis: true })}
      {ligne('raison_sociale', 'Raison sociale', { max: 160 })}
      {ligne('specialite', 'Spécialité', { requis: true })}
      {ligne('telephone', 'Téléphone', { requis: true, max: 32, type: 'tel' })}
      {ligne('whatsapp', 'WhatsApp', { max: 32, type: 'tel' })}
      {ligne('email', 'E-mail de contact', { max: 254, type: 'email' })}
      {ligne('contact_nom', 'Responsable')}
      {ligne('contact_fonction', 'Fonction')}
      {ligne('adresse', 'Adresse', { max: 300, plein: true })}
      {ligne('ville', 'Ville')}
      {ligne('quartier', 'Quartier')}
      {ligne('localisation', 'Point de repère', { max: 300 })}
      {ligne('zone_desservie', 'Zone desservie', { max: 300 })}
      {ligne('rccm', 'RCCM', { max: 60 })}
      {ligne('niu', 'NIU', { max: 60 })}
      {ligne('annee_creation', 'Année de création', { max: 4 })}
      {ligne('delai_jours', 'Délai habituel (jours)', { max: 3 })}
      {ligne('site_web', 'Site web', { max: 300, type: 'url', plein: true })}
      <label className={`${libelle} sm:col-span-2`}>
        Présentation
        <textarea name="description" maxLength={2000} rows={2} defaultValue={v(f, 'description')} className={champ} />
      </label>
      <label className={`${libelle} sm:col-span-2`}>
        Quantités minimales
        <textarea name="quantites_minimales" maxLength={1000} rows={2} defaultValue={v(f, 'quantites_minimales')} className={champ} />
      </label>
      <label className={`${libelle} sm:col-span-2`}>
        Conditions particulières
        <textarea name="conditions_particulieres" maxLength={2000} rows={2} defaultValue={v(f, 'conditions_particulieres')} className={champ} />
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------- tarif -- */

export function ChampsTarifAdmin({ base }: { base?: VersionTarif }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={libelle}>
          Nom du tarif
          <input name="nom" required maxLength={120} defaultValue={base?.nom ?? ''} className={champ} />
        </label>
        <label className={libelle}>
          Prix unitaire (FCFA)
          <input name="prix_fcfa" inputMode="numeric" maxLength={14} defaultValue={base?.prix_fcfa ?? ''} className={champ} />
        </label>
        <label className={libelle}>
          Calcul
          <select name="mode_calcul" defaultValue={base?.mode_calcul ?? 'AU_M2'} className={champ}>
            {MODES_CALCUL.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        </label>
        <label className={libelle}>
          Nature
          <select name="nature" defaultValue={base?.nature ?? 'PRESTATION'} className={champ}>
            {NATURES_TARIF.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      {base?.capacite_id ? <input type="hidden" name="capacite_id" value={base.capacite_id} /> : null}
      {base?.service_id ? <input type="hidden" name="service_id" value={base.service_id} /> : null}
      <fieldset>
        <legend className={libelle}>Paliers (de / jusqu’à / prix unitaire) — facultatif</legend>
        <div className="mt-1 grid gap-1.5">
          {Array.from({ length: LIGNES_PALIERS }, (_, i) => {
            const p = base?.paliers[i];
            return (
              <div key={i} className="grid grid-cols-3 gap-2">
                <input name="palier_min" aria-label={`Palier ${i + 1} : de`} inputMode="numeric" defaultValue={p?.quantiteMin ?? ''} className={champ} />
                <input name="palier_max" aria-label={`Palier ${i + 1} : jusqu’à`} inputMode="numeric" defaultValue={p?.quantiteMax ?? ''} className={champ} />
                <input name="palier_prix" aria-label={`Palier ${i + 1} : prix`} inputMode="numeric" defaultValue={p?.prixUnitaireFcfa ?? ''} className={champ} />
              </div>
            );
          })}
        </div>
      </fieldset>
      <label className={libelle}>
        Conditions
        <textarea name="conditions" maxLength={2000} rows={2} defaultValue={base?.conditions ?? ''} className={champ} />
      </label>
    </div>
  );
}

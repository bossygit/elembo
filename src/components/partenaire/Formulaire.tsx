'use client';

/**
 * Kit de formulaires du dossier partenaire.
 *
 * `Formulaire` exécute une action serveur (`useActionState`), affiche son erreur et désactive le
 * bouton pendant l'envoi. Après un refus, React réinitialise le formulaire : les champs ci-dessous
 * reprennent alors les valeurs renvoyées par l'action (contexte), au lieu des valeurs d'origine,
 * pour ne rien faire ressaisir. Les pages (composants serveur) composent librement ces champs.
 */

import { createContext, useActionState, useContext } from 'react';

import type { EtatDossier } from '@/app/partenaire/etat-dossier';
import { Alerte, aide as classeAide, bouton, champ, libelle } from './ui';

const Valeurs = createContext<Record<string, string[]> | null>(null);

function useValeur(nom: string): string[] | null {
  const valeurs = useContext(Valeurs);
  return valeurs ? (valeurs[nom] ?? []) : null;
}

export function Formulaire({
  action,
  envoyer,
  attente = 'Enregistrement…',
  children,
  variante = 'primaire',
  pleineLargeur = true,
}: {
  action: (etat: EtatDossier, formData: FormData) => Promise<EtatDossier>;
  envoyer: string;
  attente?: string;
  children?: React.ReactNode;
  variante?: 'primaire' | 'secondaire';
  pleineLargeur?: boolean;
}) {
  const [etat, executer, enCours] = useActionState(action, {});
  return (
    <form action={executer} className="space-y-5">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <Valeurs.Provider value={etat.valeurs ?? null}>{children}</Valeurs.Provider>
      <button type="submit" className={`${bouton(variante)} ${pleineLargeur ? 'w-full sm:w-auto' : ''}`} disabled={enCours} aria-busy={enCours}>
        {enCours ? attente : envoyer}
      </button>
    </form>
  );
}

type PropsChamp = {
  nom: string;
  libelle: string;
  defaut?: string | number | null;
  aide?: string;
  requis?: boolean;
  max?: number;
  type?: 'text' | 'tel' | 'email' | 'url' | 'date';
  mode?: 'decimal' | 'numeric' | 'tel' | 'email' | 'url' | 'text';
  exemple?: string;
  suffixe?: string;
  /** Rang du champ quand plusieurs champs portent le même nom (lignes de paliers). */
  indice?: number;
  /** Masque le libellé visuellement (il reste lu par les lecteurs d'écran). */
  libelleMasque?: boolean;
};

export function Champ({ nom, libelle: titre, defaut, aide, requis, max = 120, type = 'text', mode, exemple, suffixe, indice = 0, libelleMasque }: PropsChamp) {
  const repris = useValeur(nom);
  const valeur = repris ? (repris[indice] ?? '') : defaut === null || defaut === undefined ? '' : String(defaut);
  return (
    <label className={libelle}>
      <span className={libelleMasque ? 'sr-only' : undefined}>
        {titre}
        {requis || libelleMasque ? null : <span className="font-normal text-attenue"> (facultatif)</span>}
      </span>
      <span className="relative block">
        <input
          className={`${champ} ${suffixe ? 'pr-16' : ''}`}
          name={nom}
          type={type}
          inputMode={mode}
          required={requis}
          maxLength={max}
          placeholder={exemple}
          defaultValue={valeur}
          key={valeur}
        />
        {suffixe ? <span className="pointer-events-none absolute inset-y-0 right-3.5 mt-1.5 flex items-center text-sm text-attenue">{suffixe}</span> : null}
      </span>
      {aide ? <span className={classeAide}>{aide}</span> : null}
    </label>
  );
}

export function ZoneTexte({ nom, libelle: titre, defaut, aide, max = 2000, lignes = 3 }: Omit<PropsChamp, 'type' | 'mode' | 'requis'> & { lignes?: number }) {
  const repris = useValeur(nom);
  const valeur = repris ? (repris[0] ?? '') : (defaut ?? '').toString();
  return (
    <label className={libelle}>
      {titre}
      <span className="font-normal text-attenue"> (facultatif)</span>
      <textarea
        className={`${champ} h-auto py-3`}
        name={nom}
        rows={lignes}
        maxLength={max}
        defaultValue={valeur}
        key={valeur}
      />
      {aide ? <span className={classeAide}>{aide}</span> : null}
    </label>
  );
}

export type Groupe = { libelle: string; options: { valeur: string; libelle: string }[] };

export function Choix({
  nom,
  libelle: titre,
  defaut,
  groupes,
  options,
  requis = true,
  vide,
  aide,
}: {
  nom: string;
  libelle: string;
  defaut?: string | null;
  groupes?: Groupe[];
  options?: { valeur: string; libelle: string }[];
  requis?: boolean;
  /** Libellé de l'option vide (choix facultatif ou invite). */
  vide?: string;
  aide?: string;
}) {
  const repris = useValeur(nom);
  const valeur = repris ? (repris[0] ?? '') : (defaut ?? '');
  return (
    <label className={libelle}>
      {titre}
      <select className={`${champ} appearance-auto`} name={nom} required={requis} defaultValue={valeur} key={valeur}>
        {vide !== undefined ? <option value="">{vide}</option> : null}
        {options?.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
        {groupes?.map((g) => (
          <optgroup key={g.libelle} label={g.libelle}>
            {g.options.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.libelle}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {aide ? <span className={classeAide}>{aide}</span> : null}
    </label>
  );
}

/** Groupe de cases à cocher partageant un même `nom` (valeurs multiples). */
export function Cases({
  nom,
  legende,
  options,
  cochees = [],
  aide,
}: {
  nom: string;
  legende: string;
  options: { valeur: string; libelle: string }[];
  cochees?: readonly string[];
  aide?: string;
}) {
  const repris = useValeur(nom);
  const actives = repris ?? cochees;
  return (
    <fieldset>
      <legend className={libelle}>
        {legende}
        <span className="font-normal text-attenue"> (facultatif)</span>
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.valeur} className="flex min-h-11 items-center gap-3 rounded-xl border border-filet bg-white px-3.5 text-sm">
            <input
              type="checkbox"
              name={nom}
              value={o.valeur}
              defaultChecked={actives.includes(o.valeur)}
              key={`${o.valeur}-${actives.includes(o.valeur)}`}
              className="size-5 shrink-0 accent-orange-action"
            />
            {o.libelle}
          </label>
        ))}
      </div>
      {aide ? <span className={classeAide}>{aide}</span> : null}
    </fieldset>
  );
}

/** Case unique « oui » (ex. sous-traitance déclarée). */
export function Case({ nom, libelle: titre, coche, aide }: { nom: string; libelle: string; coche?: boolean; aide?: string }) {
  const repris = useValeur(nom);
  const actif = repris ? repris.includes('oui') : Boolean(coche);
  return (
    <label className="flex items-start gap-3 text-sm leading-relaxed text-encre">
      <input type="checkbox" name={nom} value="oui" defaultChecked={actif} key={String(actif)} className="mt-0.5 size-5 shrink-0 accent-orange-action" />
      <span>
        {titre}
        {aide ? <span className={classeAide}>{aide}</span> : null}
      </span>
    </label>
  );
}

/** Champ caché (identifiant de l'élément modifié). */
export function Cache({ nom, valeur }: { nom: string; valeur: string }) {
  return <input type="hidden" name={nom} value={valeur} />;
}

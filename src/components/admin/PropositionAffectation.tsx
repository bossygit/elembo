'use client';

import { useState } from 'react';

import { proposerAffectationAction } from '@/app/admin/(protected)/affectations/actions';
import { PRIORITES_AFFECTATION, calculerMontant, type ObjetAffectation, type TarifAffectation } from '@/lib/partenaires/affectations';

const champ = 'mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-encre shadow-sm outline-none focus:border-encre focus:ring-2 focus:ring-encre/10';
const libelle = 'block text-xs font-medium text-neutral-600';
const bouton = 'inline-flex items-center justify-center rounded-md bg-encre px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50';

export type FichierProposition = { id: string; nom: string; type_fichier: string };

export function PropositionAffectation({
  objet,
  commandeId,
  tacheId = null,
  devisId = null,
  libelle: libelleTravail,
  support = null,
  quantite = null,
  unite = null,
  surfaceM2 = null,
  dateFinPrevue = null,
  suite,
  partenaires,
  tarifs,
  fichiers,
  peutCouts,
}: {
  objet: ObjetAffectation;
  commandeId: string;
  tacheId?: string | null;
  devisId?: string | null;
  libelle: string;
  support?: string | null;
  quantite?: number | null;
  unite?: string | null;
  surfaceM2?: number | null;
  dateFinPrevue?: string | null;
  suite: string;
  partenaires: { id: string; nom: string }[];
  tarifs: Record<string, TarifAffectation[]>;
  fichiers: FichierProposition[];
  peutCouts: boolean;
}) {
  const [partenaireId, setPartenaireId] = useState('');
  const [tarifId, setTarifId] = useState('');
  const [quantiteBase, setQuantiteBase] = useState(surfaceM2 !== null ? String(surfaceM2) : quantite !== null ? String(quantite) : '');
  const [source, setSource] = useState('MANUEL');

  const tarifsPartenaire = partenaireId ? (tarifs[partenaireId] ?? []) : [];
  const tarif = tarifsPartenaire.find((t) => t.id === tarifId) ?? null;
  const quantiteNum = Number(quantiteBase.replace(',', '.'));
  const calcul = tarif && quantiteNum > 0 ? calculerMontant(tarif, quantiteNum) : null;

  return (
    <form action={proposerAffectationAction} className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/60 p-3">
      <input type="hidden" name="objet" value={objet} />
      <input type="hidden" name="commande_id" value={commandeId} />
      <input type="hidden" name="tache_id" value={tacheId ?? ''} />
      <input type="hidden" name="devis_id" value={devisId ?? ''} />
      <input type="hidden" name="libelle" value={libelleTravail} />
      <input type="hidden" name="support" value={support ?? ''} />
      <input type="hidden" name="quantite" value={quantite ?? ''} />
      <input type="hidden" name="unite" value={unite ?? ''} />
      <input type="hidden" name="surface_m2" value={surfaceM2 ?? ''} />
      <input type="hidden" name="suite" value={suite} />

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Proposer à un atelier</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={libelle}>
          Atelier
          <select
            name="partenaire_id"
            required
            value={partenaireId}
            onChange={(e) => {
              setPartenaireId(e.target.value);
              setTarifId('');
            }}
            className={champ}
          >
            <option value="">— Choisir —</option>
            {partenaires.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>

        <label className={libelle}>
          Tarif
          <select
            name="tarif_id"
            value={tarifId}
            onChange={(e) => {
              setTarifId(e.target.value);
              if (e.target.value) setSource('TARIF_VALIDE');
            }}
            className={champ}
            disabled={!partenaireId}
          >
            <option value="">Montant manuel / ancien prix</option>
            {tarifsPartenaire.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom} · v{t.version} · {t.modeCalcul}
              </option>
            ))}
          </select>
        </label>

        <label className={libelle}>
          Quantité de base {surfaceM2 !== null ? '(m²)' : unite ? `(${unite})` : ''}
          <input
            name="quantite_base"
            required={Boolean(tarif)}
            value={quantiteBase}
            onChange={(e) => setQuantiteBase(e.target.value)}
            inputMode="decimal"
            className={champ}
          />
        </label>

        {!tarif ? (
          <>
            <label className={libelle}>
              Source du montant
              <select name="tarif_source" value={source} onChange={(e) => setSource(e.target.value)} className={champ}>
                <option value="MANUEL">Montant négocié</option>
                <option value="ANCIEN_PRIX">Ancien prix</option>
                <option value="SUR_DEVIS">Prix provisoire</option>
              </select>
            </label>
            <label className={libelle}>
              Montant (FCFA)
              <input name="montant_fcfa" type="number" min={1} step={1} disabled={!peutCouts} required={!tarif} className={champ} />
              {!peutCouts ? <span className="mt-1 block text-[11px] text-neutral-500">Permission « coûts » requise pour saisir un montant.</span> : null}
            </label>
            <label className={`${libelle} sm:col-span-2`}>
              Motif du montant {source === 'ANCIEN_PRIX' ? '(conseillé)' : '(obligatoire)'}
              <input name="tarif_motif" maxLength={1000} required={source !== 'ANCIEN_PRIX'} className={champ} />
            </label>
          </>
        ) : (
          <input type="hidden" name="tarif_source" value="TARIF_VALIDE" />
        )}

        <label className={libelle}>
          Priorité
          <select name="priorite" defaultValue="NORMALE" className={champ}>
            {PRIORITES_AFFECTATION.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={libelle}>
          Fin prévue
          <input type="date" name="date_fin_prevue" defaultValue={dateFinPrevue ?? ''} className={champ} />
        </label>
        <label className={libelle}>
          Réponse attendue avant
          <input type="datetime-local" name="date_limite_reponse" className={champ} />
        </label>
        <label className={`${libelle} sm:col-span-2`}>
          Instructions
          <textarea name="instructions" rows={2} maxLength={4000} className={champ} />
        </label>
      </div>

      {fichiers.length ? (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-neutral-600">Fichiers à partager</legend>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {fichiers.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-xs text-neutral-700">
                <input type="checkbox" name="fichiers" value={f.id} className="size-4 rounded border-neutral-300" />
                {f.nom}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {calcul ? (
        <p className={`mt-2 text-xs ${calcul.type === 'MONTANT' ? 'text-emerald-800' : 'text-red-700'}`}>
          {calcul.type === 'MONTANT' ? `Montant calculé : ${calcul.montantFcfa.toLocaleString('fr-FR')} FCFA` : calcul.motif}
        </p>
      ) : null}

      <div className="mt-3">
        <button type="submit" className={bouton} disabled={!partenaireId}>
          Proposer
        </button>
      </div>
    </form>
  );
}

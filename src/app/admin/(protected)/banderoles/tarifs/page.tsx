import type { Metadata } from 'next';

import { Badge, Carte, EnTete, Flash, bouton, champ, libelle } from '@/components/admin/ui';
import { dateHeure, fcfa } from '@/lib/admin/format';
import { supportParId } from '@/lib/grand-format/catalogue';
import { exigerAcces } from '@/server/admin/acces';
import { listerTarifs, type LigneTarif } from '@/server/grand-format/repository';
import { modifierTarifAction, suspendreTarifAction, validerTarifAction } from '../actions';

export const metadata: Metadata = { title: 'Grille grand format' };
export const dynamic = 'force-dynamic';

const STATUTS = {
  TEST: { label: 'Non commercialisé', ton: 'neutre' },
  PROVISOIRE: { label: 'À valider', ton: 'attente' },
  VALIDE: { label: 'Validé — estimation en ligne active', ton: 'succes' },
} as const;

function Champ({ t, name, label, aide }: { t: LigneTarif; name: keyof LigneTarif; label: string; aide?: string }) {
  const valeur = t[name];
  return (
    <label className={libelle}>
      {label}
      <input type="number" name={name} min={0} step={1} defaultValue={valeur === null ? '' : String(valeur)} className={champ} />
      {aide ? <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">{aide}</span> : null}
    </label>
  );
}

export default async function PageTarifs({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await exigerAcces('grand_format.tarifs');
  const messages = await searchParams;
  const tarifs = await listerTarifs();

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/banderoles', label: 'Banderoles' }}
        surtitre="Grand format"
        titre="Grille d’estimation en ligne"
        description="Prix de VENTE servant à l’estimation affichée au client. Un support sans tarif validé reste « sur devis »."
      />
      <Flash
        ok={messages.ok}
        erreur={messages.erreur}
        messages={{ tarif: 'Tarif enregistré (à valider s’il a changé).', valide: 'Tarif validé : l’estimation en ligne est active.', suspendu: 'Validation retirée : ce support repasse sur devis.' }}
      />

      <ul className="mb-6 space-y-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        <li>• Aucun prix n’est livré par défaut : chaque montant est saisi par Smart Vision.</li>
        <li>• Modifier un montant retire automatiquement la validation (contrôle en base).</li>
        <li>• La validation est nominative et datée. Les coûts d’achat des imprimeurs ne sont pas ici : ils restent dans la fiche de chaque imprimeur.</li>
        <li>• Prix par pièce = max(minimum, surface × prix/m² + périmètre × supplément de finition), arrondi à la centaine ; création facturée une fois.</li>
      </ul>

      <div className="grid gap-6 xl:grid-cols-2">
        {tarifs.map((t) => {
          const s = STATUTS[t.statut_prix];
          const souple = supportParId(t.support)?.finitionsApplicables ?? false;
          return (
            <Carte
              key={t.support}
              id={t.support}
              titre={t.libelle}
              description={t.prix_valide_le ? `Validé par ${t.prix_valide_par_email ?? '—'} le ${dateHeure(t.prix_valide_le)}` : `Modifié le ${dateHeure(t.maj_le)}`}
              action={<Badge ton={s.ton}>{s.label}</Badge>}
            >
              <form action={modifierTarifAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="support" value={t.support} />
                <Champ t={t} name="prix_m2_fcfa" label="Prix de vente au m² (FCFA)" />
                <Champ t={t} name="minimum_piece_fcfa" label="Minimum par pièce (FCFA)" />
                {souple ? (
                  <>
                    <Champ t={t} name="supplement_oeillets_ml_fcfa" label="Œillets (FCFA / m linéaire)" aide="Vide = finition sur devis" />
                    <Champ t={t} name="supplement_ourlets_ml_fcfa" label="Ourlets (FCFA / m linéaire)" aide="Vide = finition sur devis" />
                    <Champ t={t} name="supplement_fourreaux_ml_fcfa" label="Fourreaux (FCFA / m linéaire)" aide="Vide = finition sur devis" />
                  </>
                ) : null}
                <Champ t={t} name="frais_creation_fcfa" label="Création graphique (FCFA, forfait)" aide="Vide = création sur devis" />
                <label className={libelle}>
                  Laize maximale (m)
                  <input name="laize_max_m" inputMode="decimal" defaultValue={t.laize_max_m === null ? '' : String(t.laize_max_m).replace('.', ',')} className={champ} />
                  <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">Au-delà : sur devis (assemblage)</span>
                </label>
                <label className={`${libelle} sm:col-span-2`}>
                  Notes internes
                  <input name="notes" maxLength={2000} defaultValue={t.notes ?? ''} className={champ} />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="actif" defaultChecked={t.actif} />
                  Support proposé à l’estimation
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="submit" className={bouton('primaire', 'sm')}>
                    Enregistrer
                  </button>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                {t.statut_prix !== 'VALIDE' ? (
                  <form action={validerTarifAction}>
                    <input type="hidden" name="support" value={t.support} />
                    <button type="submit" disabled={t.prix_m2_fcfa === null} className={bouton('succes', 'sm')}>
                      Valider{t.prix_m2_fcfa !== null ? ` (${fcfa(t.prix_m2_fcfa)} / m²)` : ''}
                    </button>
                  </form>
                ) : (
                  <form action={suspendreTarifAction}>
                    <input type="hidden" name="support" value={t.support} />
                    <button type="submit" className={bouton('danger', 'sm')}>
                      Retirer la validation
                    </button>
                  </form>
                )}
                {t.prix_m2_fcfa === null ? <span className="text-xs text-neutral-500">Saisissez au moins le prix au m² pour pouvoir valider.</span> : null}
              </div>
            </Carte>
          );
        })}
      </div>
    </div>
  );
}

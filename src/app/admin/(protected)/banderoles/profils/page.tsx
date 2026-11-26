import type { Metadata } from 'next';

import { Badge, Carte, Confirmation, EnTete, Flash, bouton, champ, libelle } from '@/components/admin/ui';
import { dateHeure } from '@/lib/admin/format';
import { CHAMPS_PROFIL, ecartsCapacite, SUPPORTS_PROFILS, type LigneProfil } from '@/lib/banner/profils';
import { libelleSupport, supportParId } from '@/lib/grand-format/catalogue';
import { exigerAcces } from '@/server/admin/acces';
import { listerPartenaires } from '@/server/admin/production';
import { capacitePartenaire, listerProfils } from '@/server/banner/profils';

import { archiverProfilAction, creerProfilPartenaireAction, enregistrerProfilAction, retirerValidationAction, validerProfilAction } from './actions';

export const metadata: Metadata = { title: 'Profils d’impression' };
export const dynamic = 'force-dynamic';

const STATUTS = {
  BROUILLON: { label: 'Brouillon', ton: 'neutre' },
  A_VALIDER: { label: 'À valider', ton: 'attente' },
  VALIDE: { label: 'Validé', ton: 'succes' },
  ARCHIVE: { label: 'Archivé', ton: 'neutre' },
} as const;

/** Champs sans objet pour un support rigide : on les montre, sans insister. */
const RIGIDE_SANS_OBJET = new Set(['ourlet_mm', 'oeillet_diametre_mm', 'oeillet_espacement_mm', 'oeillet_marge_mm']);

function FicheProfil({ p, partenaire, ecarts }: { p: LigneProfil; partenaire: string | null; ecarts: string[] }) {
  const s = STATUTS[p.statut];
  const souple = supportParId(p.support)?.finitionsApplicables ?? false;
  return (
    <Carte
      id={`p-${p.id}`}
      titre={<>{p.nom} <span className="font-normal text-neutral-500">· version {p.version}</span></>}
      description={p.est_public ? 'Profil public : repli quand aucun imprimeur n’est affecté' : `Imprimeur : ${partenaire ?? 'inconnu'}`}
      action={<Badge ton={s.ton}>{s.label}</Badge>}
    >
      {p.statut === 'VALIDE' ? <p className="mb-3 text-xs text-neutral-500">Validé par {p.valide_par_email} le {dateHeure(p.valide_le)}.</p> : null}
      {ecarts.length ? (
        <ul className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {ecarts.map((e) => <li key={e}>• {e}</li>)}
          <li className="mt-1">Le profil fait foi pour le rendu ; mettez-le d’accord avec la capacité, ou l’inverse.</li>
        </ul>
      ) : null}
      <form action={enregistrerProfilAction} className="space-y-3">
        <input type="hidden" name="profil_id" value={p.id} />
        <label className={libelle}>
          Nom
          <input name="nom" defaultValue={p.nom} maxLength={120} className={champ} />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CHAMPS_PROFIL.map((c) => (
            <label key={c.cle} className={`${libelle} ${!souple && RIGIDE_SANS_OBJET.has(c.cle) ? 'opacity-50' : ''}`}>
              {c.libelle} ({c.unite})
              <input type="number" name={c.cle} min={c.min} max={c.max} step={1} defaultValue={p[c.cle] ?? ''} placeholder={'facultatif' in c ? 'inconnue' : undefined} className={champ} />
            </label>
          ))}
          <label className={libelle}>
            Au-delà de 5 m
            <select name="mode_grand_format" defaultValue={p.mode_grand_format} className={champ}>
              <option value="PANNEAUX">Panneaux de 5 m</option>
              <option value="PAGE_UNIQUE_USERUNIT">Page unique (UserUnit)</option>
            </select>
          </label>
        </div>
        <label className={libelle}>
          Notes (internes)
          <textarea name="notes" defaultValue={p.notes ?? ''} maxLength={2000} rows={2} className={champ} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={bouton('primaire', 'sm')}>Enregistrer</button>
          <span className="self-center text-xs text-neutral-500">Modifier une valeur retire la validation et crée la version {p.version + 1}.</span>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
        {p.statut !== 'VALIDE' ? (
          <Confirmation resume={<span className={bouton('secondaire', 'sm')}>Valider ce profil</span>}>
            <form action={validerProfilAction} className="space-y-2 text-sm">
              <input type="hidden" name="profil_id" value={p.id} />
              <label className="flex items-start gap-2">
                <input type="checkbox" name="confirmation" value="oui" className="mt-1" />
                <span>L’imprimeur a confirmé ces valeurs (marges, ourlets, œillets, laize, longueur, définition). La validation est enregistrée à mon nom.</span>
              </label>
              <button type="submit" className={bouton('primaire', 'sm')}>Valider</button>
            </form>
          </Confirmation>
        ) : (
          <form action={retirerValidationAction}>
            <input type="hidden" name="profil_id" value={p.id} />
            <button type="submit" className={bouton('discret', 'sm')}>Retirer la validation</button>
          </form>
        )}
        {!p.est_public ? (
          <form action={archiverProfilAction}>
            <input type="hidden" name="profil_id" value={p.id} />
            <button type="submit" className={bouton('discret', 'sm')}>Archiver</button>
          </form>
        ) : null}
      </div>
    </Carte>
  );
}

export default async function PageProfils({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await exigerAcces('grand_format.profils');
  const messages = await searchParams;
  const [profils, partenaires] = await Promise.all([listerProfils({ actifs: true }), listerPartenaires()]);
  const noms = new Map(partenaires.map((p) => [p.id, p.nom]));
  const ecarts = new Map<string, string[]>();
  for (const p of profils) if (p.partenaire_id) ecarts.set(p.id, ecartsCapacite(p, await capacitePartenaire(p.partenaire_id, p.support)));
  const publics = profils.filter((p) => p.est_public);
  const prives = profils.filter((p) => !p.est_public);

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/banderoles', label: 'Banderoles' }}
        surtitre="Banner Studio"
        titre="Profils d’impression"
        description="Ce que chaque imprimeur sait réellement faire. Le Studio et le PDF de production appliquent le profil de l’imprimeur affecté, sinon le profil public du support."
      />
      <Flash
        ok={messages.ok}
        erreur={messages.erreur}
        messages={{ enregistre: 'Profil enregistré.', valide: 'Profil validé.', retire: 'Validation retirée.', archive: 'Profil archivé.', cree: 'Profil créé : vérifiez ses valeurs avec l’imprimeur, puis validez-le.' }}
      />
      <ul className="mb-6 space-y-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        <li>• Tant qu’un profil n’est pas validé, le client et la fiche de production indiquent des contraintes « à confirmer ».</li>
        <li>• Les profils publics sont des valeurs prudentes : aucun n’est livré validé.</li>
        <li>• Un imprimeur qui accepte une banderole fait régénérer son visuel avec son profil ; l’équipe est alertée si le visuel ne passe plus.</li>
      </ul>

      <Carte titre="Nouveau profil d’imprimeur" description="Prérempli depuis le profil public et la capacité grand format validée de l’imprimeur" className="mb-6">
        <form action={creerProfilPartenaireAction} className="flex flex-wrap items-end gap-3">
          <label className={libelle}>
            Imprimeur
            <select name="partenaire_id" required className={champ}>
              {partenaires.filter((p) => p.actif).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </label>
          <label className={libelle}>
            Support
            <select name="support" className={champ}>
              {SUPPORTS_PROFILS.map((s) => <option key={s} value={s}>{libelleSupport(s)}</option>)}
            </select>
          </label>
          <button type="submit" className={bouton('primaire', 'sm')}>Créer</button>
        </form>
      </Carte>

      <h2 className="mb-3 text-sm font-semibold">Profils des imprimeurs ({prives.length})</h2>
      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        {prives.length ? prives.map((p) => <FicheProfil key={p.id} p={p} partenaire={noms.get(p.partenaire_id!) ?? null} ecarts={ecarts.get(p.id) ?? []} />) : <p className="text-sm text-neutral-500">Aucun profil d’imprimeur pour l’instant.</p>}
      </div>
      <h2 className="mb-3 text-sm font-semibold">Profils publics ({publics.length})</h2>
      <div className="grid gap-6 xl:grid-cols-2">
        {publics.map((p) => <FicheProfil key={p.id} p={p} partenaire={null} ecarts={[]} />)}
      </div>
    </div>
  );
}

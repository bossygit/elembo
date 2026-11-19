'use client';

/**
 * Invitation d'un responsable depuis la fiche d'un partenaire (back-office). Le lien, affiché une
 * seule fois, peut être transmis par WhatsApp si l'e-mail n'arrive pas.
 */

import { useActionState } from 'react';

import { inviterResponsableAction, type EtatInvitationAdmin } from '@/app/admin/(protected)/partenaires/actions';
import { LienPartage } from '@/components/partenaire/FormulairesEquipe';
import { bouton, champ, libelle } from './ui';

export function InvitationResponsable({ partenaireId, nom }: { partenaireId: string; nom: string }) {
  const [etat, action, enCours] = useActionState<EtatInvitationAdmin, FormData>(inviterResponsableAction, {});
  return (
    <div className="space-y-3">
      {etat.lien && etat.email ? <LienPartage lien={etat.lien} email={etat.email} nomAtelier={nom} /> : null}
      {etat.erreur ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {etat.erreur}
        </p>
      ) : null}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="partenaire_id" value={partenaireId} />
        <input type="hidden" name="role" value="RESPONSABLE" />
        <label className={`${libelle} min-w-56 flex-1`}>
          Inviter un responsable (e-mail)
          <input type="email" name="email" required maxLength={254} className={champ} />
        </label>
        <button type="submit" className={bouton('primaire', 'sm')} disabled={enCours}>
          {enCours ? 'Création…' : 'Inviter'}
        </button>
      </form>
    </div>
  );
}

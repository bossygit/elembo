'use client';

/**
 * Formulaires de l'équipe d'un atelier : inviter (avec le lien à transmettre, affiché une fois),
 * et, côté personne invitée, créer son compte ou accepter l'invitation.
 */

import { useActionState, useState } from 'react';

import { accepterInvitationAction, accepterInvitationBienvenue, inscrireInvite, type EtatFormulaire } from '@/app/partenaire/actions';
import { inviterAction, type EtatInvitation } from '@/app/partenaire/utilisateurs-actions';
import { MOT_DE_PASSE_MIN } from '@/lib/partenaires/compte';
import { ROLES_PARTENAIRE } from '@/lib/partenaires/droits';
import { DUREE_INVITATION_JOURS } from '@/lib/partenaires/invitations';
import { Alerte, aide, bouton, champ, libelle } from './ui';

/** Lien à transmettre : copie, ou partage WhatsApp (canal habituel des ateliers). */
export function LienPartage({ lien, email, nomAtelier }: { lien: string; email: string; nomAtelier?: string }) {
  const [copie, setCopie] = useState(false);
  const texte = `Invitation à rejoindre ${nomAtelier ?? 'notre atelier'} sur l’espace partenaires Elembo (${email}) : ${lien}`;
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p>
        <strong>Invitation créée pour {email}.</strong> Un e-mail lui est envoyé. Vous pouvez aussi lui transmettre ce lien,
        valable {DUREE_INVITATION_JOURS} jours, qui ne sera plus affiché ensuite :
      </p>
      <p className="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-encre">{lien}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={bouton('secondaire')}
          onClick={() => {
            void navigator.clipboard?.writeText(lien).then(() => setCopie(true));
          }}
        >
          {copie ? 'Lien copié' : 'Copier le lien'}
        </button>
        <a className={bouton('secondaire')} href={`https://wa.me/?text=${encodeURIComponent(texte)}`} target="_blank" rel="noreferrer">
          Envoyer par WhatsApp
        </a>
      </div>
    </div>
  );
}

export function FormulaireInvitation({ nomAtelier }: { nomAtelier: string }) {
  const [etat, action, enCours] = useActionState<EtatInvitation, FormData>(inviterAction, {});
  return (
    <div className="space-y-4">
      {etat.lien && etat.email ? <LienPartage lien={etat.lien} email={etat.email} nomAtelier={nomAtelier} /> : null}
      <form action={action} className="space-y-5">
        {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
        <label className={libelle}>
          E-mail de la personne
          <input className={champ} type="email" name="email" required maxLength={254} defaultValue={etat.valeurs?.email?.[0]} key={etat.valeurs?.email?.[0]} />
        </label>
        <label className={libelle}>
          Rôle
          <select className={`${champ} appearance-auto`} name="role" defaultValue={etat.valeurs?.role?.[0] ?? 'PRODUCTION'} key={etat.valeurs?.role?.[0]}>
            {ROLES_PARTENAIRE.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} — {r.description}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={bouton('primaire')} disabled={enCours} aria-busy={enCours}>
          {enCours ? 'Création…' : 'Inviter'}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------- personne invitée -- */

export function FormulaireCompteInvite({ jeton, email }: { jeton: string; email: string }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(inscrireInvite, {});
  if (etat.ok === 'verifier') {
    return (
      <Alerte ton="succes">
        <strong className="block">Vérifiez votre boîte e-mail.</strong>
        Un lien de confirmation vient d’être envoyé à {email}. Ouvrez-le : vous reviendrez ici pour accepter l’invitation.
      </Alerte>
    );
  }
  if (etat.ok === 'deja_inscrit') {
    return (
      <Alerte ton="info">
        Un compte existe déjà pour {email}. Utilisez « J’ai déjà un compte » pour vous connecter, puis acceptez l’invitation.
      </Alerte>
    );
  }
  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <input type="hidden" name="jeton" value={jeton} />
      <label className={libelle}>
        E-mail
        <input className={champ} type="email" value={email} readOnly disabled />
        <span className={aide}>L’invitation est liée à cette adresse.</span>
      </label>
      <label className={libelle}>
        Mot de passe
        <input className={champ} type="password" name="mot_de_passe" autoComplete="new-password" required minLength={MOT_DE_PASSE_MIN} maxLength={72} />
        <span className={aide}>Au moins {MOT_DE_PASSE_MIN} caractères.</span>
      </label>
      <label className={libelle}>
        Confirmer le mot de passe
        <input className={champ} type="password" name="confirmation" autoComplete="new-password" required maxLength={72} />
      </label>
      <button type="submit" className={`${bouton('primaire')} w-full`} disabled={enCours} aria-busy={enCours}>
        {enCours ? 'Création du compte…' : 'Créer mon compte'}
      </button>
    </form>
  );
}

export function BoutonAccepter({ jeton, atelier }: { jeton: string; atelier: string }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(accepterInvitationAction, {});
  return (
    <form action={action} className="space-y-4">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <input type="hidden" name="jeton" value={jeton} />
      <button type="submit" className={`${bouton('primaire')} w-full`} disabled={enCours} aria-busy={enCours}>
        {enCours ? 'Acceptation…' : `Rejoindre ${atelier}`}
      </button>
    </form>
  );
}

/** « Bienvenue » : rejoindre un atelier qui a invité l'adresse confirmée du compte. */
export function RejoindreAtelier({ invitationId, atelier, role }: { invitationId: string; atelier: string; role: string }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(accepterInvitationBienvenue, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-filet bg-white p-4">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <p className="text-sm">
        <strong>{atelier}</strong> vous invite avec le rôle <strong>{role}</strong>.
      </p>
      <input type="hidden" name="invitation_id" value={invitationId} />
      <button type="submit" className={`${bouton('primaire')} w-full`} disabled={enCours} aria-busy={enCours}>
        {enCours ? 'Acceptation…' : `Rejoindre ${atelier}`}
      </button>
    </form>
  );
}

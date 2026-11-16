'use client';

/**
 * Formulaires d'accès du portail partenaire. La validation fait foi côté serveur (actions) ;
 * les attributs HTML ne servent qu'au confort. En cas d'erreur, les champs non sensibles sont
 * restitués (jamais le mot de passe) et le bouton est désactivé pendant l'envoi (pas de double
 * soumission).
 */

import { useActionState } from 'react';

import {
  connecter,
  creerMonEntreprise,
  definirMotDePasse,
  demanderReinitialisation,
  inscrire,
  type EtatFormulaire,
} from '@/app/partenaire/actions';
import { MOT_DE_PASSE_MIN } from '@/lib/partenaires/compte';
import { Alerte, aide, bouton, champ, libelle } from './ui';

const INITIAL: EtatFormulaire = {};

function Envoyer({ enCours, children, attente }: { enCours: boolean; children: React.ReactNode; attente: string }) {
  return (
    <button type="submit" className={`${bouton('primaire')} w-full`} disabled={enCours} aria-busy={enCours}>
      {enCours ? attente : children}
    </button>
  );
}

function ChampsMotDePasse({ nouveau = true }: { nouveau?: boolean }) {
  return (
    <>
      <label className={libelle}>
        {nouveau ? 'Mot de passe' : 'Nouveau mot de passe'}
        <input
          className={champ}
          type="password"
          name="mot_de_passe"
          autoComplete="new-password"
          required
          minLength={MOT_DE_PASSE_MIN}
          maxLength={72}
        />
        <span className={aide}>Au moins {MOT_DE_PASSE_MIN} caractères. Une courte phrase se retient facilement.</span>
      </label>
      <label className={libelle}>
        Confirmer le mot de passe
        <input className={champ} type="password" name="confirmation" autoComplete="new-password" required maxLength={72} />
      </label>
    </>
  );
}

/* ------------------------------------------------------------- inscription -- */

export function FormulaireInscription() {
  const [etat, action, enCours] = useActionState(inscrire, INITIAL);

  if (etat.ok === 'verifier') {
    return (
      <div className="space-y-4">
        <Alerte ton="succes">
          <strong className="block">Vérifiez votre boîte e-mail.</strong>
          Si cette adresse n’est pas déjà inscrite, un lien de confirmation vient de vous être envoyé. Ouvrez-le pour
          activer votre compte, puis complétez le dossier de votre atelier.
        </Alerte>
        <p className="text-sm text-attenue">Rien reçu après quelques minutes ? Regardez dans les courriers indésirables.</p>
      </div>
    );
  }

  const v = etat.valeurs ?? {};
  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <label className={libelle}>
        Nom de l’entreprise
        <input className={champ} name="nom" autoComplete="organization" required minLength={2} maxLength={120} defaultValue={v.nom} />
      </label>
      <label className={libelle}>
        Téléphone
        <input
          className={champ}
          type="tel"
          name="telephone"
          autoComplete="tel"
          inputMode="tel"
          required
          maxLength={32}
          placeholder="06 000 00 00"
          defaultValue={v.telephone}
        />
      </label>
      <label className={libelle}>
        E-mail
        <input className={champ} type="email" name="email" autoComplete="email" required maxLength={254} defaultValue={v.email} />
        <span className={aide}>Il servira à vous connecter et à recevoir les décisions de Smart Vision.</span>
      </label>
      <ChampsMotDePasse />
      <label className="flex items-start gap-3 text-sm leading-relaxed text-encre">
        <input type="checkbox" name="engagement" value="oui" required className="mt-1 size-5 shrink-0 accent-orange-action" />
        <span>
          J’ai compris que Smart Vision vérifie les informations de mon atelier (machines, capacités, tarifs) avant de me
          confier des travaux.
        </span>
      </label>
      <Envoyer enCours={enCours} attente="Création du compte…">
        Créer mon compte partenaire
      </Envoyer>
    </form>
  );
}

/* --------------------------------------------------------------- connexion -- */

/**
 * `annonce` : message venu de l'adresse (déconnexion, lien expiré…). Il s'efface dès que le
 * formulaire affiche sa propre erreur, pour ne jamais montrer deux messages contradictoires.
 */
export function FormulaireConnexion({ suite, annonce }: { suite: string; annonce?: React.ReactNode }) {
  const [etat, action, enCours] = useActionState(connecter, INITIAL);
  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : annonce}
      <input type="hidden" name="suite" value={suite} />
      <label className={libelle}>
        E-mail
        <input
          className={champ}
          type="email"
          name="email"
          autoComplete="username"
          required
          maxLength={254}
          defaultValue={etat.valeurs?.email}
        />
      </label>
      <label className={libelle}>
        Mot de passe
        <input className={champ} type="password" name="mot_de_passe" autoComplete="current-password" required maxLength={200} />
      </label>
      <Envoyer enCours={enCours} attente="Connexion…">
        Se connecter
      </Envoyer>
    </form>
  );
}

/* ------------------------------------------------------------ mot de passe -- */

export function FormulaireDemandeMotDePasse() {
  const [etat, action, enCours] = useActionState(demanderReinitialisation, INITIAL);
  if (etat.ok === 'envoye') {
    return (
      <Alerte ton="succes">
        <strong className="block">Demande enregistrée.</strong>
        Si un compte partenaire utilise cette adresse, un lien pour choisir un nouveau mot de passe vient d’être envoyé.
        Il est valable une heure.
      </Alerte>
    );
  }
  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <label className={libelle}>
        E-mail du compte
        <input className={champ} type="email" name="email" autoComplete="email" required maxLength={254} />
      </label>
      <Envoyer enCours={enCours} attente="Envoi…">
        Recevoir un lien
      </Envoyer>
    </form>
  );
}

export function FormulaireNouveauMotDePasse() {
  const [etat, action, enCours] = useActionState(definirMotDePasse, INITIAL);
  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <ChampsMotDePasse nouveau={false} />
      <Envoyer enCours={enCours} attente="Enregistrement…">
        Enregistrer le mot de passe
      </Envoyer>
    </form>
  );
}

/* ------------------------------------------------------------- entreprise -- */

export function FormulaireEntreprise({ nom, telephone }: { nom?: string; telephone?: string | null }) {
  const [etat, action, enCours] = useActionState(creerMonEntreprise, INITIAL);
  const v = etat.valeurs ?? {};
  return (
    <form action={action} className="space-y-5">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <label className={libelle}>
        Nom de l’entreprise
        <input className={champ} name="nom" autoComplete="organization" required minLength={2} maxLength={120} defaultValue={v.nom ?? nom} />
      </label>
      <label className={libelle}>
        Téléphone
        <input
          className={champ}
          type="tel"
          name="telephone"
          autoComplete="tel"
          inputMode="tel"
          required
          maxLength={32}
          defaultValue={v.telephone ?? telephone ?? ''}
        />
      </label>
      <Envoyer enCours={enCours} attente="Création…">
        Créer le dossier de mon entreprise
      </Envoyer>
    </form>
  );
}

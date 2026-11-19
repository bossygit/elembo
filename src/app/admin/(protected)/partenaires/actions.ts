'use server';

/**
 * Actions du back-office Elembo Partners. Chaque action vérifie la permission en première
 * instruction (`exigerAcces`), puis délègue aux modules serveur ; la base arbitre les transitions.
 */

import { revalidatePath } from 'next/cache';

import { estUuid, texteChamp } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { lireEntreprise, lireTarif } from '@/lib/partenaires/formulaires';
import { DECISIONS_AVEC_MOTIF } from '@/lib/partenaires/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { ajouterNoteInterne } from '@/server/admin/commandes';
import {
  creerPartenaireAdmin,
  deciderElement,
  deciderPartenaireAdmin,
  modifierPartenaireAdmin,
  type DecisionPartenaireAdmin,
  type TypeElement,
} from '@/server/admin/partenaires';
import { echec, succes } from '@/server/admin/retour';
import {
  demanderModificationTarif,
  refuserTarif,
  retirerTarifValide,
  saisirTarif,
  validerTarif,
} from '@/server/admin/tarifsPartenaires';

const LISTE = '/admin/partenaires';
const fiche = (id: string, ancre?: string) => `/admin/partenaires/${id}${ancre ? `#${ancre}` : ''}`;

function idPartenaire(formData: FormData): string {
  const id = texteChamp(formData.get('partenaire_id'), 64);
  if (!estUuid(id)) echec(LISTE, 'Partenaire invalide.');
  return id;
}

function rafraichir(id?: string) {
  revalidatePath(LISTE);
  revalidatePath(`${LISTE}/validation`);
  if (id) revalidatePath(fiche(id));
}

const DECISIONS: readonly DecisionPartenaireAdmin[] = ['VALIDE', 'REFUSE', 'BROUILLON', 'SUSPENDU', 'ARCHIVE'];

/* ------------------------------------------------------------ entreprise -- */

export async function deciderPartenaireAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.valider');
  const id = idPartenaire(formData);
  const decision = texteChamp(formData.get('decision'), 20) as DecisionPartenaireAdmin;
  if (!DECISIONS.includes(decision)) echec(fiche(id), 'Décision inconnue.');
  // Suspendre, archiver ou réactiver relèvent d'une permission distincte.
  const etatAvant = texteChamp(formData.get('statut_actuel'), 30);
  const suspension = decision === 'SUSPENDU' || decision === 'ARCHIVE' || (decision === 'VALIDE' && ['SUSPENDU', 'ARCHIVE'].includes(etatAvant));
  if (suspension && !peut(staff.role, 'partenaires.suspendre')) echec(fiche(id), 'Action non autorisée pour votre rôle.');
  const motif = texteChamp(formData.get('motif'), 2000) || null;
  if ((DECISIONS_AVEC_MOTIF as readonly string[]).includes(decision) && !motif) echec(fiche(id, 'decision'), 'Indiquez un motif : il est transmis à l’atelier.');
  try {
    await deciderPartenaireAdmin(staff, id, decision, motif);
  } catch (erreur) {
    echec(fiche(id, 'decision'), erreur);
  }
  rafraichir(id);
  succes(fiche(id), `decision-${decision.toLowerCase()}`);
}

export async function enregistrerPartenaireAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.gerer');
  const brut = texteChamp(formData.get('partenaire_id'), 64);
  if (brut && !estUuid(brut)) echec(LISTE, 'Partenaire invalide.');
  const retour = brut ? fiche(brut, 'informations') : `${LISTE}/nouveau`;
  const lu = lireEntreprise(formData);
  if (!lu.ok) echec(retour, lu.erreur);
  let id = brut;
  try {
    if (brut) await modifierPartenaireAdmin(staff, brut, lu.valeur);
    else id = await creerPartenaireAdmin(staff, lu.valeur);
  } catch (erreur) {
    echec(retour, erreur);
  }
  rafraichir(id);
  succes(fiche(id), brut ? 'modifie' : 'cree');
}

export async function noteAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.gerer');
  const id = idPartenaire(formData);
  const contenu = String(formData.get('contenu') ?? '').trim().slice(0, 4000);
  if (!contenu) echec(fiche(id, 'notes'), 'La note est vide.');
  try {
    await ajouterNoteInterne({ entite: 'partenaire', entiteId: id, contenu, auteur: staff.id, auteurEmail: staff.email });
    await journaliser({ staff, action: 'PARTENAIRE_NOTE', entite: 'partenaire', entiteId: id });
  } catch (erreur) {
    echec(fiche(id, 'notes'), erreur);
  }
  rafraichir(id);
  succes(fiche(id, 'notes'), 'note');
}

/* ---------------------------------------- machines, capacités, services -- */

export async function deciderElementAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.valider');
  const type = texteChamp(formData.get('type'), 20) as TypeElement;
  const id = texteChamp(formData.get('id'), 64);
  const decision = texteChamp(formData.get('decision'), 20);
  // Retour : la fiche du partenaire, ou la file de validation si l'action en vient.
  const depuisFile = formData.get('depuis') === 'file';
  const partenaire = texteChamp(formData.get('partenaire_id'), 64);
  const retour = depuisFile || !estUuid(partenaire) ? `${LISTE}/validation` : fiche(partenaire, `${type}s`);
  if (!['machine', 'capacite', 'service'].includes(type) || !estUuid(id) || !['VALIDEE', 'REFUSEE'].includes(decision)) {
    echec(retour, 'Décision invalide.');
  }
  const motif = texteChamp(formData.get('motif'), 1000) || null;
  try {
    await deciderElement(staff, type, id, decision as 'VALIDEE' | 'REFUSEE', motif);
  } catch (erreur) {
    echec(retour, erreur);
  }
  rafraichir(estUuid(partenaire) ? partenaire : undefined);
  succes(retour, decision === 'VALIDEE' ? 'element-valide' : 'element-refuse');
}

/* ------------------------------------------------------------------ tarifs -- */

export async function saisirTarifAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.tarifs_saisir');
  const id = idPartenaire(formData);
  const lignee = texteChamp(formData.get('lignee_id'), 64);
  if (lignee && !estUuid(lignee)) echec(fiche(id, 'tarifs'), 'Tarif invalide.');
  const lu = lireTarif(formData);
  if (!lu.ok) echec(fiche(id, 'tarifs'), lu.erreur);
  try {
    await saisirTarif(staff, id, lignee || null, lu.valeur.champs, lu.valeur.paliers);
  } catch (erreur) {
    echec(fiche(id, 'tarifs'), erreur);
  }
  rafraichir(id);
  succes(fiche(id, 'tarifs'), 'tarif-saisi');
}

export async function deciderTarifAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.tarifs_valider');
  const partenaire = texteChamp(formData.get('partenaire_id'), 64);
  const depuisFile = formData.get('depuis') === 'file';
  const retour = depuisFile || !estUuid(partenaire) ? `${LISTE}/validation` : fiche(partenaire, 'tarifs');
  const tarif = texteChamp(formData.get('tarif_id'), 64);
  const decision = texteChamp(formData.get('decision'), 30);
  if (!estUuid(tarif)) echec(retour, 'Tarif invalide.');
  const motif = texteChamp(formData.get('motif'), 2000);
  const date = (cle: string) => {
    const v = texteChamp(formData.get(cle), 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  try {
    if (decision === 'VALIDER') await validerTarif(staff, tarif, date('valide_du'), date('valide_jusquau'));
    else if (decision === 'REFUSER') await refuserTarif(staff, tarif, motif);
    else if (decision === 'MODIFIER') await demanderModificationTarif(staff, tarif, motif);
    else if (decision === 'RETIRER') await retirerTarifValide(staff, tarif);
    else echec(retour, 'Décision inconnue.');
  } catch (erreur) {
    echec(retour, erreur);
  }
  rafraichir(estUuid(partenaire) ? partenaire : undefined);
  succes(retour, `tarif-${decision.toLowerCase()}`);
}

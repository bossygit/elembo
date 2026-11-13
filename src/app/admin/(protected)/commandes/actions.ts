'use server';

import { revalidatePath } from 'next/cache';

import { entierChamp, estDateIso, estUuid, texteChamp, texteOuNull } from '@/lib/admin/format';
import {
  estModePaiement,
  estStatutCommande,
  libelleCommande,
  transitionPermise,
} from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { ajouterNoteInterne, modifierCoutLigne, modifierLivraison } from '@/server/admin/commandes';
import { echec, succes } from '@/server/admin/retour';
import { commandeParId, confirmerPaiementManuel, transitionnerCommande } from '@/server/commandes/repository';

function fiche(id: string, ancre?: string): string {
  return `/admin/commandes/${id}${ancre ? `#${ancre}` : ''}`;
}

function idCommande(formData: FormData): string {
  const id = texteChamp(formData.get('commande_id'), 64);
  if (!estUuid(id)) echec('/admin/commandes', 'Commande invalide.');
  return id;
}

function rafraichir(id: string) {
  revalidatePath(`/admin/commandes/${id}`);
  revalidatePath('/admin/commandes');
  revalidatePath('/admin/production');
  revalidatePath('/admin');
}

export async function changerStatutCommande(formData: FormData): Promise<void> {
  const staff = await exigerAcces('commandes.statut');
  const id = idCommande(formData);
  const statut = texteChamp(formData.get('statut'), 40);
  const note = texteOuNull(formData.get('note'), 2000);
  const retour = texteChamp(formData.get('retour'), 200).startsWith('/admin/') ? texteChamp(formData.get('retour'), 200) : fiche(id);
  if (!estStatutCommande(statut)) echec(retour, 'Statut inconnu.');

  try {
    const commande = await commandeParId(id);
    if (!commande) echec('/admin/commandes', 'Commande introuvable.');
    // Le rôle est contrôlé contre le statut RÉEL en base, pas celui affiché dans le formulaire.
    if (!transitionPermise(commande.statut, statut, staff.role)) {
      echec(retour, `Votre rôle ne permet pas le passage « ${libelleCommande(commande.statut).label} » → « ${libelleCommande(statut).label} ».`);
    }
    await transitionnerCommande(id, statut, note, staff.id);
    await journaliser({
      staff,
      action: 'COMMANDE_STATUT',
      entite: 'commande',
      entiteId: id,
      avant: { statut: commande.statut },
      apres: { statut, note },
    });
  } catch (erreur) {
    echec(retour, erreur);
  }
  rafraichir(id);
  succes(retour, 'statut');
}

export async function confirmerPaiement(formData: FormData): Promise<void> {
  const staff = await exigerAcces('commandes.paiement');
  const id = idCommande(formData);
  const mode = texteChamp(formData.get('mode_paiement'), 20);
  const reference = texteChamp(formData.get('reference_paiement'), 120);
  if (!estModePaiement(mode) || mode === 'A_CONFIRMER') echec(fiche(id, 'paiement'), 'Choisissez le mode d’encaissement.');
  if (reference.length < 3) echec(fiche(id, 'paiement'), 'Référence d’encaissement obligatoire (3 caractères minimum).');

  try {
    await confirmerPaiementManuel(id, mode, reference, staff.id);
    await journaliser({
      staff,
      action: 'COMMANDE_PAIEMENT_MANUEL',
      entite: 'commande',
      entiteId: id,
      apres: { mode_paiement: mode, reference },
    });
  } catch (erreur) {
    echec(fiche(id, 'paiement'), erreur);
  }
  rafraichir(id);
  succes(fiche(id), 'paiement');
}

export async function ajouterNoteCommande(formData: FormData): Promise<void> {
  const staff = await exigerAcces('commandes.notes');
  const id = idCommande(formData);
  const contenu = texteChamp(formData.get('contenu'), 4000);
  if (!contenu) echec(fiche(id, 'notes'), 'La note est vide.');
  try {
    await ajouterNoteInterne({ entite: 'commande', entiteId: id, contenu, auteur: staff.id, auteurEmail: staff.email });
  } catch (erreur) {
    echec(fiche(id, 'notes'), erreur);
  }
  revalidatePath(`/admin/commandes/${id}`);
  succes(fiche(id, 'notes'), 'note');
}

export async function modifierLivraisonCommande(formData: FormData): Promise<void> {
  const staff = await exigerAcces('commandes.modifier');
  const id = idCommande(formData);
  const date = texteChamp(formData.get('livraison_prevue_le'), 10);
  if (date && !estDateIso(date)) echec(fiche(id, 'livraison'), 'Date de livraison invalide.');
  const champs = {
    ville: texteOuNull(formData.get('ville'), 120),
    adresse: texteOuNull(formData.get('adresse'), 300),
    livraison_prevue_le: date || null,
  };
  try {
    const { avant, apres } = await modifierLivraison(id, champs);
    await journaliser({ staff, action: 'COMMANDE_LIVRAISON', entite: 'commande', entiteId: id, avant, apres });
  } catch (erreur) {
    echec(fiche(id, 'livraison'), erreur);
  }
  rafraichir(id);
  succes(fiche(id), 'livraison');
}

export async function modifierCoutLigneCommande(formData: FormData): Promise<void> {
  const staff = await exigerAcces('commandes.couts');
  const id = idCommande(formData);
  const ligneId = texteChamp(formData.get('ligne_id'), 64);
  const cout = entierChamp(formData.get('cout_unitaire_fcfa'));
  if (!estUuid(ligneId)) echec(fiche(id), 'Ligne invalide.');
  if (cout === null || Number.isNaN(cout) || cout > 100_000_000) echec(fiche(id), 'Coût unitaire invalide.');
  try {
    const { avant, designation } = await modifierCoutLigne(id, ligneId, cout);
    await journaliser({
      staff,
      action: 'COMMANDE_COUT_LIGNE',
      entite: 'commande',
      entiteId: id,
      avant: { ligne: designation, cout_unitaire_fcfa: avant },
      apres: { ligne: designation, cout_unitaire_fcfa: cout },
    });
  } catch (erreur) {
    echec(fiche(id), erreur);
  }
  rafraichir(id);
  succes(fiche(id), 'cout');
}

'use server';

import { revalidatePath } from 'next/cache';

import { estUuid, texteChamp, texteOuNull } from '@/lib/admin/format';
import { estTypeClient } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { modifierClient } from '@/server/admin/clients';
import { ajouterNoteInterne } from '@/server/admin/commandes';
import { echec, succes } from '@/server/admin/retour';

const fiche = (id: string, ancre?: string) => `/admin/clients/${id}${ancre ? `#${ancre}` : ''}`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function idClient(formData: FormData): string {
  const id = texteChamp(formData.get('client_id'), 64);
  if (!estUuid(id)) echec('/admin/clients', 'Client invalide.');
  return id;
}

export async function modifierCoordonneesAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('clients.modifier');
  const id = idClient(formData);
  const chemin = fiche(id, 'coordonnees');
  const nom = texteChamp(formData.get('nom'), 160);
  const telephone = texteChamp(formData.get('telephone'), 32);
  const email = texteOuNull(formData.get('email'), 254)?.toLowerCase() ?? null;
  const type = texteChamp(formData.get('type_client'), 20);
  if (nom.length < 2) echec(chemin, 'Nom obligatoire (2 caractères minimum).');
  if (telephone.length < 6) echec(chemin, 'Téléphone obligatoire.');
  if (email && !EMAIL.test(email)) echec(chemin, 'Email invalide.');
  if (!estTypeClient(type)) echec(chemin, 'Type de client inconnu.');
  const champs = {
    nom,
    telephone,
    email,
    type_client: type,
    societe: texteOuNull(formData.get('societe'), 160),
    adresse: texteOuNull(formData.get('adresse'), 300),
    ville: texteOuNull(formData.get('ville'), 120),
  };
  try {
    const { avant, apres } = await modifierClient(id, champs);
    await journaliser({ staff, action: 'CLIENT_MODIFIE', entite: 'client', entiteId: id, avant, apres });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(id));
  revalidatePath('/admin/clients');
  succes(fiche(id), 'coordonnees');
}

export async function modifierFacturationAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('clients.facturation');
  const id = idClient(formData);
  const chemin = fiche(id, 'facturation');
  const email = texteOuNull(formData.get('facturation_email'), 254)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) echec(chemin, 'Email de facturation invalide.');
  const champs = {
    facturation_raison_sociale: texteOuNull(formData.get('facturation_raison_sociale'), 160),
    facturation_niu: texteOuNull(formData.get('facturation_niu'), 40),
    facturation_rccm: texteOuNull(formData.get('facturation_rccm'), 60),
    facturation_adresse: texteOuNull(formData.get('facturation_adresse'), 300),
    facturation_ville: texteOuNull(formData.get('facturation_ville'), 120),
    facturation_email: email,
  };
  try {
    const { avant, apres } = await modifierClient(id, champs);
    await journaliser({ staff, action: 'CLIENT_FACTURATION', entite: 'client', entiteId: id, avant, apres });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(id));
  succes(fiche(id), 'facturation');
}

export async function modifierNoteCommercialeAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('clients.modifier');
  const id = idClient(formData);
  const contenu = texteChamp(formData.get('contenu'), 4000);
  const synthese = formData.get('synthese') === '1';
  const chemin = fiche(id, 'notes');
  try {
    if (synthese) {
      const { avant, apres } = await modifierClient(id, { notes: contenu || null });
      await journaliser({ staff, action: 'CLIENT_NOTE_SYNTHESE', entite: 'client', entiteId: id, avant: { notes: avant.notes }, apres: { notes: apres.notes } });
    } else {
      if (!contenu) echec(chemin, 'La note est vide.');
      await ajouterNoteInterne({ entite: 'client', entiteId: id, contenu, auteur: staff.id, auteurEmail: staff.email });
    }
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(id));
  succes(chemin, 'note');
}

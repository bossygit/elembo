'use server';

import { revalidatePath } from 'next/cache';

import { entierChamp, estDateIso, estUuid, texteChamp, texteOuNull } from '@/lib/admin/format';
import { estStatutProduction } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { echec, succes } from '@/server/admin/retour';
import {
  creerPartenaire,
  creerTache,
  modifierPartenaire,
  modifierTache,
  type ChampsTache,
} from '@/server/admin/production';

function dossier(id: string, ancre = 'taches'): string {
  return `/admin/production/${id}#${ancre}`;
}

/** Champs communs d'une tâche, validés. `null` + message si invalide. */
function lireTache(formData: FormData): { champs: Omit<ChampsTache, 'etape'> } | { erreur: string } {
  const statut = texteChamp(formData.get('statut'), 20);
  if (!estStatutProduction(statut)) return { erreur: 'État de fabrication inconnu.' };
  const partenaire = texteChamp(formData.get('partenaire_id'), 64);
  if (partenaire && !estUuid(partenaire)) return { erreur: 'Prestataire invalide.' };
  const date = texteChamp(formData.get('date_prevue'), 10);
  if (date && !estDateIso(date)) return { erreur: 'Date prévue invalide.' };
  const cout = entierChamp(formData.get('cout_fcfa'));
  if (cout !== null && (Number.isNaN(cout) || cout > 100_000_000)) return { erreur: 'Coût invalide.' };
  return {
    champs: {
      statut,
      partenaire_id: partenaire || null,
      interne: !partenaire,
      date_prevue: date || null,
      instructions: texteOuNull(formData.get('instructions'), 4000),
      cout_fcfa: cout,
    },
  };
}

function rafraichir(commandeId: string) {
  revalidatePath(`/admin/production/${commandeId}`);
  revalidatePath('/admin/production');
  revalidatePath(`/admin/commandes/${commandeId}`);
}

export async function creerTacheAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('production.modifier');
  const commandeId = texteChamp(formData.get('commande_id'), 64);
  if (!estUuid(commandeId)) echec('/admin/production', 'Commande invalide.');
  const etape = texteChamp(formData.get('etape'), 80);
  if (etape.length < 2) echec(dossier(commandeId, 'nouvelle-tache'), 'Nommez l’étape (impression, découpe, pressage…).');
  const lu = lireTache(formData);
  if ('erreur' in lu) echec(dossier(commandeId, 'nouvelle-tache'), lu.erreur);
  try {
    const tache = await creerTache(commandeId, { etape, ...lu.champs });
    await journaliser({ staff, action: 'PRODUCTION_TACHE_CREEE', entite: 'commande', entiteId: commandeId, apres: { etape, ...lu.champs, id: tache.id } });
  } catch (erreur) {
    echec(dossier(commandeId, 'nouvelle-tache'), erreur);
  }
  rafraichir(commandeId);
  succes(dossier(commandeId), 'tache');
}

export async function modifierTacheAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('production.modifier');
  const commandeId = texteChamp(formData.get('commande_id'), 64);
  const tacheId = texteChamp(formData.get('tache_id'), 64);
  if (!estUuid(commandeId) || !estUuid(tacheId)) echec('/admin/production', 'Tâche invalide.');
  const lu = lireTache(formData);
  if ('erreur' in lu) echec(dossier(commandeId), lu.erreur);
  try {
    const { avant, apres } = await modifierTache(commandeId, tacheId, lu.champs);
    const champs = ['statut', 'partenaire_id', 'date_prevue', 'instructions', 'cout_fcfa'] as const;
    await journaliser({
      staff,
      action: 'PRODUCTION_TACHE',
      entite: 'commande',
      entiteId: commandeId,
      avant: Object.fromEntries([['etape', avant.etape], ...champs.map((c) => [c, avant[c]])]),
      apres: Object.fromEntries([['etape', apres.etape], ...champs.map((c) => [c, apres[c]])]),
    });
  } catch (erreur) {
    echec(dossier(commandeId), erreur);
  }
  rafraichir(commandeId);
  succes(dossier(commandeId), 'tache');
}

/* ------------------------------------------------------------- prestataires -- */

const PRESTATAIRES = '/admin/production/prestataires';

function lirePartenaire(formData: FormData) {
  const nom = texteChamp(formData.get('nom'), 120);
  const specialite = texteChamp(formData.get('specialite'), 120);
  const delai = entierChamp(formData.get('delai_jours'));
  const email = texteOuNull(formData.get('email'), 254);
  if (nom.length < 2 || specialite.length < 2) return { erreur: 'Nom et spécialité obligatoires.' } as const;
  if (delai !== null && (Number.isNaN(delai) || delai > 365)) return { erreur: 'Délai invalide.' } as const;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erreur: 'Email invalide.' } as const;
  return {
    champs: {
      nom,
      specialite,
      telephone: texteOuNull(formData.get('telephone'), 32),
      email,
      delai_jours: delai,
      notes: texteOuNull(formData.get('notes'), 2000),
    },
  } as const;
}

export async function creerPartenaireAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.gerer');
  const lu = lirePartenaire(formData);
  if ('erreur' in lu) echec(PRESTATAIRES, lu.erreur);
  try {
    const p = await creerPartenaire(lu.champs);
    await journaliser({ staff, action: 'PARTENAIRE_CREE', entite: 'partenaire', entiteId: p.id, apres: lu.champs });
  } catch (erreur) {
    echec(PRESTATAIRES, erreur);
  }
  revalidatePath(PRESTATAIRES);
  succes(PRESTATAIRES, 'cree');
}

export async function modifierPartenaireAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('partenaires.gerer');
  const id = texteChamp(formData.get('id'), 64);
  if (!estUuid(id)) echec(PRESTATAIRES, 'Prestataire invalide.');
  const bascule = formData.get('actif');
  try {
    if (bascule === 'true' || bascule === 'false') {
      const { avant, apres } = await modifierPartenaire(id, { actif: bascule === 'true' });
      await journaliser({ staff, action: 'PARTENAIRE_MODIFIE', entite: 'partenaire', entiteId: id, avant: { actif: avant.actif }, apres: { actif: apres.actif } });
    } else {
      const lu = lirePartenaire(formData);
      if ('erreur' in lu) echec(PRESTATAIRES, lu.erreur);
      const { avant, apres } = await modifierPartenaire(id, lu.champs);
      await journaliser({ staff, action: 'PARTENAIRE_MODIFIE', entite: 'partenaire', entiteId: id, avant, apres });
    }
  } catch (erreur) {
    echec(PRESTATAIRES, erreur);
  }
  revalidatePath(PRESTATAIRES);
  succes(PRESTATAIRES, 'modifie');
}

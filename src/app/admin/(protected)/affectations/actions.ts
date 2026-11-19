'use server';

import { revalidatePath } from 'next/cache';

import { entierChamp, estDateIso, estUuid, texteChamp } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { OBJETS_AFFECTATION, PRIORITES_AFFECTATION, SOURCES_TARIF } from '@/lib/partenaires/affectations';
import { exigerAcces } from '@/server/admin/acces';
import { annulerAffectation, proposerAffectation, relancerAffectation } from '@/server/admin/affectations';
import { echec, succes } from '@/server/admin/retour';

const LISTE = '/admin/affectations';

function rafraichir(id: string): void {
  revalidatePath(LISTE);
  revalidatePath(`/admin/affectations/${id}`);
  revalidatePath('/admin/production');
  revalidatePath('/admin/banderoles');
}

export async function annulerAffectationAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('affectations.annuler');
  const id = texteChamp(formData.get('id'), 64);
  if (!estUuid(id)) echec(LISTE, 'Affectation invalide.');
  const motif = texteChamp(formData.get('motif'), 1000);
  try {
    await annulerAffectation(staff, id, motif);
  } catch (erreur) {
    echec(LISTE, erreur);
  }
  rafraichir(id);
  succes(LISTE, 'annulee');
}

export async function relancerAffectationAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('affectations.gerer');
  const id = texteChamp(formData.get('id'), 64);
  if (!estUuid(id)) echec(LISTE, 'Affectation invalide.');
  try {
    await relancerAffectation(staff, id);
  } catch (erreur) {
    echec(LISTE, erreur);
  }
  rafraichir(id);
  succes(LISTE, 'relancee');
}

/** N'accepte que les chemins de retour connus (pas de redirection ouverte). */
function suiteAutorisee(valeur: string | null): string {
  if (!valeur) return LISTE;
  if (valeur === LISTE) return LISTE;
  if (/^\/admin\/production\/[0-9a-f-]{36}$/i.test(valeur)) return valeur;
  if (/^\/admin\/banderoles\/[0-9a-f-]{36}$/i.test(valeur)) return valeur;
  return LISTE;
}

function nombre(valeur: FormDataEntryValue | null): number | null {
  const texte = String(valeur ?? '').replace(',', '.').trim();
  if (!texte) return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : null;
}

function dateIso(valeur: FormDataEntryValue | null): string | null {
  const texte = texteChamp(valeur, 10);
  return texte && estDateIso(texte) ? texte : null;
}

export async function proposerAffectationAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('affectations.gerer');
  const suite = suiteAutorisee(texteChamp(formData.get('suite'), 120));
  const objet = texteChamp(formData.get('objet'), 30);
  if (!OBJETS_AFFECTATION.some((o) => o.id === objet)) echec(suite, 'Objet d’affectation inconnu.');
  const commandeId = texteChamp(formData.get('commande_id'), 64);
  const partenaireId = texteChamp(formData.get('partenaire_id'), 64);
  const tacheId = texteChamp(formData.get('tache_id'), 64) || null;
  const devisId = texteChamp(formData.get('devis_id'), 64) || null;
  if (!estUuid(commandeId) || !estUuid(partenaireId)) echec(suite, 'Affectation invalide.');
  if (tacheId && !estUuid(tacheId)) echec(suite, 'Tâche invalide.');
  if (devisId && !estUuid(devisId)) echec(suite, 'Banderole invalide.');

  const tarifId = texteChamp(formData.get('tarif_id'), 64) || null;
  if (tarifId && !estUuid(tarifId)) echec(suite, 'Tarif invalide.');
  if (!tarifId && !peut(staff.role, 'affectations.couts')) {
    echec(suite, 'Saisir un montant manuel demande la permission « coûts ».');
  }

  const source = texteChamp(formData.get('tarif_source'), 20) || 'MANUEL';
  if (!SOURCES_TARIF.some((s) => s.id === source)) echec(suite, 'Source de montant inconnue.');
  const priorite = texteChamp(formData.get('priorite'), 20) || 'NORMALE';
  if (!PRIORITES_AFFECTATION.some((p) => p.id === priorite)) echec(suite, 'Priorité inconnue.');

  const debut = dateIso(formData.get('date_debut_prevue'));
  const fin = dateIso(formData.get('date_fin_prevue'));
  const limiteBrute = texteChamp(formData.get('date_limite_reponse'), 40);
  const limite = limiteBrute ? new Date(limiteBrute) : null;
  if (limiteBrute && (!limite || Number.isNaN(limite.getTime()))) echec(suite, 'Date limite de réponse invalide.');

  try {
    await proposerAffectation(staff, {
      objet: objet as (typeof OBJETS_AFFECTATION)[number]['id'],
      commandeId,
      tacheId,
      devisId,
      partenaireId,
      tarifId,
      quantiteBase: nombre(formData.get('quantite_base')),
      montantFcfa: entierChamp(formData.get('montant_fcfa')),
      tarifSource: source as (typeof SOURCES_TARIF)[number]['id'],
      tarifMotif: texteChamp(formData.get('tarif_motif'), 1000) || null,
      libelle: texteChamp(formData.get('libelle'), 200),
      support: texteChamp(formData.get('support'), 40) || null,
      quantite: entierChamp(formData.get('quantite')),
      unite: texteChamp(formData.get('unite'), 20) || null,
      surfaceM2: nombre(formData.get('surface_m2')),
      instructions: texteChamp(formData.get('instructions'), 4000) || null,
      priorite: priorite as (typeof PRIORITES_AFFECTATION)[number]['id'],
      dateDebutPrevue: debut,
      dateFinPrevue: fin,
      dateLimiteReponse: limite ? limite.toISOString() : null,
      fichiers: formData.getAll('fichiers').map(String).filter((f) => estUuid(f)),
    });
  } catch (erreur) {
    echec(suite, erreur);
  }
  revalidatePath(LISTE);
  revalidatePath(suite);
  revalidatePath('/admin/production');
  revalidatePath('/admin/banderoles');
  succes(suite, 'affectation');
}

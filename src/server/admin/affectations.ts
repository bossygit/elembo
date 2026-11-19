/**
 * Affectations (Lot 2) — service du back-office. L'appelant a vérifié la permission
 * (`affectations.voir` / `affectations.gerer` / `affectations.annuler`).
 *
 * Le serveur calcule lui-même le montant à partir du tarif validé ; un montant envoyé par le
 * navigateur n'est utilisé que pour les sources MANUEL / ANCIEN_PRIX / SUR_DEVIS, sous la
 * permission `affectations.couts`. La base (migration 0013) reste l'arbitre : partenaire validé
 * et actif, tarif en vigueur, instantané immuable, une seule affectation active par travail.
 */

import { dateLimiteValide, calculerMontant, estPrioriteAffectation, tarifsAffectables, type ObjetAffectation, type PrioriteAffectation, type SourceTarif, type TarifAffectation } from '@/lib/partenaires/affectations';
import type { Staff } from './acces';
import { journaliser } from './audit';
import { listerPartenaires, verifierAffectation } from './production';
import { tarifsDuPartenaire } from './tarifsPartenaires';
import { ErreurIntrouvable, ErreurMetier } from '@/server/partenaires/ecriture';
import { supabaseAdmin } from '@/server/supabase/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verifierId(id: string, quoi = 'Élément'): void {
  if (!UUID.test(id)) throw new ErreurIntrouvable(`${quoi} introuvable.`);
}

function db() {
  return supabaseAdmin();
}

function traduire(error: { code?: string; message: string }): never {
  if (error.code === 'P0002') throw new ErreurIntrouvable(error.message);
  if (error.code === '23505' || error.code === '23514' || error.code === '22023' || error.code === 'P0001' || error.code === '42501') {
    throw new ErreurMetier(error.message);
  }
  throw new Error(error.message);
}

/* ------------------------------------------------------------- lectures -- */

export type LigneAffectation = {
  id: string;
  reference: string;
  objet: ObjetAffectation;
  statut: string;
  libelle: string;
  support: string | null;
  quantite: number | null;
  unite: string | null;
  surface_m2: number | null;
  priorite: PrioriteAffectation;
  date_debut_prevue: string | null;
  date_fin_prevue: string | null;
  date_limite_reponse: string;
  montant_fcfa: number;
  tarif_source: SourceTarif;
  tarif_nom: string | null;
  tarif_version: number | null;
  cree_le: string;
  acceptee_le: string | null;
  commande_id: string;
  tache_id: string | null;
  devis_id: string | null;
  partenaire: { id: string; nom: string } | null;
  commande: { reference: string } | null;
  tache: { etape: string } | null;
};

const SELECTION =
  'id, reference, objet, statut, libelle, support, quantite, unite, surface_m2, priorite, ' +
  'date_debut_prevue, date_fin_prevue, date_limite_reponse, montant_fcfa, tarif_source, ' +
  'tarif_nom, tarif_version, cree_le, acceptee_le, commande_id, tache_id, devis_id, ' +
  'partenaire:partenaires(id, nom), commande:commandes(reference), tache:travaux_production(etape)';

const ORDRE: Record<string, number> = { PROPOSEE: 0, ACCEPTEE: 1, TERMINEE: 2, REFUSEE: 3, EXPIREE: 4, ANNULEE: 5 };

export async function listerAffectations(filtres: {
  statut?: string | null;
  objet?: string | null;
  partenaireId?: string | null;
  retard?: boolean;
  limite?: number;
} = {}): Promise<LigneAffectation[]> {
  let requete = db()
    .from('affectations_production')
    .select(SELECTION)
    .order('cree_le', { ascending: false })
    .limit(filtres.limite ?? 200);
  if (filtres.statut) requete = requete.eq('statut', filtres.statut);
  if (filtres.objet) requete = requete.eq('objet', filtres.objet);
  if (filtres.partenaireId) requete = requete.eq('partenaire_id', filtres.partenaireId);
  if (filtres.retard) {
    requete = requete.eq('statut', 'PROPOSEE').lt('date_limite_reponse', new Date().toISOString());
  }
  const { data, error } = await requete;
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as unknown as LigneAffectation[];
  return lignes.sort((a, b) => {
    const parStatut = (ORDRE[a.statut] ?? 9) - (ORDRE[b.statut] ?? 9);
    return parStatut !== 0 ? parStatut : b.cree_le.localeCompare(a.cree_le);
  });
}

export async function tarifsPartenaireAffectables(partenaireId: string): Promise<TarifAffectation[]> {
  verifierId(partenaireId, 'Partenaire');
  const lignees = await tarifsDuPartenaire(partenaireId);
  return tarifsAffectables(lignees, new Date().toISOString().slice(0, 10));
}

export type FichierPartageable = {
  id: string;
  nom: string;
  type_fichier: string;
  type_mime: string;
  taille_octets: number;
  verifie: boolean;
};

export async function fichiersPartageables(commandeId: string): Promise<FichierPartageable[]> {
  verifierId(commandeId, 'Commande');
  const { data, error } = await db()
    .from('fichiers_commande')
    .select('id, nom, type_fichier, type_mime, taille_octets, verifie')
    .eq('commande_id', commandeId)
    .eq('verifie', true)
    .order('cree_le', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FichierPartageable[];
}

export async function partenairesAffectables() {
  return listerPartenaires({ actifsSeulement: true });
}

export type AffectationCourte = {
  id: string;
  reference: string;
  tache_id: string | null;
  devis_id: string | null;
  statut: string;
  partenaire: { nom: string } | null;
};

export async function affectationsDeCommande(commandeId: string): Promise<AffectationCourte[]> {
  verifierId(commandeId, 'Commande');
  const { data, error } = await db()
    .from('affectations_production')
    .select('id, reference, tache_id, devis_id, statut, partenaire:partenaires(nom)')
    .eq('commande_id', commandeId)
    .order('cree_le', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AffectationCourte[];
}

/** Tarifs validés en vigueur, par atelier — pour le sélecteur du formulaire. */
export async function tarifsParPartenaire(
  partenaires: readonly { id: string }[],
): Promise<Record<string, TarifAffectation[]>> {
  const entrees = await Promise.all(
    partenaires.map(async (p) => [p.id, await tarifsPartenaireAffectables(p.id)] as const),
  );
  return Object.fromEntries(entrees);
}

/* ----------------------------------------------------------- proposition -- */

export type PropositionAffectation = {
  objet: ObjetAffectation;
  commandeId: string;
  tacheId?: string | null;
  devisId?: string | null;
  partenaireId: string;
  tarifId?: string | null;
  quantiteBase?: number | null;
  montantFcfa?: number | null;
  tarifSource: SourceTarif;
  tarifMotif?: string | null;
  libelle: string;
  support?: string | null;
  quantite?: number | null;
  unite?: string | null;
  surfaceM2?: number | null;
  instructions?: string | null;
  priorite: PrioriteAffectation;
  dateDebutPrevue?: string | null;
  dateFinPrevue?: string | null;
  dateLimiteReponse?: string | null;
  fichiers?: string[];
};

export type PropositionValidee = {
  montantFcfa: number;
  quantiteBase: number | null;
  tarifId: string | null;
  tarifSource: SourceTarif;
};

/**
 * Valide la saisie et calcule le montant à partir du tarif. Ne touche pas à la base.
 * Exporté pour les tests et pour l'aperçu du formulaire.
 */
export function validerProposition(
  champs: PropositionAffectation,
  tarifs: readonly TarifAffectation[],
): PropositionValidee {
  if (!champs.libelle || champs.libelle.trim().length < 2 || champs.libelle.trim().length > 200) {
    throw new ErreurMetier('Le libellé de l’affectation doit contenir entre 2 et 200 caractères.');
  }
  if (!estPrioriteAffectation(champs.priorite)) throw new ErreurMetier('Priorité inconnue.');
  if (!dateLimiteValide(champs.dateLimiteReponse)) {
    throw new ErreurMetier('La date limite de réponse doit être au moins une heure dans le futur.');
  }
  if (champs.dateDebutPrevue && champs.dateFinPrevue && champs.dateFinPrevue < champs.dateDebutPrevue) {
    throw new ErreurMetier('La fin prévue ne peut pas précéder le début.');
  }
  if (numNonNuls(champs.tacheId, champs.devisId) !== 1) {
    throw new ErreurMetier('Un travail doit référencer exactement une tâche ou une banderole.');
  }
  if (champs.objet === 'TACHE_PRODUCTION' && !champs.tacheId) throw new ErreurMetier('Tâche de production manquante.');
  if (champs.objet === 'BANDEROLE' && !champs.devisId) throw new ErreurMetier('Banderole manquante.');

  if (champs.tarifId) {
    const tarif = tarifs.find((t) => t.id === champs.tarifId);
    if (!tarif) throw new ErreurMetier('Ce tarif n’est plus validé ou n’est plus en vigueur.');
    if (champs.tarifSource !== 'TARIF_VALIDE') throw new ErreurMetier('Un tarif validé impose la source « tarif validé ».');
    if (champs.quantiteBase === null || champs.quantiteBase === undefined || champs.quantiteBase <= 0) {
      throw new ErreurMetier('La quantité de base est nécessaire pour appliquer le tarif.');
    }
    const calcul = calculerMontant(tarif, champs.quantiteBase);
    if (calcul.type === 'ERREUR') throw new ErreurMetier(calcul.motif);
    return { montantFcfa: calcul.montantFcfa, quantiteBase: champs.quantiteBase, tarifId: tarif.id, tarifSource: 'TARIF_VALIDE' };
  }

  if (champs.tarifSource === 'TARIF_VALIDE') throw new ErreurMetier('Aucun tarif validé sélectionné.');
  if (champs.montantFcfa === null || champs.montantFcfa === undefined || !Number.isInteger(champs.montantFcfa) || champs.montantFcfa < 0) {
    throw new ErreurMetier('Un montant entier positif est nécessaire.');
  }
  if ((champs.tarifSource === 'MANUEL' || champs.tarifSource === 'SUR_DEVIS') && !champs.tarifMotif?.trim()) {
    throw new ErreurMetier('Un motif est obligatoire pour un montant négocié ou provisoire.');
  }
  if (champs.tarifSource === 'SUR_DEVIS' && champs.montantFcfa <= 0) {
    throw new ErreurMetier('Un prix provisoire doit être strictement positif.');
  }
  return {
    montantFcfa: champs.montantFcfa,
    quantiteBase: champs.quantiteBase ?? null,
    tarifId: null,
    tarifSource: champs.tarifSource,
  };
}

function numNonNuls(...valeurs: (string | null | undefined)[]): number {
  return valeurs.filter((v) => Boolean(v)).length;
}

export async function proposerAffectation(staff: Staff, champs: PropositionAffectation): Promise<string> {
  verifierId(champs.commandeId, 'Commande');
  if (champs.tacheId) verifierId(champs.tacheId, 'Tâche');
  if (champs.devisId) verifierId(champs.devisId, 'Banderole');
  verifierId(champs.partenaireId, 'Partenaire');
  if (!UUID.test(champs.commandeId)) throw new ErreurIntrouvable('Commande introuvable.');
  if (!staff.email) throw new ErreurMetier('E-mail du staff inconnu : proposition impossible.');

  await verifierAffectation(champs.partenaireId, null);
  const tarifs = champs.tarifId ? await tarifsPartenaireAffectables(champs.partenaireId) : [];
  const valide = validerProposition(champs, tarifs);

  const donnees = {
    libelle: champs.libelle.trim(),
    support: champs.support ?? null,
    quantite: champs.quantite ?? null,
    unite: champs.unite ?? null,
    surface_m2: champs.surfaceM2 ?? null,
    details: {},
    instructions: champs.instructions?.trim() || null,
    priorite: champs.priorite,
    date_debut_prevue: champs.dateDebutPrevue ?? null,
    date_fin_prevue: champs.dateFinPrevue ?? null,
    date_limite_reponse: champs.dateLimiteReponse ?? null,
    tarif_motif: champs.tarifMotif?.trim() || null,
  };

  const { data, error } = await db().rpc('proposer_affectation', {
    p_objet: champs.objet,
    p_commande_id: champs.commandeId,
    p_tache_id: champs.tacheId ?? null,
    p_devis_id: champs.devisId ?? null,
    p_partenaire_id: champs.partenaireId,
    p_tarif_id: valide.tarifId,
    p_quantite_base: valide.quantiteBase,
    p_montant_fcfa: valide.montantFcfa,
    p_tarif_source: valide.tarifSource,
    p_donnees: donnees,
    p_acteur: staff.id,
    p_acteur_email: staff.email,
  });
  if (error) traduire(error);
  const id = data as string;

  const fichiers = (champs.fichiers ?? []).filter((f) => UUID.test(f));
  if (fichiers.length) {
    const { error: e2 } = await db().rpc('ajouter_fichiers_affectation', {
      p_id: id,
      p_fichiers: fichiers,
      p_acteur: staff.id,
    });
    if (e2) traduire(e2);
  }

  await journaliser({
    staff,
    action: 'AFFECTATION_PROPOSEE',
    entite: 'affectation',
    entiteId: id,
    apres: {
      objet: champs.objet,
      commande_id: champs.commandeId,
      tache_id: champs.tacheId ?? null,
      devis_id: champs.devisId ?? null,
      partenaire_id: champs.partenaireId,
      montant_fcfa: valide.montantFcfa,
      tarif_id: valide.tarifId,
      tarif_source: valide.tarifSource,
      fichiers,
    },
  });
  return id;
}

export async function annulerAffectation(staff: Staff, id: string, motif: string): Promise<void> {
  verifierId(id, 'Affectation');
  const texte = motif.trim().slice(0, 1000);
  if (!texte) throw new ErreurMetier('Un motif est obligatoire pour annuler.');
  if (!staff.email) throw new ErreurMetier('E-mail du staff inconnu : annulation impossible.');
  const { error } = await db().rpc('annuler_affectation', {
    p_id: id,
    p_acteur: staff.id,
    p_acteur_email: staff.email,
    p_motif: texte,
  });
  if (error) traduire(error);
  await journaliser({ staff, action: 'AFFECTATION_ANNULEE', entite: 'affectation', entiteId: id, apres: { motif: texte } });
}

/**
 * Relance : aucune écriture métier, seulement une trace d'audit. L'e-mail au partenaire est
 * branché avec les notifications du sous-lot 2.4.
 */
export async function relancerAffectation(staff: Staff, id: string): Promise<void> {
  verifierId(id, 'Affectation');
  const { data, error } = await db().from('affectations_production').select('statut').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErreurIntrouvable('Affectation introuvable.');
  if (data.statut !== 'PROPOSEE') throw new ErreurMetier('Seule une proposition en attente peut être relancée.');
  await journaliser({ staff, action: 'AFFECTATION_RELANCEE', entite: 'affectation', entiteId: id });
}

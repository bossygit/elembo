/**
 * Données « commandes » du back-office. Toutes les fonctions supposent que l'appelant a déjà
 * vérifié la permission (`exigerAcces`) : elles utilisent le client service_role.
 */

import { supabaseAdmin } from '@/server/supabase/client';
import type { StatutCommande, StatutPaiement } from '@/lib/admin/statuts';

function admin() {
  return supabaseAdmin();
}

export type FiltresCommandes = {
  texte?: string | null;
  statut?: StatutCommande | null;
  paiement?: StatutPaiement | null;
  debut?: string | null;
  fin?: string | null;
  limite?: number;
  decalage?: number;
};

export type CommandeListe = {
  id: string;
  reference: string;
  client_id: string;
  devis_id: string | null;
  statut: StatutCommande;
  statut_paiement: StatutPaiement;
  statut_production: string;
  mode_paiement: string;
  total_fcfa: number;
  sous_total_fcfa: number;
  livraison_fcfa: number;
  cout_fcfa: number;
  marge_fcfa: number;
  ville: string | null;
  contact_snapshot: Record<string, unknown>;
  cree_le: string;
  paye_le: string | null;
  livree_le: string | null;
  livraison_prevue_le: string | null;
};

export async function rechercherCommandes(
  filtres: FiltresCommandes,
): Promise<{ commandes: CommandeListe[]; total: number }> {
  const { data, error } = await admin().rpc('rechercher_commandes', {
    p_texte: filtres.texte?.slice(0, 120) || null,
    p_statut: filtres.statut ?? null,
    p_statut_paiement: filtres.paiement ?? null,
    p_debut: filtres.debut ?? null,
    p_fin: filtres.fin ?? null,
    p_limite: filtres.limite ?? 50,
    p_decalage: filtres.decalage ?? 0,
  });
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as (CommandeListe & { total_lignes: number })[];
  return { commandes: lignes, total: Number(lignes[0]?.total_lignes ?? 0) };
}

/** Compte des commandes par statut (barre de filtres). */
export async function compterParStatut(): Promise<Record<string, number>> {
  const { data, error } = await admin().from('commandes').select('statut');
  if (error) throw new Error(error.message);
  const comptes: Record<string, number> = {};
  for (const ligne of (data ?? []) as { statut: string }[]) {
    comptes[ligne.statut] = (comptes[ligne.statut] ?? 0) + 1;
  }
  return comptes;
}

/* ---------------------------------------------------------- notes internes -- */

export type EntiteNote = 'commande' | 'client' | 'devis';

export type NoteInterne = {
  id: string;
  contenu: string;
  auteur_email: string | null;
  cree_le: string;
};

export async function notesInternes(entite: EntiteNote, entiteId: string): Promise<NoteInterne[]> {
  const { data, error } = await admin()
    .from('notes_internes')
    .select('id, contenu, auteur_email, cree_le')
    .eq('entite', entite)
    .eq('entite_id', entiteId)
    .order('cree_le', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as NoteInterne[];
}

export async function ajouterNoteInterne(options: {
  entite: EntiteNote;
  entiteId: string;
  contenu: string;
  auteur: string;
  auteurEmail: string | null;
}): Promise<void> {
  const { error } = await admin().from('notes_internes').insert({
    entite: options.entite,
    entite_id: options.entiteId,
    contenu: options.contenu,
    auteur: options.auteur,
    auteur_email: options.auteurEmail,
  });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------- historique -- */

export type EvenementHistorique = {
  le: string;
  type: 'statut' | 'audit' | 'note';
  titre: string;
  detail: string | null;
  acteur: string | null;
};

/** Adresses email du personnel, pour afficher l'auteur d'une transition de statut. */
async function emailsUtilisateurs(ids: string[]): Promise<Map<string, string>> {
  const resultat = new Map<string, string>();
  const uniques = [...new Set(ids.filter(Boolean))].slice(0, 20);
  await Promise.all(
    uniques.map(async (id) => {
      try {
        const { data } = await admin().auth.admin.getUserById(id);
        if (data.user?.email) resultat.set(id, data.user.email);
      } catch {
        // Utilisateur supprimé : l'identifiant reste affiché.
      }
    }),
  );
  return resultat;
}

export async function historiqueCommande(
  commandeId: string,
  libelleStatut: (statut: string) => string,
): Promise<EvenementHistorique[]> {
  const [statuts, audit, notes] = await Promise.all([
    admin()
      .from('historique_statuts_commande')
      .select('ancien_statut, nouveau_statut, acteur, note, cree_le')
      .eq('commande_id', commandeId)
      .order('cree_le', { ascending: false })
      .limit(200),
    admin()
      .from('journal_audit')
      .select('action, acteur_email, avant, apres, cree_le')
      .eq('entite', 'commande')
      .eq('entite_id', commandeId)
      .order('cree_le', { ascending: false })
      .limit(200),
    notesInternes('commande', commandeId),
  ]);
  if (statuts.error) throw new Error(statuts.error.message);
  if (audit.error) throw new Error(audit.error.message);

  const lignesStatut = (statuts.data ?? []) as {
    ancien_statut: string;
    nouveau_statut: string;
    acteur: string | null;
    note: string | null;
    cree_le: string;
  }[];
  const emails = await emailsUtilisateurs(lignesStatut.map((l) => l.acteur ?? ''));

  const evenements: EvenementHistorique[] = [
    ...lignesStatut.map((l) => ({
      le: l.cree_le,
      type: 'statut' as const,
      titre:
        l.ancien_statut === l.nouveau_statut
          ? `Création — ${libelleStatut(l.nouveau_statut)}`
          : `${libelleStatut(l.ancien_statut)} → ${libelleStatut(l.nouveau_statut)}`,
      detail: l.note,
      acteur: l.acteur ? emails.get(l.acteur) ?? 'personnel' : 'système',
    })),
    ...((audit.data ?? []) as {
      action: string;
      acteur_email: string | null;
      avant: Record<string, unknown> | null;
      apres: Record<string, unknown> | null;
      cree_le: string;
    }[])
      // Les changements de statut ont déjà leur ligne dédiée.
      .filter((a) => a.action !== 'COMMANDE_STATUT')
      .map((a) => ({
        le: a.cree_le,
        type: 'audit' as const,
        titre: LIBELLES_ACTIONS[a.action] ?? a.action,
        detail: resumeAudit(a.avant, a.apres),
        acteur: a.acteur_email,
      })),
    ...notes.map((n) => ({
      le: n.cree_le,
      type: 'note' as const,
      titre: 'Note interne',
      detail: n.contenu,
      acteur: n.auteur_email,
    })),
  ];
  return evenements.sort((a, b) => b.le.localeCompare(a.le));
}

const LIBELLES_ACTIONS: Record<string, string> = {
  COMMANDE_LIVRAISON: 'Livraison modifiée',
  COMMANDE_COUT_LIGNE: 'Coût de revient modifié',
  COMMANDE_PAIEMENT_MANUEL: 'Paiement confirmé manuellement',
  COMMANDE_NOTE: 'Note interne ajoutée',
  FICHIER_TELECHARGE: 'Fichier de production téléchargé',
  PRODUCTION_TACHE: 'Tâche de production mise à jour',
  PRODUCTION_TACHE_CREEE: 'Tâche de production créée',
};

function resumeAudit(
  avant: Record<string, unknown> | null,
  apres: Record<string, unknown> | null,
): string | null {
  if (!apres) return null;
  const morceaux: string[] = [];
  for (const [cle, valeur] of Object.entries(apres)) {
    if (cle === 'id' || cle === 'commande_id') continue;
    const ancien = avant?.[cle];
    if (avant && JSON.stringify(ancien ?? null) === JSON.stringify(valeur ?? null)) continue;
    const texte = valeur === null || valeur === undefined || valeur === '' ? '—' : String(valeur);
    morceaux.push(avant && cle in avant ? `${cle} : ${ancien ?? '—'} → ${texte}` : `${cle} : ${texte}`);
  }
  return morceaux.length ? morceaux.join(' · ').slice(0, 400) : null;
}

/* ------------------------------------------------------------ modifications -- */

export async function modifierLivraison(
  commandeId: string,
  champs: { ville: string | null; adresse: string | null; livraison_prevue_le: string | null },
): Promise<{ avant: Record<string, unknown>; apres: Record<string, unknown> }> {
  const { data: avant, error: e1 } = await admin()
    .from('commandes')
    .select('ville, adresse, livraison_prevue_le')
    .eq('id', commandeId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new Error('Commande introuvable.');
  const { error } = await admin().from('commandes').update(champs).eq('id', commandeId);
  if (error) throw new Error(error.message);
  return { avant, apres: champs };
}

export async function modifierCoutLigne(
  commandeId: string,
  ligneId: string,
  coutUnitaire: number,
): Promise<{ avant: number; designation: string }> {
  const { data: ligne, error: e1 } = await admin()
    .from('lignes_commande')
    .select('cout_unitaire_fcfa, designation')
    .eq('id', ligneId)
    .eq('commande_id', commandeId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!ligne) throw new Error('Ligne introuvable pour cette commande.');
  const { error } = await admin()
    .from('lignes_commande')
    .update({ cout_unitaire_fcfa: coutUnitaire })
    .eq('id', ligneId)
    .eq('commande_id', commandeId);
  if (error) throw new Error(error.message);
  return { avant: Number(ligne.cout_unitaire_fcfa), designation: String(ligne.designation) };
}

/* ------------------------------------------------------------------ export -- */

export type LigneExport = {
  commande_id: string;
  designation: string;
  produit_id: string | null;
  quantite: number;
  prix_unitaire_fcfa: number;
  cout_unitaire_fcfa: number;
  total_ligne_fcfa: number;
  options: Record<string, unknown>;
};

export async function lignesDesCommandes(ids: string[]): Promise<LigneExport[]> {
  if (ids.length === 0) return [];
  const resultat: LigneExport[] = [];
  // Par paquets : l'URL PostgREST d'un `in.(…)` a une longueur limitée.
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin()
      .from('lignes_commande')
      .select('commande_id, designation, produit_id, quantite, prix_unitaire_fcfa, cout_unitaire_fcfa, total_ligne_fcfa, options')
      .in('commande_id', ids.slice(i, i + 150))
      .order('cree_le');
    if (error) throw new Error(error.message);
    resultat.push(...((data ?? []) as LigneExport[]));
  }
  return resultat;
}

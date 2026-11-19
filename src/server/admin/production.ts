/**
 * Données de la vue atelier et des dossiers de production. L'appelant a vérifié la permission.
 */

import { supabaseAdmin } from '@/server/supabase/client';
import { STATUTS_ATELIER, type StatutCommande, type StatutProduction } from '@/lib/admin/statuts';
import { SUPPORTS } from '@/lib/grand-format/catalogue';
import { profilGrandFormat } from '@/lib/partenaires/coutGrandFormat';
import type { StatutPartenaire } from '@/lib/partenaires/statuts';

function admin() {
  return supabaseAdmin();
}

export type Tache = {
  id: string;
  commande_id: string;
  etape: string;
  statut: StatutProduction;
  partenaire_id: string | null;
  interne: boolean;
  date_prevue: string | null;
  instructions: string | null;
  cout_fcfa: number | null;
  termine_le: string | null;
  maj_le: string;
  partenaire?: { nom: string; specialite: string } | null;
};

export type LigneProduction = {
  id: string;
  designation: string;
  quantite: number;
  produit_id: string | null;
  options: Record<string, unknown>;
};

export type FichierProduction = {
  id: string;
  nom: string;
  type_mime: string;
  taille_octets: number;
  type_fichier: string;
  fournisseur: string;
  verifie: boolean;
  cree_le: string;
};

export type CommandeAtelier = {
  id: string;
  reference: string;
  statut: StatutCommande;
  statut_production: StatutProduction;
  livraison_prevue_le: string | null;
  paye_le: string | null;
  ville: string | null;
  contact_snapshot: Record<string, unknown>;
  design_snapshot: Record<string, unknown>;
  lignes: LigneProduction[];
  travaux: Tache[];
  fichiers: Pick<FichierProduction, 'id' | 'type_fichier' | 'type_mime'>[];
};

export type Partenaire = {
  id: string;
  nom: string;
  specialite: string;
  telephone: string | null;
  email: string | null;
  delai_jours: number | null;
  notes: string | null;
  actif: boolean;
  /** Cycle de validation Elembo Partners. Affectable = VALIDE et actif (`partenaireAffectable`). */
  statut: StatutPartenaire;
  contact_nom: string | null;
  adresse: string | null;
  /** Supports maîtrisés (BANDEROLE, BACHE, ROLL_UP…). */
  types_impression: string[];
  largeur_max_m: number | null;
  longueur_max_m: number | null;
  /** HÉRITÉ — ancien prix au m², non validé ; remplacé par `partenaire_tarifs`. CONFIDENTIEL (`grand_format.couts`). */
  tarifs: { prix_m2_fcfa?: number | null; conditions?: string | null };
};

const SELECTION_ATELIER = `
  id, reference, statut, statut_production, livraison_prevue_le, paye_le, ville,
  contact_snapshot, design_snapshot,
  lignes:lignes_commande(id, designation, quantite, produit_id, options),
  travaux:travaux_production(id, commande_id, etape, statut, partenaire_id, interne, date_prevue, instructions, cout_fcfa, termine_le, maj_le, partenaire:partenaires(nom, specialite)),
  fichiers:fichiers_commande(id, type_fichier, type_mime)
`;

export async function commandesAtelier(filtres: {
  statut?: StatutCommande | null;
  partenaireId?: string | null;
}): Promise<CommandeAtelier[]> {
  const statuts = filtres.statut && STATUTS_ATELIER.includes(filtres.statut) ? [filtres.statut] : [...STATUTS_ATELIER];
  const { data, error } = await admin()
    .from('commandes')
    .select(SELECTION_ATELIER)
    .in('statut', statuts)
    .order('livraison_prevue_le', { ascending: true, nullsFirst: false })
    .order('paye_le', { ascending: true, nullsFirst: false })
    .limit(300);
  if (error) throw new Error(error.message);
  let commandes = (data ?? []) as unknown as CommandeAtelier[];
  if (filtres.partenaireId) {
    commandes = commandes.filter((c) => c.travaux.some((t) => t.partenaire_id === filtres.partenaireId));
  }
  return commandes;
}

export type DossierProduction = {
  commande: CommandeAtelier & {
    notes: string | null;
    adresse: string | null;
    cree_le: string;
    devis_id: string | null;
  };
  fichiers: FichierProduction[];
};

export async function dossierProduction(commandeId: string): Promise<DossierProduction | null> {
  const { data, error } = await admin()
    .from('commandes')
    .select(`${SELECTION_ATELIER}, notes, adresse, cree_le, devis_id`)
    .eq('id', commandeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: fichiers, error: e2 } = await admin()
    .from('fichiers_commande')
    .select('id, nom, type_mime, taille_octets, type_fichier, fournisseur, verifie, cree_le')
    .eq('commande_id', commandeId)
    .order('type_fichier')
    .order('nom');
  if (e2) throw new Error(e2.message);
  return {
    commande: data as unknown as DossierProduction['commande'],
    fichiers: (fichiers ?? []) as FichierProduction[],
  };
}

/* ------------------------------------------------------- synthèse atelier -- */

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null;
}

/**
 * Quantités par taille et par couleur d'une commande. La taille vient des options de ligne ;
 * la couleur des options de ligne, sinon de l'instantané de conception (commande directe).
 */
export function quantitesParTailleCouleur(
  lignes: LigneProduction[],
  design: Record<string, unknown>,
): { taille: string; couleur: string; quantite: number }[] {
  const couleurDefaut = texte(design.couleur) ?? texte((design.produit as Record<string, unknown> | undefined)?.couleur) ?? '—';
  const cumul = new Map<string, { taille: string; couleur: string; quantite: number }>();
  for (const ligne of lignes) {
    const options = ligne.options ?? {};
    const taille = texte(options.taille) ?? texte(options.formatId) ?? '—';
    const couleur = texte(options.couleur) ?? couleurDefaut;
    const cle = `${taille}|${couleur}`;
    const actuel = cumul.get(cle) ?? { taille, couleur, quantite: 0 };
    actuel.quantite += Number(ligne.quantite) || 0;
    cumul.set(cle, actuel);
  }
  return [...cumul.values()];
}

export function quantiteTotale(lignes: LigneProduction[]): number {
  return lignes.reduce((total, l) => total + (Number(l.quantite) || 0), 0);
}

/* ------------------------------------------------------------------ tâches -- */

export type ChampsTache = {
  etape: string;
  statut: StatutProduction;
  partenaire_id: string | null;
  interne: boolean;
  date_prevue: string | null;
  instructions: string | null;
  cout_fcfa: number | null;
};

/**
 * Un partenaire ne reçoit un NOUVEAU travail que s'il est validé et actif (CDC §4.2). Conserver
 * l'imprimeur déjà affecté reste possible (ex. : partenaire suspendu après l'affectation).
 */
export async function verifierAffectation(nouveau: string | null | undefined, actuel: string | null): Promise<void> {
  if (!nouveau || nouveau === actuel) return;
  const { data, error } = await admin().from('partenaires').select('statut, actif').eq('id', nouveau).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.statut !== 'VALIDE' || !data.actif) {
    throw new Error('Ce partenaire n’est pas validé ou n’est pas actif : il ne peut pas recevoir de travaux.');
  }
}

export async function creerTache(commandeId: string, champs: ChampsTache): Promise<Tache> {
  await verifierAffectation(champs.partenaire_id, null);
  const { data, error } = await admin()
    .from('travaux_production')
    .insert({
      commande_id: commandeId,
      ...champs,
      termine_le: champs.statut === 'TERMINE' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Cette étape existe déjà pour la commande.');
    throw new Error(error.message);
  }
  return data as Tache;
}

export async function modifierTache(
  commandeId: string,
  tacheId: string,
  champs: Omit<ChampsTache, 'etape'>,
): Promise<{ avant: Tache; apres: Tache }> {
  const { data: avant, error: e1 } = await admin()
    .from('travaux_production')
    .select('*')
    .eq('id', tacheId)
    .eq('commande_id', commandeId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new Error('Tâche introuvable pour cette commande.');
  await verifierAffectation(champs.partenaire_id, (avant as Tache).partenaire_id);
  const termine_le =
    champs.statut === 'TERMINE' ? (avant as Tache).termine_le ?? new Date().toISOString() : null;
  const { data: apres, error } = await admin()
    .from('travaux_production')
    .update({ ...champs, termine_le })
    .eq('id', tacheId)
    .eq('commande_id', commandeId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return { avant: avant as Tache, apres: apres as Tache };
}

/* ------------------------------------------------------------- partenaires -- */

export async function listerPartenaires(options: { actifsSeulement?: boolean } = {}): Promise<Partenaire[]> {
  let requete = admin()
    .from('partenaires')
    .select('id, nom, specialite, telephone, email, delai_jours, notes, actif, statut, contact_nom, adresse, types_impression, largeur_max_m, longueur_max_m, tarifs')
    .order('actif', { ascending: false })
    .order('nom');
  if (options.actifsSeulement) requete = requete.eq('actif', true).eq('statut', 'VALIDE');
  const { data, error } = await requete;
  if (error) throw new Error(error.message);
  const partenaires = (data ?? []) as Partenaire[];

  // Supports et laize : déduits des capacités grand format VALIDÉES (Elembo Partners, §4.8).
  const { data: capacites, error: e2 } = partenaires.length
    ? await admin()
        .from('partenaire_capacites')
        .select('partenaire_id, prestation, largeur_max_mm, longueur_max_mm')
        .in('partenaire_id', partenaires.map((p) => p.id))
        .eq('categorie', 'GRAND_FORMAT')
        .eq('statut_validation', 'VALIDEE')
        .eq('actif', true)
    : { data: [], error: null };
  if (e2) throw new Error(e2.message);
  const supports = SUPPORTS.map((s) => s.id as string);

  return partenaires.map((p) => {
    const ancien = {
      types_impression: p.types_impression ?? [],
      largeur_max_m: p.largeur_max_m === null ? null : Number(p.largeur_max_m),
      longueur_max_m: p.longueur_max_m === null ? null : Number(p.longueur_max_m),
    };
    const siennes = (capacites ?? []).filter((c) => c.partenaire_id === p.id) as {
      prestation: string;
      largeur_max_mm: number | null;
      longueur_max_mm: number | null;
    }[];
    return {
      ...p,
      ...profilGrandFormat(siennes, supports, ancien),
      tarifs: p.tarifs && typeof p.tarifs === 'object' ? p.tarifs : {},
    };
  });
}

/**
 * Lecture du dossier de l'entreprise pour le portail.
 *
 * Volontairement faite avec le client de la SESSION de l'utilisateur (clé anon + jeton) : la RLS
 * de la migration 0012 s'applique réellement et constitue une seconde barrière effective. Un bug
 * de filtrage ici ne peut pas exposer les données d'une autre entreprise.
 *
 * L'appelant a déjà obtenu la session par `exigerPartenaire`.
 */

import type { SessionPartenaire } from '@/lib/partenaires/compte';
import type { StatutPartenaire, StatutValidation } from '@/lib/partenaires/statuts';
import { creerClientAuthServeur } from '@/server/auth/session';
import { supabaseAdmin } from '@/server/supabase/client';

export type FichePartenaire = {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  statut: StatutPartenaire;
  motif_decision: string | null;
  soumis_le: string | null;
  valide_le: string | null;
};

export type ResumeDossier = {
  fiche: FichePartenaire;
  machines: number;
  capacites: number;
  services: number;
  utilisateurs: number;
};

export async function resumeDossier(session: SessionPartenaire): Promise<ResumeDossier | null> {
  const client = await creerClientAuthServeur();
  const compter = async (table: string, filtre?: [string, boolean]) => {
    let q = client.from(table).select('id', { count: 'exact', head: true });
    if (filtre) q = q.eq(filtre[0], filtre[1]);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [{ data: fiches, error }, machines, capacites, services, utilisateurs] = await Promise.all([
    client.rpc('mon_partenaire'),
    compter('partenaire_machines', ['archive', false]),
    compter('partenaire_capacites', ['actif', true]),
    compter('partenaire_services', ['actif', true]),
    compter('partenaire_utilisateurs', ['actif', true]),
  ]);
  if (error) throw new Error(error.message);
  const fiche = ((fiches ?? []) as FichePartenaire[])[0];
  // Garde-fou : la fiche renvoyée par la RLS doit être celle de la session.
  if (!fiche || fiche.id !== session.partenaireId) return null;
  return { fiche, machines, capacites, services, utilisateurs };
}

/**
 * Motif d'une suspension. Lu avec service_role : une entreprise suspendue n'a plus de session
 * RLS (c'est voulu). L'identifiant vient de la session vérifiée, jamais de la requête.
 */
export async function motifSuspension(partenaireId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('partenaires')
    .select('motif_decision')
    .eq('id', partenaireId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.motif_decision as string | null) ?? null;
}

/* ===================================================== lectures détaillées ==== */
/*
 * Toutes faites avec la session de l'utilisateur (RLS). Un identifiant d'une autre entreprise
 * ne renvoie rien : la page répond 404 (`notFound()`), sans révéler l'existence de l'objet.
 */


export type FicheComplete = FichePartenaire & {
  raison_sociale: string | null;
  specialite: string;
  description: string | null;
  annee_creation: number | null;
  rccm: string | null;
  niu: string | null;
  site_web: string | null;
  whatsapp: string | null;
  contact_nom: string | null;
  contact_fonction: string | null;
  adresse: string | null;
  ville: string | null;
  quartier: string | null;
  localisation: string | null;
  zone_desservie: string | null;
  delai_jours: number | null;
  quantites_minimales: string | null;
  conditions_particulieres: string | null;
};

export async function maFiche(session: SessionPartenaire): Promise<FicheComplete | null> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client.rpc('mon_partenaire');
  if (error) throw new Error(error.message);
  const fiche = ((data ?? []) as FicheComplete[])[0];
  return fiche && fiche.id === session.partenaireId ? fiche : null;
}

export type Validation = { statut_validation: StatutValidation; motif_refus: string | null; valide_le: string | null };

export type Machine = Validation & {
  id: string;
  famille: string;
  type_machine: string;
  nom: string;
  marque: string | null;
  modele: string | null;
  technologie: string | null;
  annee_acquisition: number | null;
  quantite: number;
  largeur_max_mm: number | null;
  longueur_max_mm: number | null;
  resolution_dpi: number | null;
  vitesse: number | null;
  unite_vitesse: string | null;
  supports_compatibles: string[];
  formats_compatibles: string[];
  etat: string;
  derniere_maintenance_le: string | null;
  prochaine_maintenance_le: string | null;
  archive: boolean;
  maj_le: string;
};

const COLONNES_MACHINE =
  'id, famille, type_machine, nom, marque, modele, technologie, annee_acquisition, quantite, largeur_max_mm, longueur_max_mm, resolution_dpi, vitesse, unite_vitesse, supports_compatibles, formats_compatibles, etat, derniere_maintenance_le, prochaine_maintenance_le, archive, statut_validation, motif_refus, valide_le, maj_le';

export async function mesMachines(options: { avecArchives?: boolean } = {}): Promise<Machine[]> {
  const client = await creerClientAuthServeur();
  let q = client.from('partenaire_machines').select(COLONNES_MACHINE).order('archive').order('famille').order('nom').limit(200);
  if (!options.avecArchives) q = q.eq('archive', false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Machine[]).map((m) => ({ ...m, vitesse: m.vitesse === null ? null : Number(m.vitesse) }));
}

export async function maMachine(id: string): Promise<Machine | null> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client.from('partenaire_machines').select(COLONNES_MACHINE).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...(data as Machine), vitesse: data.vitesse === null ? null : Number(data.vitesse) } : null;
}

export type Capacite = Validation & {
  id: string;
  categorie: string;
  prestation: string;
  nom: string;
  technologie: string | null;
  largeur_min_mm: number | null;
  largeur_max_mm: number | null;
  longueur_min_mm: number | null;
  longueur_max_mm: number | null;
  supports_compatibles: string[];
  matieres: string[];
  finitions: string[];
  quantite_min: number | null;
  capacite_journaliere: number | null;
  capacite_hebdomadaire: number | null;
  unite_capacite: string;
  delai_jours: number | null;
  delai_express_jours: number | null;
  contraintes: string | null;
  actif: boolean;
  machines: string[];
};

const COLONNES_CAPACITE =
  'id, categorie, prestation, nom, technologie, largeur_min_mm, largeur_max_mm, longueur_min_mm, longueur_max_mm, supports_compatibles, matieres, finitions, quantite_min, capacite_journaliere, capacite_hebdomadaire, unite_capacite, delai_jours, delai_express_jours, contraintes, actif, statut_validation, motif_refus, valide_le, liens:partenaire_capacite_machines(machine_id)';

function versCapacite(ligne: Record<string, unknown>): Capacite {
  const { liens, ...reste } = ligne as Capacite & { liens: { machine_id: string }[] | null };
  return {
    ...reste,
    capacite_journaliere: reste.capacite_journaliere === null ? null : Number(reste.capacite_journaliere),
    capacite_hebdomadaire: reste.capacite_hebdomadaire === null ? null : Number(reste.capacite_hebdomadaire),
    machines: (liens ?? []).map((l) => l.machine_id),
  };
}

export async function mesCapacites(): Promise<Capacite[]> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client
    .from('partenaire_capacites')
    .select(COLONNES_CAPACITE)
    .order('actif', { ascending: false })
    .order('categorie')
    .order('nom')
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => versCapacite(l as Record<string, unknown>));
}

export async function maCapacite(id: string): Promise<Capacite | null> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client.from('partenaire_capacites').select(COLONNES_CAPACITE).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? versCapacite(data as Record<string, unknown>) : null;
}

export type Service = Validation & {
  id: string;
  nom: string;
  categorie: string;
  capacite_id: string | null;
  description: string | null;
  delai_jours: number | null;
  quantite_min: number | null;
  conditions: string | null;
  realise_par_tiers: boolean;
  tiers_precision: string | null;
  actif: boolean;
};

const COLONNES_SERVICE =
  'id, nom, categorie, capacite_id, description, delai_jours, quantite_min, conditions, realise_par_tiers, tiers_precision, actif, statut_validation, motif_refus, valide_le';

export async function mesServices(): Promise<Service[]> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client
    .from('partenaire_services')
    .select(COLONNES_SERVICE)
    .order('actif', { ascending: false })
    .order('nom')
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as Service[];
}

export async function monService(id: string): Promise<Service | null> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client.from('partenaire_services').select(COLONNES_SERVICE).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Service | null) ?? null;
}

export type Disponibilite = {
  id: string;
  statut: string;
  debut_periode: string;
  fin_periode: string | null;
  delai_moyen_jours: number | null;
  commentaire: string | null;
  cree_le: string;
};

export async function mesDisponibilites(limite = 30): Promise<Disponibilite[]> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client
    .from('partenaire_disponibilites')
    .select('id, statut, debut_periode, fin_periode, delai_moyen_jours, commentaire, cree_le')
    .order('debut_periode', { ascending: false })
    .order('cree_le', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as Disponibilite[];
}

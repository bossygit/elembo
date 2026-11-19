/**
 * Écritures du dossier partenaire (service_role), appelées par les actions du portail APRÈS
 * `exigerPartenaire`.
 *
 * Règles :
 *  - `partenaire_id` vient TOUJOURS de la session (`SessionPartenaire`), jamais de la requête ;
 *  - toute écriture sur un objet existant est filtrée par `id` ET `partenaire_id` : un
 *    identifiant appartenant à une autre entreprise ne trouve rien (`ErreurIntrouvable` → 404) ;
 *  - seules les colonnes des lecteurs de `formulaires.ts` sont écrites (liste blanche) ;
 *  - la base reste l'arbitre : triggers de cohérence entre entreprises, réinitialisation de la
 *    validation sur changement technique, transitions de statut.
 */

import type { SessionPartenaire } from '@/lib/partenaires/compte';
import type {
  ChampsCapacite,
  ChampsDisponibilite,
  ChampsEntreprise,
  ChampsEtatMachine,
  ChampsMachine,
  ChampsService,
} from '@/lib/partenaires/formulaires';
import { journaliser } from '@/server/admin/audit';
import { supabaseAdmin } from '@/server/supabase/client';

export class ErreurIntrouvable extends Error {
  readonly statut = 404;
  constructor(message = 'Élément introuvable.') {
    super(message);
    this.name = 'ErreurIntrouvable';
  }
}

/** Erreur métier renvoyée par la base (contrainte, trigger) : son message est affichable. */
export class ErreurMetier extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurMetier';
  }
}

function db() {
  return supabaseAdmin();
}

const acteur = (s: SessionPartenaire) => ({ id: s.userId, email: s.email });

/** Traduit une erreur PostgREST : contrainte métier (23514) affichable, le reste générique. */
function traduire(error: { code?: string; message: string }): never {
  if (error.code === '23514' || error.code === 'P0001') throw new ErreurMetier(error.message);
  if (error.code === '23505') throw new ErreurMetier('Cet élément existe déjà.');
  if (error.code === '23503') throw new ErreurMetier('Un élément lié n’existe plus.');
  throw new Error(error.message);
}

/* --------------------------------------------------------------- entreprise -- */

export async function modifierEntreprise(session: SessionPartenaire, champs: ChampsEntreprise): Promise<void> {
  const { data, error } = await db()
    .from('partenaires')
    .update(champs)
    .eq('id', session.partenaireId)
    .select('id')
    .maybeSingle();
  if (error) traduire(error);
  if (!data) throw new ErreurIntrouvable();
  await journaliser({ staff: acteur(session), action: 'PARTENAIRE_PROFIL_MODIFIE', entite: 'partenaire', entiteId: session.partenaireId, apres: champs });
}

/* ----------------------------------------------------------------- machines -- */

export async function creerMachine(session: SessionPartenaire, champs: ChampsMachine): Promise<string> {
  const { data, error } = await db()
    .from('partenaire_machines')
    .insert({ ...champs, partenaire_id: session.partenaireId })
    .select('id')
    .single();
  if (error) traduire(error);
  await journaliser({ staff: acteur(session), action: 'PARTENAIRE_MACHINE_CREEE', entite: 'partenaire', entiteId: session.partenaireId, apres: { id: data.id, ...champs } });
  return data.id as string;
}

async function majMachine(session: SessionPartenaire, id: string, champs: Partial<ChampsMachine> & { archive?: boolean }, action: string) {
  const { data: avant, error: e1 } = await db()
    .from('partenaire_machines')
    .select('*')
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .maybeSingle();
  if (e1) traduire(e1);
  if (!avant) throw new ErreurIntrouvable('Machine introuvable.');
  const { data: apres, error } = await db()
    .from('partenaire_machines')
    .update(champs)
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .select('*')
    .single();
  if (error) traduire(error);
  await journaliser({ staff: acteur(session), action, entite: 'partenaire', entiteId: session.partenaireId, avant, apres });
}

export async function modifierMachine(session: SessionPartenaire, id: string, champs: ChampsMachine): Promise<void> {
  await majMachine(session, id, champs, 'PARTENAIRE_MACHINE_MODIFIEE');
}

/** État de fonctionnement et maintenance (droit `machines.etat`) : ne fait pas tomber la validation. */
export async function modifierEtatMachine(session: SessionPartenaire, id: string, champs: ChampsEtatMachine): Promise<void> {
  await majMachine(session, id, champs, 'PARTENAIRE_MACHINE_ETAT');
}

/** Retire la machine de la liste et des capacités qui l'utilisaient (l'historique reste en audit). */
export async function archiverMachine(session: SessionPartenaire, id: string): Promise<void> {
  // `majMachine` vérifie d'abord que la machine appartient à l'entreprise de la session.
  await majMachine(session, id, { archive: true }, 'PARTENAIRE_MACHINE_ARCHIVEE');
  const { error } = await db().from('partenaire_capacite_machines').delete().eq('machine_id', id);
  if (error) traduire(error);
}

/* ---------------------------------------------------------------- capacités -- */

/**
 * Remplace les machines associées à une capacité. Ajout d'abord (idempotent), retrait ensuite :
 * en cas d'échec entre les deux, la capacité garde au pire une machine de trop, jamais une
 * association vers une machine d'une autre entreprise (trigger `verifier_meme_partenaire`).
 */
async function definirMachines(session: SessionPartenaire, capaciteId: string, machines: string[]): Promise<void> {
  let valides: string[] = [];
  if (machines.length) {
    const { data, error } = await db()
      .from('partenaire_machines')
      .select('id')
      .eq('partenaire_id', session.partenaireId)
      .eq('archive', false)
      .in('id', machines);
    if (error) traduire(error);
    valides = (data ?? []).map((m) => m.id as string);
  }
  if (valides.length) {
    const { error } = await db()
      .from('partenaire_capacite_machines')
      .upsert(valides.map((machine_id) => ({ capacite_id: capaciteId, machine_id })), { onConflict: 'capacite_id,machine_id', ignoreDuplicates: true });
    if (error) traduire(error);
  }
  let retrait = db().from('partenaire_capacite_machines').delete().eq('capacite_id', capaciteId);
  if (valides.length) retrait = retrait.not('machine_id', 'in', `(${valides.join(',')})`);
  const { error } = await retrait;
  if (error) traduire(error);
}

export async function creerCapacite(session: SessionPartenaire, champs: ChampsCapacite, machines: string[]): Promise<string> {
  const { data, error } = await db()
    .from('partenaire_capacites')
    .insert({ ...champs, partenaire_id: session.partenaireId })
    .select('id')
    .single();
  if (error) traduire(error);
  await definirMachines(session, data.id as string, machines);
  await journaliser({ staff: acteur(session), action: 'PARTENAIRE_CAPACITE_CREEE', entite: 'partenaire', entiteId: session.partenaireId, apres: { id: data.id, ...champs, machines } });
  return data.id as string;
}

async function majCapacite(session: SessionPartenaire, id: string, champs: Partial<ChampsCapacite> & { actif?: boolean }, action: string) {
  const { data: avant, error: e1 } = await db()
    .from('partenaire_capacites')
    .select('*')
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .maybeSingle();
  if (e1) traduire(e1);
  if (!avant) throw new ErreurIntrouvable('Capacité introuvable.');
  const { data: apres, error } = await db()
    .from('partenaire_capacites')
    .update(champs)
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .select('*')
    .single();
  if (error) traduire(error);
  await journaliser({ staff: acteur(session), action, entite: 'partenaire', entiteId: session.partenaireId, avant, apres });
}

export async function modifierCapacite(session: SessionPartenaire, id: string, champs: ChampsCapacite, machines: string[]): Promise<void> {
  await majCapacite(session, id, champs, 'PARTENAIRE_CAPACITE_MODIFIEE');
  await definirMachines(session, id, machines);
}

export async function basculerCapacite(session: SessionPartenaire, id: string, actif: boolean): Promise<void> {
  await majCapacite(session, id, { actif }, actif ? 'PARTENAIRE_CAPACITE_REACTIVEE' : 'PARTENAIRE_CAPACITE_DESACTIVEE');
}

/* ----------------------------------------------------------------- services -- */

export async function creerService(session: SessionPartenaire, champs: ChampsService): Promise<string> {
  const { data, error } = await db()
    .from('partenaire_services')
    .insert({ ...champs, partenaire_id: session.partenaireId })
    .select('id')
    .single();
  if (error) traduire(error);
  await journaliser({ staff: acteur(session), action: 'PARTENAIRE_SERVICE_CREE', entite: 'partenaire', entiteId: session.partenaireId, apres: { id: data.id, ...champs } });
  return data.id as string;
}

async function majService(session: SessionPartenaire, id: string, champs: Partial<ChampsService> & { actif?: boolean }, action: string) {
  const { data: avant, error: e1 } = await db()
    .from('partenaire_services')
    .select('*')
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .maybeSingle();
  if (e1) traduire(e1);
  if (!avant) throw new ErreurIntrouvable('Service introuvable.');
  const { data: apres, error } = await db()
    .from('partenaire_services')
    .update(champs)
    .eq('id', id)
    .eq('partenaire_id', session.partenaireId)
    .select('*')
    .single();
  if (error) traduire(error);
  await journaliser({ staff: acteur(session), action, entite: 'partenaire', entiteId: session.partenaireId, avant, apres });
}

export async function modifierService(session: SessionPartenaire, id: string, champs: ChampsService): Promise<void> {
  await majService(session, id, champs, 'PARTENAIRE_SERVICE_MODIFIE');
}

export async function basculerService(session: SessionPartenaire, id: string, actif: boolean): Promise<void> {
  await majService(session, id, { actif }, actif ? 'PARTENAIRE_SERVICE_REACTIVE' : 'PARTENAIRE_SERVICE_DESACTIVE');
}

/* ----------------------------------------------------------- disponibilités -- */

/** Ajout seulement : une déclaration n'est jamais modifiée (historique). */
export async function declarerDisponibilite(session: SessionPartenaire, champs: ChampsDisponibilite): Promise<void> {
  const { error } = await db()
    .from('partenaire_disponibilites')
    .insert({ ...champs, partenaire_id: session.partenaireId, declare_par: session.userId });
  if (error) traduire(error);
  await journaliser({ staff: acteur(session), action: 'PARTENAIRE_DISPONIBILITE', entite: 'partenaire', entiteId: session.partenaireId, apres: champs });
}

/* --------------------------------------------------------------- soumission -- */

/**
 * Soumet le dossier (BROUILLON / REFUSE → EN_ATTENTE_VALIDATION). La fonction SQL vérifie le
 * minimum exigé et verrouille l'entreprise. Smart Vision est prévenu par la file `notifications`
 * (Telegram), sans jamais bloquer la soumission si la notification échoue.
 */
export async function soumettreDossier(session: SessionPartenaire): Promise<void> {
  const { error } = await db().rpc('soumettre_partenaire', { p_partenaire_id: session.partenaireId, p_acteur: session.userId });
  if (error) traduire(error);
  await journaliser({ staff: acteur(session), action: 'PARTENAIRE_SOUMIS', entite: 'partenaire', entiteId: session.partenaireId });

  const maintenant = new Date().toISOString();
  const { error: e2 } = await db()
    .from('notifications')
    .insert({
      canal: 'TELEGRAM',
      destinataire: process.env.TELEGRAM_CHAT_ID?.trim() ?? '',
      sujet: 'Dossier partenaire à valider',
      corps: `Elembo Partners — dossier soumis par ${session.nomPartenaire} (${session.email}). À examiner dans le back-office.`,
      statut: 'A_ENVOYER',
      entite: 'partenaire',
      entite_id: session.partenaireId,
      cle_idempotence: `partenaire:${session.partenaireId}:soumis:${maintenant}`,
      metadata: { partenaire: session.nomPartenaire },
    });
  if (e2) console.error('Notification de soumission partenaire non enregistrée :', e2.code ?? e2.message);
}

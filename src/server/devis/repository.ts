import { supabaseAdmin } from '@/server/supabase/client';
import type { DemandeDevis, FichierAnnonce, StatutAnalyse, StatutDevis } from '@/lib/devis/types';

export type DevisLigne = {
  id: string;
  reference: string;
  client_id: string;
  famille: string;
  besoin: string;
  format: string | null;
  quantite: number | null;
  specifications: Record<string, unknown>;
  statut: StatutDevis;
  montant_propose_fcfa: number | null;
  prix_valide: boolean;
  prix_verrouille: boolean;
  expire_le: string | null;
  cree_le: string;
  contact_snapshot: Record<string, unknown>;
  notes_internes: string | null;
  suivi_token_hash: string | null;
  suivi_token_expire_le: string | null;
};

export type FichierDevisLigne = {
  id: string;
  devis_id: string;
  nom: string;
  chemin: string;
  type_mime: string;
  taille_octets: number;
  type_fichier: string;
  verifie: boolean;
  verifie_le: string | null;
  statut_analyse: StatutAnalyse;
  analyse_le: string | null;
  expire_le: string | null;
  cree_le: string;
};

export type ClientLigne = {
  id: string;
  nom: string;
  societe: string | null;
  email: string | null;
  telephone: string;
  telephone_normalise: string | null;
  ville: string | null;
};

export type NotificationLigne = {
  id: string;
  canal: 'EMAIL' | 'TELEGRAM' | 'WHATSAPP';
  destinataire: string;
  sujet: string | null;
  corps: string;
  statut: 'A_ENVOYER' | 'ENVOYEE' | 'ECHEC' | 'ANNULEE';
  tentatives: number;
  prochaine_tentative: string;
  cle_idempotence: string | null;
  metadata: Record<string, unknown>;
};

function admin() {
  return supabaseAdmin();
}

function erreur(message: string): Error {
  return new Error(message);
}

export async function creerDevisAtomique(
  demande: DemandeDevis,
  options: {
    idempotencyKey: string;
    reference: string;
    suiviTokenHash: string;
    suiviTokenExpireLe: string;
  },
): Promise<{ devisId: string; clientId: string; reference: string; dejaExistant: boolean }> {
  const { data, error } = await admin().rpc('creer_devis_atomique', {
    p_idempotency_key: options.idempotencyKey,
    p_reference: options.reference,
    p_suivi_token_hash: options.suiviTokenHash,
    p_suivi_token_expire_le: options.suiviTokenExpireLe,
    p_nom: demande.nom,
    p_societe: demande.societe ?? null,
    p_email: demande.email ?? null,
    p_telephone: demande.telephone,
    p_telephone_normalise: demande.telephoneNormalise,
    p_type_client: demande.typeClient,
    p_ville: demande.ville ?? null,
    p_famille: demande.famille,
    p_besoin: demande.besoin,
    p_format: demande.format ?? null,
    p_quantite: demande.quantite ?? null,
    p_specifications: demande.specifications,
    p_contact_snapshot: {
      nom: demande.nom,
      societe: demande.societe ?? null,
      email: demande.email ?? null,
      telephone: demande.telephone,
      ville: demande.ville ?? null,
    },
    p_staff_email: process.env.DEVIS_NOTIFY_EMAIL?.trim() || null,
    p_staff_telegram: process.env.TELEGRAM_CHAT_ID?.trim() || null,
    p_source: 'SITE',
  });

  if (error) throw erreur(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as
    | { devis_id: string; client_id: string; reference: string; deja_existant: boolean }
    | null;
  if (!ligne) throw erreur('Création du devis sans réponse.');
  return {
    devisId: ligne.devis_id,
    clientId: ligne.client_id,
    reference: ligne.reference,
    dejaExistant: ligne.deja_existant,
  };
}

export async function trouverDevisParReference(reference: string): Promise<DevisLigne | null> {
  const { data, error } = await admin()
    .from('devis')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw erreur(error.message);
  return (data as DevisLigne | null) ?? null;
}

export async function devisParId(id: string): Promise<DevisLigne | null> {
  const { data, error } = await admin().from('devis').select('*').eq('id', id).maybeSingle();
  if (error) throw erreur(error.message);
  return (data as DevisLigne | null) ?? null;
}

export async function clientDuDevis(clientId: string): Promise<ClientLigne | null> {
  const { data, error } = await admin().from('clients').select('*').eq('id', clientId).maybeSingle();
  if (error) throw erreur(error.message);
  return (data as ClientLigne | null) ?? null;
}

export async function listerDevis(options: { statut?: string; limite?: number } = {}): Promise<DevisLigne[]> {
  let requete = admin()
    .from('devis')
    .select('*')
    .order('cree_le', { ascending: false })
    .limit(Math.min(Math.max(options.limite ?? 50, 1), 100));
  if (options.statut) requete = requete.eq('statut', options.statut);
  const { data, error } = await requete;
  if (error) throw erreur(error.message);
  return (data ?? []) as DevisLigne[];
}

export async function fichiersDuDevis(devisId: string): Promise<FichierDevisLigne[]> {
  const { data, error } = await admin()
    .from('fichiers_devis')
    .select('*')
    .eq('devis_id', devisId)
    .order('cree_le', { ascending: true });
  if (error) throw erreur(error.message);
  return (data ?? []) as FichierDevisLigne[];
}

export async function fichierDuDevis(devisId: string, fichierId: string): Promise<FichierDevisLigne | null> {
  const { data, error } = await admin()
    .from('fichiers_devis')
    .select('*')
    .eq('devis_id', devisId)
    .eq('id', fichierId)
    .maybeSingle();
  if (error) throw erreur(error.message);
  return (data as FichierDevisLigne | null) ?? null;
}

export async function ajouterFichierEnAttente(
  devisId: string,
  fichier: FichierAnnonce,
  chemin: string,
): Promise<FichierDevisLigne> {
  const expire = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin()
    .from('fichiers_devis')
    .insert({
      devis_id: devisId,
      nom: fichier.nom,
      chemin,
      type_mime: fichier.typeMime,
      taille_octets: fichier.tailleOctets,
      type_fichier: 'SOURCE',
      fournisseur: 'SUPABASE',
      verifie: false,
      statut_analyse: 'NON_ANALYSE',
      expire_le: expire,
    })
    .select('*')
    .maybeSingle();
  if (error) throw erreur(error.message);
  if (!data) throw erreur('Fichier non enregistré.');
  return data as FichierDevisLigne;
}

export async function marquerFichierVerifie(
  fichierId: string,
  donnees: { tailleOctets: number; typeMime: string; checksum: string },
): Promise<void> {
  const { error } = await admin()
    .from('fichiers_devis')
    .update({
      taille_octets: donnees.tailleOctets,
      type_mime: donnees.typeMime,
      checksum: donnees.checksum,
      verifie: true,
      verifie_le: new Date().toISOString(),
      statut_analyse: 'NON_ANALYSE',
    })
    .eq('id', fichierId);
  if (error) throw erreur(error.message);
}

export async function supprimerFichier(fichierId: string): Promise<void> {
  const { error } = await admin().from('fichiers_devis').delete().eq('id', fichierId);
  if (error) throw erreur(error.message);
}

export async function transitionnerDevis(
  devisId: string,
  statut: StatutDevis,
  montant: number | null,
  note: string | null,
  acteur: string | null,
  source: 'STAFF' | 'CLIENT' | 'SYSTEME' = 'STAFF',
): Promise<DevisLigne> {
  const { data, error } = await admin().rpc('transitionner_devis', {
    p_devis_id: devisId,
    p_nouveau_statut: statut,
    p_montant: montant,
    p_note: note,
    p_acteur: acteur,
    p_source: source,
  });
  if (error) throw erreur(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as DevisLigne | null;
  if (!ligne) throw erreur('Transition sans réponse.');
  return ligne;
}

export async function deciderDevisPublic(devisId: string, decision: 'ACCEPTE' | 'REFUSE'): Promise<DevisLigne> {
  const { data, error } = await admin().rpc('decider_devis_public', {
    p_devis_id: devisId,
    p_decision: decision,
  });
  if (error) throw erreur(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as DevisLigne | null;
  if (!ligne) throw erreur('Décision sans réponse.');
  return ligne;
}

export async function creerSessionDevis(devisId: string, sidHash: string, expireLe: string): Promise<void> {
  const { error } = await admin().rpc('creer_session_devis', {
    p_devis_id: devisId,
    p_sid_hash: sidHash,
    p_expire_le: expireLe,
    p_user_agent_hash: null,
    p_ip_hash: null,
  });
  if (error) throw erreur(error.message);
}

export async function sessionDevisValide(sidHash: string, reference: string): Promise<string | null> {
  const { data, error } = await admin().rpc('session_devis_valide', {
    p_sid_hash: sidHash,
    p_reference: reference,
  });
  if (error) throw erreur(error.message);
  return typeof data === 'string' ? data : null;
}

export async function revoquerSessionDevis(sidHash: string, motif: string): Promise<void> {
  const { error } = await admin().rpc('revoquer_session_devis', {
    p_sid_hash: sidHash,
    p_motif: motif,
  });
  if (error) throw erreur(error.message);
}

export async function revoquerSessionsDevis(devisId: string, motif: string): Promise<void> {
  const { error } = await admin().rpc('revoquer_sessions_devis', {
    p_devis_id: devisId,
    p_motif: motif,
  });
  if (error) throw erreur(error.message);
}

export async function notificationsEnAttente(limite = 50): Promise<NotificationLigne[]> {
  const { data, error } = await admin()
    .from('notifications')
    .select('*')
    .in('statut', ['A_ENVOYER', 'ECHEC'])
    .lte('prochaine_tentative', new Date().toISOString())
    .order('prochaine_tentative', { ascending: true })
    .limit(Math.min(Math.max(limite, 1), 100));
  if (error) throw erreur(error.message);
  return (data ?? []) as NotificationLigne[];
}

export async function reserverNotification(id: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('notifications')
    .update({
      derniere_tentative: new Date().toISOString(),
      prochaine_tentative: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .eq('id', id)
    .in('statut', ['A_ENVOYER', 'ECHEC'])
    .select('id');
  if (error) throw erreur(error.message);
  return (data ?? []).length === 1;
}

export async function marquerNotificationEnvoyee(id: string): Promise<void> {
  const { error } = await admin()
    .from('notifications')
    .update({ statut: 'ENVOYEE', envoye_le: new Date().toISOString(), derniere_erreur: null })
    .eq('id', id);
  if (error) throw erreur(error.message);
}

export async function marquerNotificationEchec(id: string, message: string, tentatives: number): Promise<void> {
  const delai = Math.min(1440, Math.max(1, 5 ** Math.min(tentatives, 5))) * 60 * 1000;
  const { error } = await admin()
    .from('notifications')
    .update({
      statut: 'ECHEC',
      tentatives,
      derniere_erreur: message.slice(0, 1000),
      prochaine_tentative: new Date(Date.now() + delai).toISOString(),
    })
    .eq('id', id);
  if (error) throw erreur(error.message);
}

export async function notifierFichiersRecus(
  devisId: string,
  reference: string,
  nombre: number,
): Promise<void> {
  const email = process.env.DEVIS_NOTIFY_EMAIL?.trim();
  const telegram = process.env.TELEGRAM_CHAT_ID?.trim();
  const corps = `${nombre} pièce(s) reçue(s) pour le devis ${reference}.`;

  if (email) {
    const { error } = await admin().from('notifications').insert({
      canal: 'EMAIL',
      destinataire: email.toLowerCase(),
      sujet: 'Pièces reçues pour un devis',
      corps,
      statut: 'A_ENVOYER',
      entite: 'devis',
      entite_id: devisId,
      cle_idempotence: `devis:${devisId}:staff-fichiers-email`,
    });
    if (error && !error.message.includes('duplicate')) throw erreur(error.message);
  }

  if (telegram) {
    const { error } = await admin().from('notifications').insert({
      canal: 'TELEGRAM',
      destinataire: telegram,
      sujet: 'Pièces reçues pour un devis',
      corps,
      statut: 'A_ENVOYER',
      entite: 'devis',
      entite_id: devisId,
      cle_idempotence: `devis:${devisId}:staff-fichiers-telegram`,
    });
    if (error && !error.message.includes('duplicate')) throw erreur(error.message);
  }
}

export async function compterDerogations(acteur: string): Promise<number> {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const { count, error } = await admin()
    .from('journal_audit')
    .select('id', { count: 'exact', head: true })
    .eq('acteur', acteur)
    .eq('action', 'DEVIS_FICHIER_DEROGATION')
    .gte('cree_le', debut.toISOString());
  if (error) throw erreur(error.message);
  return count ?? 0;
}

export async function journaliserDerogation(options: {
  acteur: string;
  acteurEmail?: string;
  devisId: string;
  fichierId: string;
  motif: string;
  statutAnalyse: string;
  ipHash: string;
}): Promise<void> {
  const { error } = await admin().from('journal_audit').insert({
    acteur: options.acteur,
    acteur_email: options.acteurEmail ?? null,
    action: 'DEVIS_FICHIER_DEROGATION',
    entite: 'fichiers_devis',
    entite_id: options.fichierId,
    avant: { devis_id: options.devisId, statut_analyse: options.statutAnalyse },
    apres: { motif: options.motif, ip_hash: options.ipHash, url_secondes: 60 },
  });
  if (error) throw erreur(error.message);
}

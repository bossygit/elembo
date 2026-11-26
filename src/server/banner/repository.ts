import { supabaseAdmin } from '@/server/supabase/client';

/** Accès aux visuels Banner Studio. Client `service_role` : l'appelant a DÉJÀ contrôlé l'accès au devis. */

export type DemandeVisuel = { largeur_m: number; hauteur_m: number; quantite: number; support: string; finition: string; partenaire_id: string | null };

export async function demandeDuDevis(devisId: string): Promise<DemandeVisuel | null> {
  const { data, error } = await supabaseAdmin().from('demandes_grand_format').select('largeur_m, hauteur_m, quantite, support, finition, partenaire_id').eq('devis_id', devisId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DemandeVisuel | null) ?? null;
}

export type Reservation = { visuel_id: string; version: number; etat: 'NOUVEAU' | 'EN_COURS' | 'DEJA'; statut: string };

export async function reserverVisuel(p: { devisId: string; checksum: string; projet: unknown; projetVersion: number; categorie: string | null; profilId: string | null; profilVersion: number | null; origine: 'CLIENT' | 'STAFF' }): Promise<Reservation> {
  const { data, error } = await supabaseAdmin()
    .rpc('reserver_visuel_banderole', { p_devis_id: p.devisId, p_checksum: p.checksum, p_projet: p.projet, p_projet_version: p.projetVersion, p_categorie: p.categorie, p_profil_id: p.profilId, p_profil_version: p.profilVersion, p_origine: p.origine })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Reservation;
}

export async function visuelParId(id: string): Promise<{ statut: string; version: number; avertissements: unknown } | null> {
  const { data, error } = await supabaseAdmin().from('visuels_banderole').select('statut, version, avertissements').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { statut: string; version: number; avertissements: unknown } | null;
}

export type FichierServeur = { role: 'projet' | 'production' | 'fiche'; nom: string; chemin: string; type_mime: string; taille_octets: number; type_fichier: string; checksum: string };

export async function terminerVisuel(p: {
  visuelId: string; statut: 'RENDU' | 'A_REVOIR'; projet: unknown; contraintes: unknown; preflight: unknown; avertissements: unknown;
  fichiers: FichierServeur[]; apercuChemin: string | null; checksumProduction: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin().rpc('terminer_visuel_banderole', {
    p_visuel_id: p.visuelId, p_statut: p.statut, p_projet: p.projet, p_contraintes: p.contraintes, p_preflight: p.preflight,
    p_avertissements: p.avertissements, p_fichiers: p.fichiers, p_apercu_chemin: p.apercuChemin, p_checksum_production: p.checksumProduction,
  });
  if (error) throw new Error(error.message);
}

export async function echouerVisuel(visuelId: string, erreur: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc('echouer_visuel_banderole', { p_visuel_id: visuelId, p_erreur: erreur });
  if (error) throw new Error(error.message);
}

export type LigneVisuel = {
  id: string; devis_id: string; version: number; statut: string; origine: string; projet: unknown; preflight: Record<string, unknown>;
  avertissements: unknown; profil_id: string | null; profil_version: number | null; apercu_chemin: string | null; erreur: string | null;
  fichier_production_id: string | null; fichier_projet_id: string | null; fichier_fiche_id: string | null; checksum_production: string | null;
  rendu_le: string | null; cree_le: string;
};

export async function visuelsDuDevis(devisId: string): Promise<LigneVisuel[]> {
  const { data, error } = await supabaseAdmin().from('visuels_banderole').select('*').eq('devis_id', devisId).order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneVisuel[];
}

export async function visuelCourant(devisId: string): Promise<LigneVisuel | null> {
  const { data: d, error: e } = await supabaseAdmin().from('demandes_grand_format').select('visuel_courant_id').eq('devis_id', devisId).maybeSingle();
  if (e) throw new Error(e.message);
  if (!d?.visuel_courant_id) return null;
  const { data, error } = await supabaseAdmin().from('visuels_banderole').select('*').eq('id', d.visuel_courant_id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LigneVisuel | null) ?? null;
}

/** Lien signé de 5 minutes vers l'aperçu d'un visuel (stockage de production). */
export async function urlApercu(chemin: string): Promise<string | null> {
  const { data } = await supabaseAdmin().storage.from('production').createSignedUrl(chemin, 300);
  return data?.signedUrl ?? null;
}

export async function archiverVisuelCommande(commandeId: string, fichiers: Omit<FichierServeur, 'role'>[]): Promise<void> {
  const { error } = await supabaseAdmin().rpc('archiver_visuel_commande', { p_commande_id: commandeId, p_fichiers: fichiers });
  if (error) throw new Error(error.message);
}

export async function commandeDuDevisBanner(devisId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin().from('commandes').select('id').eq('devis_id', devisId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null) ?? null;
}

export async function lireObjet(bucket: 'devis' | 'production', chemin: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(chemin);
  return error || !data ? null : new Uint8Array(await data.arrayBuffer());
}

/** Écrit un objet du serveur. `upsert` : le chemin porte la version réservée, un nouvel essai le remplace. */
export async function ecrireObjet(bucket: 'devis' | 'production', chemin: string, octets: Uint8Array, typeMime: string): Promise<void> {
  const { error } = await supabaseAdmin().storage.from(bucket).upload(chemin, octets, { contentType: typeMime, upsert: true });
  if (error) throw new Error(`Dépôt impossible (${chemin.split('/').pop()}) : ${error.message}`);
}

export async function effacerObjets(bucket: 'devis' | 'production', chemins: string[]): Promise<void> {
  if (chemins.length) await supabaseAdmin().storage.from(bucket).remove(chemins);
}

/**
 * Back-office Elembo Partners — lectures et décisions de Smart Vision (service_role). L'appelant
 * a vérifié la permission (`partenaires.*`, src/lib/admin/permissions.ts).
 *
 * Les décisions passent par la base : `decider_partenaire` (transitions, motif, historique) pour
 * l'entreprise ; contraintes `*_validation` pour les machines, capacités et services. Chaque
 * décision est journalisée et, quand elle concerne l'atelier, annoncée par e-mail à ses
 * responsables (file `notifications`, envoyée par Resend une fois configuré) — jamais un montant.
 */

import type { ChampsEntreprise } from '@/lib/partenaires/formulaires';
import type { StatutPartenaire, StatutValidation } from '@/lib/partenaires/statuts';
import { ErreurIntrouvable, ErreurMetier } from '@/server/partenaires/ecriture';
import { BUCKET_PARTENAIRES } from '@/server/partenaires/fichiers';
import { supabaseAdmin } from '@/server/supabase/client';
import type { Staff } from './acces';
import { journaliser } from './audit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
  return supabaseAdmin();
}

function verifierId(id: string, quoi = 'Partenaire'): void {
  if (!UUID.test(id)) throw new ErreurIntrouvable(`${quoi} introuvable.`);
}

function traduire(error: { code?: string; message: string }): never {
  if (error.code === '23514' || error.code === '22023' || error.code === 'P0001') throw new ErreurMetier(error.message);
  if (error.code === 'P0002') throw new ErreurIntrouvable(error.message);
  throw new Error(error.message);
}

/* ------------------------------------------------------------------ liste -- */

export type PartenaireListe = {
  id: string;
  nom: string;
  specialite: string;
  ville: string | null;
  telephone: string | null;
  statut: StatutPartenaire;
  actif: boolean;
  origine: string;
  soumis_le: string | null;
  cree_le: string;
  machines: number;
  capacites: number;
};

/** Texte de recherche sans les caractères de syntaxe PostgREST (`,()*%\`). */
export function texteRecherche(brut: string): string {
  return brut.replace(/[,()*%\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export async function rechercherPartenaires(options: {
  texte: string;
  statut: StatutPartenaire | null;
  limite: number;
  decalage: number;
}): Promise<{ partenaires: PartenaireListe[]; total: number }> {
  let q = db()
    .from('partenaires')
    .select(
      'id, nom, specialite, ville, telephone, statut, actif, origine, soumis_le, cree_le, machines:partenaire_machines(count), capacites:partenaire_capacites(count)',
      { count: 'exact' },
    )
    .order('cree_le', { ascending: false })
    .range(options.decalage, options.decalage + options.limite - 1);
  if (options.statut) q = q.eq('statut', options.statut);
  const texte = texteRecherche(options.texte);
  if (texte) q = q.or(`nom.ilike.*${texte}*,ville.ilike.*${texte}*,telephone.ilike.*${texte}*,email.ilike.*${texte}*,specialite.ilike.*${texte}*`);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const partenaires = (data ?? []).map((l) => {
    const ligne = l as unknown as Omit<PartenaireListe, 'machines' | 'capacites'> & {
      machines: { count: number }[];
      capacites: { count: number }[];
    };
    return { ...ligne, machines: ligne.machines?.[0]?.count ?? 0, capacites: ligne.capacites?.[0]?.count ?? 0 };
  });
  return { partenaires, total: count ?? 0 };
}

/* --------------------------------------------------------- file de validation -- */

export type ElementAValider = { id: string; partenaire_id: string; partenaire: string; nom: string; detail: string | null; maj_le: string };

export type FileValidation = {
  dossiers: { id: string; nom: string; ville: string | null; soumis_le: string | null }[];
  machines: ElementAValider[];
  capacites: ElementAValider[];
  services: ElementAValider[];
  tarifs: ElementAValider[];
};

/** Éléments en attente d'une décision. Les tarifs ne sont lus que si `avecTarifs` (admin, finance). */
export async function fileValidation(avecTarifs: boolean): Promise<FileValidation> {
  const partenaire = 'partenaire:partenaires!inner(nom, statut)';
  const [dossiers, machines, capacites, services, tarifs] = await Promise.all([
    db().from('partenaires').select('id, nom, ville, soumis_le').eq('statut', 'EN_ATTENTE_VALIDATION').order('soumis_le').limit(200),
    db()
      .from('partenaire_machines')
      .select(`id, partenaire_id, nom, type_machine, maj_le, ${partenaire}`)
      .eq('statut_validation', 'A_VALIDER')
      .eq('archive', false)
      .neq('partenaire.statut', 'ARCHIVE')
      .order('maj_le')
      .limit(200),
    db()
      .from('partenaire_capacites')
      .select(`id, partenaire_id, nom, prestation, maj_le, ${partenaire}`)
      .eq('statut_validation', 'A_VALIDER')
      .eq('actif', true)
      .neq('partenaire.statut', 'ARCHIVE')
      .order('maj_le')
      .limit(200),
    db()
      .from('partenaire_services')
      .select(`id, partenaire_id, nom, categorie, maj_le, ${partenaire}`)
      .eq('statut_validation', 'A_VALIDER')
      .eq('actif', true)
      .neq('partenaire.statut', 'ARCHIVE')
      .order('maj_le')
      .limit(200),
    avecTarifs
      ? db()
          .from('partenaire_tarifs')
          .select(`id, partenaire_id, nom, lignee_id, version, maj_le, ${partenaire}`)
          .eq('statut', 'PROPOSE')
          .neq('partenaire.statut', 'ARCHIVE')
          .order('maj_le')
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [dossiers, machines, capacites, services, tarifs]) if (r.error) throw new Error(r.error.message);

  const element = (detail: (l: Record<string, unknown>) => string | null) => (l: Record<string, unknown>): ElementAValider => ({
    id: l.id as string,
    partenaire_id: l.partenaire_id as string,
    partenaire: (l.partenaire as { nom: string }).nom,
    nom: l.nom as string,
    detail: detail(l),
    maj_le: l.maj_le as string,
  });

  return {
    dossiers: (dossiers.data ?? []) as FileValidation['dossiers'],
    machines: (machines.data ?? []).map((l) => element((x) => x.type_machine as string)(l as Record<string, unknown>)),
    capacites: (capacites.data ?? []).map((l) => element((x) => x.prestation as string)(l as Record<string, unknown>)),
    services: (services.data ?? []).map((l) => element((x) => x.categorie as string)(l as Record<string, unknown>)),
    tarifs: (tarifs.data ?? []).map((l) => element((x) => `version ${x.version as number}`)(l as Record<string, unknown>)),
  };
}

/* ------------------------------------------------------------------- fiche -- */

export type Utilisateur = { id: string; user_id: string; email: string | null; role_partenaire: string; actif: boolean; cree_le: string };

export type FicheAdmin = {
  partenaire: Record<string, unknown> & { id: string; nom: string; statut: StatutPartenaire; actif: boolean };
  utilisateurs: Utilisateur[];
  machines: (Record<string, unknown> & { id: string; nom: string; statut_validation: StatutValidation; archive: boolean })[];
  capacites: (Record<string, unknown> & { id: string; nom: string; statut_validation: StatutValidation; actif: boolean; machines: string[] })[];
  services: (Record<string, unknown> & { id: string; nom: string; statut_validation: StatutValidation; actif: boolean })[];
  disponibilites: { id: string; statut: string; debut_periode: string; fin_periode: string | null; delai_moyen_jours: number | null; commentaire: string | null; cree_le: string }[];
  fichiers: { id: string; type_fichier: string; machine_id: string | null; nom_original: string | null; type_mime: string; url: string | null }[];
  historique: { ancien_statut: string; nouveau_statut: string; motif: string | null; cree_le: string; acteur: string | null }[];
};

export async function fichePartenaireAdmin(id: string): Promise<FicheAdmin | null> {
  verifierId(id);
  const { data: partenaire, error } = await db()
    .from('partenaires')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!partenaire) return null;

  const [utilisateurs, machines, capacites, services, disponibilites, fichiers, historique] = await Promise.all([
    db().from('partenaire_utilisateurs').select('id, user_id, role_partenaire, actif, cree_le').eq('partenaire_id', id).order('cree_le'),
    db().from('partenaire_machines').select('*').eq('partenaire_id', id).order('archive').order('nom'),
    db().from('partenaire_capacites').select('*, liens:partenaire_capacite_machines(machine_id)').eq('partenaire_id', id).order('actif', { ascending: false }).order('nom'),
    db().from('partenaire_services').select('*').eq('partenaire_id', id).order('actif', { ascending: false }).order('nom'),
    db().from('partenaire_disponibilites').select('id, statut, debut_periode, fin_periode, delai_moyen_jours, commentaire, cree_le').eq('partenaire_id', id).order('debut_periode', { ascending: false }).order('cree_le', { ascending: false }).limit(10),
    db().from('partenaire_fichiers').select('id, type_fichier, machine_id, nom_original, type_mime, chemin').eq('partenaire_id', id).order('cree_le').limit(60),
    db().from('historique_statuts_partenaire').select('ancien_statut, nouveau_statut, motif, cree_le, acteur').eq('partenaire_id', id).order('cree_le', { ascending: false }).limit(50),
  ]);
  for (const r of [utilisateurs, machines, capacites, services, disponibilites, fichiers, historique]) if (r.error) throw new Error(r.error.message);

  // E-mails des comptes : lus dans Supabase Auth (quelques comptes par atelier).
  const comptes = await Promise.all(
    (utilisateurs.data ?? []).map(async (u) => {
      const { data } = await db().auth.admin.getUserById(u.user_id as string);
      return { ...(u as Omit<Utilisateur, 'email'>), email: data.user?.email ?? null };
    }),
  );

  const lignesFichiers = (fichiers.data ?? []) as { id: string; type_fichier: string; machine_id: string | null; nom_original: string | null; type_mime: string; chemin: string }[];
  const { data: urls } = lignesFichiers.length
    ? await db().storage.from(BUCKET_PARTENAIRES).createSignedUrls(lignesFichiers.map((f) => f.chemin), 600)
    : { data: [] };

  return {
    partenaire: partenaire as FicheAdmin['partenaire'],
    utilisateurs: comptes,
    machines: (machines.data ?? []) as FicheAdmin['machines'],
    capacites: (capacites.data ?? []).map((c) => {
      const { liens, ...reste } = c as unknown as Omit<FicheAdmin['capacites'][number], 'machines'> & { liens: { machine_id: string }[] | null };
      return { ...reste, machines: (liens ?? []).map((l) => l.machine_id) } as FicheAdmin['capacites'][number];
    }),
    services: (services.data ?? []) as FicheAdmin['services'],
    disponibilites: (disponibilites.data ?? []) as FicheAdmin['disponibilites'],
    fichiers: lignesFichiers.map(({ chemin, ...f }) => ({ ...f, url: urls?.find((u) => u.path === chemin)?.signedUrl ?? null })),
    historique: (historique.data ?? []) as FicheAdmin['historique'],
  };
}

/* ------------------------------------------------------------- notification -- */

/**
 * E-mail aux responsables actifs de l'atelier. Ne bloque jamais la décision : une notification
 * non enregistrée est signalée dans les logs. Aucune donnée financière dans le corps.
 */
export async function notifierPartenaire(partenaireId: string, sujet: string, corps: string, cle: string): Promise<void> {
  try {
    const { data: comptes, error } = await db()
      .from('partenaire_utilisateurs')
      .select('user_id')
      .eq('partenaire_id', partenaireId)
      .eq('role_partenaire', 'RESPONSABLE')
      .eq('actif', true);
    if (error) throw new Error(error.message);
    for (const c of comptes ?? []) {
      const { data } = await db().auth.admin.getUserById(c.user_id as string);
      const email = data.user?.email;
      if (!email) continue;
      const { error: e2 } = await db()
        .from('notifications')
        .insert({
          canal: 'EMAIL',
          destinataire: email.toLowerCase(),
          sujet,
          corps: `${corps}\n\nRetrouvez le détail dans votre espace partenaire Elembo.\nSmart Vision Congo`,
          statut: 'A_ENVOYER',
          entite: 'partenaire',
          entite_id: partenaireId,
          cle_idempotence: `${cle}:${c.user_id as string}`,
          metadata: {},
        });
      if (e2 && e2.code !== '23505') throw new Error(e2.message);
    }
  } catch (erreur) {
    console.error('Notification partenaire non enregistrée :', erreur instanceof Error ? erreur.message : erreur);
  }
}

/* ---------------------------------------------------------------- décisions -- */

export type DecisionPartenaireAdmin = 'VALIDE' | 'REFUSE' | 'BROUILLON' | 'SUSPENDU' | 'ARCHIVE';

const MESSAGES_DECISION: Record<DecisionPartenaireAdmin, { sujet: string; corps: (nom: string, motif: string | null) => string }> = {
  VALIDE: { sujet: 'Votre dossier partenaire est validé', corps: (n) => `Bonne nouvelle : le dossier de ${n} est validé par Smart Vision. Vous pouvez désormais recevoir des travaux.` },
  REFUSE: { sujet: 'Votre dossier partenaire n’a pas été retenu', corps: (n, m) => `Le dossier de ${n} n’a pas été retenu.${m ? `\nMotif : ${m}` : ''}\nVous pouvez le corriger et le soumettre à nouveau.` },
  BROUILLON: { sujet: 'Compléments demandés pour votre dossier', corps: (n, m) => `Smart Vision demande des compléments pour le dossier de ${n}.${m ? `\n${m}` : ''}` },
  SUSPENDU: { sujet: 'Votre accès partenaire est suspendu', corps: (n, m) => `L’accès de ${n} à l’espace partenaires est suspendu.${m ? `\nMotif : ${m}` : ''}` },
  ARCHIVE: { sujet: 'Fin du partenariat', corps: (n) => `Le partenariat de ${n} avec Smart Vision est clôturé.` },
};

export async function deciderPartenaireAdmin(staff: Staff, id: string, decision: DecisionPartenaireAdmin, motif: string | null): Promise<void> {
  verifierId(id);
  const { data: avant, error: e1 } = await db().from('partenaires').select('nom, statut').eq('id', id).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new ErreurIntrouvable('Partenaire introuvable.');
  const { error } = await db().rpc('decider_partenaire', {
    p_partenaire_id: id,
    p_statut: decision,
    p_motif: motif,
    p_acteur: staff.id,
    p_acteur_email: staff.email ?? 'staff',
  });
  if (error) traduire(error);
  await journaliser({ staff, action: `PARTENAIRE_${decision}`, entite: 'partenaire', entiteId: id, avant: { statut: avant.statut }, apres: { statut: decision, motif } });
  const m = MESSAGES_DECISION[decision];
  await notifierPartenaire(id, m.sujet, m.corps(avant.nom as string, motif), `partenaire:${id}:decision:${decision}:${new Date().toISOString()}`);
}

export type TypeElement = 'machine' | 'capacite' | 'service';

const TABLES: Record<TypeElement, { table: string; libelle: string }> = {
  machine: { table: 'partenaire_machines', libelle: 'la machine' },
  capacite: { table: 'partenaire_capacites', libelle: 'la capacité' },
  service: { table: 'partenaire_services', libelle: 'le service' },
};

/** Valide ou refuse une machine, une capacité ou un service (motif obligatoire pour un refus). */
export async function deciderElement(staff: Staff, type: TypeElement, id: string, decision: 'VALIDEE' | 'REFUSEE', motif: string | null): Promise<string> {
  verifierId(id, 'Élément');
  const texte = motif?.trim().slice(0, 1000) || null;
  if (decision === 'REFUSEE' && !texte) throw new ErreurMetier('Un motif est obligatoire : il est transmis à l’atelier.');
  const { table, libelle } = TABLES[type];
  const champs =
    decision === 'VALIDEE'
      ? { statut_validation: 'VALIDEE', valide_par: staff.id, valide_le: new Date().toISOString(), motif_refus: null }
      : { statut_validation: 'REFUSEE', valide_par: staff.id, valide_le: null, motif_refus: texte };
  const { data, error } = await db().from(table).update(champs).eq('id', id).select('partenaire_id, nom').maybeSingle();
  if (error) traduire(error);
  if (!data) throw new ErreurIntrouvable('Élément introuvable.');
  const partenaireId = data.partenaire_id as string;
  await journaliser({ staff, action: `PARTENAIRE_${type.toUpperCase()}_${decision}`, entite: 'partenaire', entiteId: partenaireId, apres: { id, nom: data.nom, motif: texte } });
  if (decision === 'REFUSEE') {
    await notifierPartenaire(
      partenaireId,
      'Un élément de votre dossier est à corriger',
      `Smart Vision n’a pas validé ${libelle} « ${data.nom as string} ».\nMotif : ${texte}`,
      `partenaire:${partenaireId}:${type}:${id}:refus:${new Date().toISOString()}`,
    );
  }
  return partenaireId;
}

/* ------------------------------------------------------------ fiche (staff) -- */

/** Fiche créée par Smart Vision (ex. : atelier rencontré lors d'une visite) : validée d'emblée. */
export async function creerPartenaireAdmin(staff: Staff, champs: ChampsEntreprise): Promise<string> {
  const { data, error } = await db()
    .from('partenaires')
    .insert({
      ...champs,
      statut: 'VALIDE',
      origine: 'BACK_OFFICE',
      actif: true,
      valide_par: staff.id,
      valide_par_email: staff.email,
      valide_le: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) traduire(error);
  await journaliser({ staff, action: 'PARTENAIRE_CREE', entite: 'partenaire', entiteId: data.id as string, apres: champs });
  return data.id as string;
}

export async function modifierPartenaireAdmin(staff: Staff, id: string, champs: ChampsEntreprise): Promise<void> {
  verifierId(id);
  const { data: avant, error: e1 } = await db().from('partenaires').select('*').eq('id', id).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new ErreurIntrouvable('Partenaire introuvable.');
  const { error } = await db().from('partenaires').update(champs).eq('id', id);
  if (error) traduire(error);
  await journaliser({ staff, action: 'PARTENAIRE_MODIFIE', entite: 'partenaire', entiteId: id, avant, apres: champs });
}

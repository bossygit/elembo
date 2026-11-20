/**
 * Notifications des affectations (Lot 2.4).
 *
 * Toujours best-effort : une notification non enregistrée ne bloque jamais la décision métier.
 * Aucun montant n'est écrit dans un e-mail ou un message : le partenaire le consulte dans son
 * espace, et seul le RESPONSABLE le voit.
 *
 * Canaux réutilisés : file `notifications` (traitée par `traiterNotifications`) pour les e-mails
 * et Telegram. Les clés d'idempotence empêchent un double envoi après un retry ou une relance.
 */

import { supabaseAdmin } from '@/server/supabase/client';

export type EvenementAffectation = 'PROPOSEE' | 'RELANCE' | 'ACCEPTEE' | 'REFUSEE' | 'ANNULEE' | 'EXPIREE' | 'TERMINEE' | 'RAPPEL';

type AffectationNotification = {
  id: string;
  reference: string;
  libelle: string;
  partenaire_id: string;
  date_limite_reponse: string;
  partenaire_nom: string;
};

const ROLES_ATELIER = ['RESPONSABLE', 'PRODUCTION'] as const;

function db() {
  return supabaseAdmin();
}

function jour(valeur: string): string {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return valeur;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Africa/Brazzaville',
  }).format(date);
}

async function charger(id: string): Promise<AffectationNotification | null> {
  const { data, error } = await db()
    .from('affectations_production')
    .select('id, reference, libelle, partenaire_id, date_limite_reponse, partenaire:partenaires(nom)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const ligne = data as unknown as Omit<AffectationNotification, 'partenaire_nom'> & { partenaire: { nom: string } | null };
  return { ...ligne, partenaire_nom: ligne.partenaire?.nom ?? 'Atelier partenaire' };
}

async function emailsAtelier(partenaireId: string): Promise<string[]> {
  const { data, error } = await db()
    .from('partenaire_utilisateurs')
    .select('user_id')
    .eq('partenaire_id', partenaireId)
    .eq('actif', true)
    .in('role_partenaire', [...ROLES_ATELIER]);
  if (error) throw new Error(error.message);
  const emails = new Set<string>();
  for (const ligne of data ?? []) {
    const { data: utilisateur } = await db().auth.admin.getUserById(ligne.user_id as string);
    const email = utilisateur.user?.email?.toLowerCase();
    if (email) emails.add(email);
  }
  return [...emails];
}

async function mettreEnFile(options: {
  canal: 'EMAIL' | 'TELEGRAM';
  destinataire: string;
  sujet: string;
  corps: string;
  cle: string;
}): Promise<void> {
  const { error } = await db().from('notifications').insert({
    canal: options.canal,
    destinataire: options.destinataire,
    sujet: options.sujet,
    corps: `${options.corps}\n\nRetrouvez le détail dans votre espace partenaire Elembo.\nSmart Vision Congo`,
    statut: 'A_ENVOYER',
    entite: 'affectation',
    entite_id: options.cle.split(':')[1] ?? null,
    cle_idempotence: options.cle,
    metadata: {},
  });
  if (error && error.code !== '23505') throw new Error(error.message);
}

async function notifierAtelier(a: AffectationNotification, sujet: string, corps: string, cle: string): Promise<void> {
  for (const email of await emailsAtelier(a.partenaire_id)) {
    await mettreEnFile({ canal: 'EMAIL', destinataire: email, sujet, corps, cle: `${cle}:${email}` });
  }
}

async function notifierStaff(a: AffectationNotification, sujet: string, corps: string, cle: string): Promise<void> {
  const email = process.env.DEVIS_NOTIFY_EMAIL?.trim();
  if (email) {
    await mettreEnFile({ canal: 'EMAIL', destinataire: email.toLowerCase(), sujet, corps, cle: `${cle}:staff-email` });
  }
  const telegram = process.env.TELEGRAM_CHAT_ID?.trim();
  if (telegram) {
    await mettreEnFile({ canal: 'TELEGRAM', destinataire: telegram, sujet, corps, cle: `${cle}:staff-telegram` });
  }
}

/**
 * Enregistre les notifications d'un événement d'affectation. Ne lève jamais : les erreurs sont
 * seulement journalisées côté serveur.
 */
export async function notifierEvenementAffectation(
  id: string,
  evenement: EvenementAffectation,
  options: { motif?: string | null } = {},
): Promise<void> {
  try {
    const a = await charger(id);
    if (!a) return;
    const cle = `affectation:${a.id}:${evenement.toLowerCase()}`;
    const motif = options.motif?.trim() ? `\nMotif : ${options.motif.trim()}` : '';

    switch (evenement) {
      case 'PROPOSEE':
        await notifierAtelier(
          a,
          `Nouvelle demande de travaux — ${a.reference}`,
          `Smart Vision vous propose : ${a.libelle}.\nRéponse attendue avant le ${jour(a.date_limite_reponse)}.\nConnectez-vous à votre espace partenaire pour accepter ou refuser.`,
          cle,
        );
        break;
      case 'RELANCE':
        await notifierAtelier(
          a,
          `Rappel : proposition en attente — ${a.reference}`,
          `Smart Vision vous rappelle la demande : ${a.libelle}.\nRéponse attendue avant le ${jour(a.date_limite_reponse)}.`,
          `${cle}:${new Date().toISOString().slice(0, 10)}`,
        );
        break;
      case 'ACCEPTEE':
        await notifierStaff(a, `Travaux acceptés — ${a.reference}`, `${a.partenaire_nom} a accepté : ${a.libelle}.`, cle);
        break;
      case 'REFUSEE':
        await notifierStaff(a, `Travaux refusés — ${a.reference}`, `${a.partenaire_nom} a refusé : ${a.libelle}.${motif}`, cle);
        break;
      case 'ANNULEE':
        await notifierAtelier(
          a,
          `Travaux annulés — ${a.reference}`,
          `Smart Vision a annulé : ${a.libelle}.${motif}\nAucune suite n’est attendue de votre part.`,
          cle,
        );
        break;
      case 'EXPIREE':
        await notifierAtelier(
          a,
          `Demande expirée — ${a.reference}`,
          `La demande pour ${a.libelle} a expiré sans réponse. Smart Vision réaffectera le travail.`,
          cle,
        );
        break;
      case 'TERMINEE':
        await notifierStaff(a, `Travaux terminés — ${a.reference}`, `${a.partenaire_nom} a signalé la fin de : ${a.libelle}.`, cle);
        break;
      case 'RAPPEL':
        await notifierAtelier(
          a,
          `Rappel : réponse attendue — ${a.reference}`,
          `Il reste moins de 24 h pour répondre à la demande : ${a.libelle}.\nÉchéance : ${jour(a.date_limite_reponse)}.`,
          `${cle}:${a.date_limite_reponse}`,
        );
        break;
    }
  } catch (erreur) {
    console.error('Notification d’affectation non enregistrée :', erreur instanceof Error ? erreur.message : erreur);
  }
}

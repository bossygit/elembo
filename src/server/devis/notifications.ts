import {
  marquerNotificationEchec,
  marquerNotificationEnvoyee,
  notificationsEnAttente,
  reserverNotification,
  type NotificationLigne,
} from './repository';

async function envoyerEmail(notification: NotificationLigne): Promise<boolean> {
  const cle = process.env.RESEND_API_KEY?.trim();
  const expediteur = process.env.DEVIS_EMAIL_FROM?.trim();
  if (!cle || !expediteur) return false;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': notification.cle_idempotence ?? notification.id,
    },
    body: JSON.stringify({
      from: expediteur,
      to: [notification.destinataire],
      subject: notification.sujet ?? 'Elembo',
      text: notification.corps,
    }),
  });
  return r.ok;
}

async function envoyerTelegram(notification: NotificationLigne): Promise<boolean> {
  const jeton = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!jeton) return false;
  const chat = notification.destinataire || process.env.TELEGRAM_CHAT_ID?.trim();
  if (!chat) return false;

  const r = await fetch(`https://api.telegram.org/bot${jeton}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: notification.corps }),
  });
  return r.ok;
}

async function envoyer(notification: NotificationLigne): Promise<boolean> {
  if (notification.canal === 'EMAIL') return envoyerEmail(notification);
  if (notification.canal === 'TELEGRAM') return envoyerTelegram(notification);
  return false;
}

export async function traiterNotifications(limite = 50): Promise<{ traitees: number; envoyees: number }> {
  const notifications = await notificationsEnAttente(limite);
  let envoyees = 0;

  for (const notification of notifications) {
    const reservee = await reserverNotification(notification.id);
    if (!reservee) continue;

    try {
      const ok = await envoyer(notification);
      if (ok) {
        await marquerNotificationEnvoyee(notification.id);
        envoyees += 1;
      } else {
        await marquerNotificationEchec(
          notification.id,
          'Fournisseur non configuré ou envoi refusé.',
          notification.tentatives + 1,
        );
      }
    } catch (erreur) {
      await marquerNotificationEchec(
        notification.id,
        erreur instanceof Error ? erreur.message : 'Erreur inconnue',
        notification.tentatives + 1,
      );
    }
  }

  return { traitees: notifications.length, envoyees };
}

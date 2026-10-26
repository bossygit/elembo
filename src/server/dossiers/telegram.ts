/**
 * Avis à l'atelier (Telegram Bot API).
 *
 * Objectif : dès qu'une commande payée reçoit son dossier, quelqu'un doit pouvoir imprimer sans
 * ouvrir un ordinateur. Telegram est le canal le moins coûteux à mettre en place (un bot, un
 * chat), et il conserve les fichiers : le message devient une archive lisible par l'atelier.
 *
 * Principe de dégradation : si Telegram n'est pas configuré ou échoue, le dépôt n'est PAS perdu
 * (il est archivé et journalisé) ; la route répond `notifie: false` avec le motif, et `/api/sante`
 * l'affiche. Un échec de notification ne doit jamais faire échouer une commande déjà payée.
 */

const API = 'https://api.telegram.org';

export function telegramConfigure(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export type ResultatNotification = { envoye: boolean; motif?: string; documents: number };

type Document = { nom: string; contenu: ArrayBuffer; type: string };

/** Limite de l'API Telegram pour un envoi de document : 50 Mo. On garde une marge. */
const MAX_DOCUMENT = 45 * 1024 * 1024;
const MAX_TOTAL = 49 * 1024 * 1024;

export async function envoyerNotification(
  texte: string,
  documents: Document[] = [],
  options: { fetchImpl?: typeof globalThis.fetch } = {},
): Promise<ResultatNotification> {
  if (!telegramConfigure()) {
    return { envoye: false, motif: 'Telegram non configuré (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).', documents: 0 };
  }

  const appel = options.fetchImpl ?? globalThis.fetch;
  const jeton = process.env.TELEGRAM_BOT_TOKEN!.trim();
  const chat = process.env.TELEGRAM_CHAT_ID!.trim();

  const envoyerTexte = async (contenu: string): Promise<boolean> => {
    try {
      const r = await appel(`${API}/bot${jeton}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: contenu, disable_web_page_preview: true }),
      });
      return r.ok;
    } catch {
      return false;
    }
  };

  const texteEnvoye = await envoyerTexte(texte);
  if (!texteEnvoye) {
    return { envoye: false, motif: 'Telegram a refusé le message (jeton ou chat invalide ?).', documents: 0 };
  }

  let envoyes = 0;
  let total = 0;
  for (const doc of documents) {
    if (doc.contenu.byteLength > MAX_DOCUMENT || total + doc.contenu.byteLength > MAX_TOTAL) continue;
    const formulaire = new FormData();
    formulaire.append('chat_id', chat);
    // Le Blob est construit sur les octets reçus : le nom du fichier doit rester celui du dossier.
    formulaire.append('document', new Blob([doc.contenu], { type: doc.type }), doc.nom);
    try {
      const r = await appel(`${API}/bot${jeton}/sendDocument`, { method: 'POST', body: formulaire });
      if (r.ok) {
        envoyes += 1;
        total += doc.contenu.byteLength;
      }
    } catch {
      // un document qui échoue n'invalide pas la notification texte déjà partie
    }
  }

  if (envoyes === 0 && documents.length > 0) {
    await envoyerTexte('(Les fichiers sont archivés côté serveur, mais leur envoi a échoué — voir /api/commandes.)');
    return { envoye: true, motif: 'Message envoyé, fichiers non transmis.', documents: 0 };
  }

  return { envoye: true, documents: envoyes };
}

// Avis à l'atelier par Telegram : le message doit partir, les fichiers suivre, et un échec de
// notification ne doit jamais faire échouer une commande déjà payée.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { envoyerNotification, telegramConfigure } from '../src/server/dossiers/telegram';

const ENV = { ...process.env };
let appels: { url: string; init?: RequestInit }[] = [];

function fauxTelegram(ok = true) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 400 });
  }) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
  appels = [];
  process.env.TELEGRAM_BOT_TOKEN = 'jeton-test';
  process.env.TELEGRAM_CHAT_ID = '12345';
});

afterEach(() => {
  process.env = { ...ENV };
});

describe('configuration', () => {
  it('exige le jeton ET le chat', () => {
    expect(telegramConfigure()).toBe(true);
    delete process.env.TELEGRAM_CHAT_ID;
    expect(telegramConfigure()).toBe(false);
  });
});

describe('notification', () => {
  it('envoie le récapitulatif puis les documents', async () => {
    const resultat = await envoyerNotification(
      'Commande ELB-1 — PAYÉE',
      [{ nom: 'avant.png', contenu: new Uint8Array([1, 2, 3]).buffer, type: 'image/png' }],
      { fetchImpl: fauxTelegram() },
    );

    expect(resultat).toEqual({ envoye: true, documents: 1 });
    expect(appels).toHaveLength(2);
    expect(appels[0]!.url).toBe('https://api.telegram.org/botjeton-test/sendMessage');
    expect(JSON.parse(String(appels[0]!.init?.body))).toMatchObject({ chat_id: '12345' });
    expect(appels[1]!.url).toBe('https://api.telegram.org/botjeton-test/sendDocument');
    expect(appels[1]!.init?.body).toBeInstanceOf(FormData);
  });

  it('n’appelle rien si Telegram n’est pas configuré, et le dit', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const resultat = await envoyerNotification('texte', [], { fetchImpl: fauxTelegram() });
    expect(resultat.envoye).toBe(false);
    expect(resultat.motif).toMatch(/non configuré/);
    expect(appels).toHaveLength(0);
  });

  it('signale un message refusé (jeton ou chat invalide)', async () => {
    const resultat = await envoyerNotification('texte', [], { fetchImpl: fauxTelegram(false) });
    expect(resultat.envoye).toBe(false);
    expect(resultat.motif).toMatch(/refusé/);
  });

  it('ne bloque pas la notification quand un document échoue', async () => {
    let appel = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      appel += 1;
      const ok = !String(url).endsWith('/sendDocument') || appel > 2;
      return new Response('{}', { status: ok ? 200 : 500 });
    }) as unknown as typeof globalThis.fetch;

    const resultat = await envoyerNotification(
      'Commande ELB-1',
      [{ nom: 'avant.png', contenu: new Uint8Array([1]).buffer, type: 'image/png' }],
      { fetchImpl },
    );
    // Le texte est parti : la notification est considérée faite, le fichier sera récupéré autrement.
    expect(resultat.envoye).toBe(true);
  });

  it('ignore un document au-delà de la limite Telegram', async () => {
    const enorme = new ArrayBuffer(46 * 1024 * 1024);
    const resultat = await envoyerNotification(
      'Commande ELB-1',
      [{ nom: 'enorme.png', contenu: enorme, type: 'image/png' }],
      { fetchImpl: fauxTelegram() },
    );
    // Aucun sendDocument : le document trop lourd n'est pas tenté. Le texte part, puis un mot
    // d'explication (le fichier est archivé côté serveur, pas dans la conversation).
    expect(appels.some((a) => a.url.endsWith('/sendDocument'))).toBe(false);
    expect(appels[0]!.url).toContain('/sendMessage');
    expect(resultat.envoye).toBe(true);
  });
});

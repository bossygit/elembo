import { createHmac, randomInt } from 'node:crypto';

import { comparerSecret } from '@/server/security/http';
import { clientRedis } from '@/server/security/rateLimit';
import { supabaseAdmin } from '@/server/supabase/client';

type DevisOtp = {
  id: string;
  reference: string;
  client_id: string;
  clients: { email: string | null; telephone: string | null } | null;
};

export function genererCodeOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hacherOtp(code: string, devisId: string): string {
  const secret = process.env.DEVIS_OTP_SECRET?.trim();
  if (!secret) throw new Error('DEVIS_OTP_SECRET manquant.');
  return createHmac('sha256', secret).update(`${devisId}:${code}`).digest('hex');
}

function ttlSecondes(): number {
  const valeur = Number(process.env.DEVIS_OTP_TTL_SECONDS ?? '600');
  return Number.isFinite(valeur) && valeur >= 60 ? Math.floor(valeur) : 600;
}

function maxTentatives(): number {
  const valeur = Number(process.env.DEVIS_OTP_MAX_ATTEMPTS ?? '5');
  return Number.isFinite(valeur) && valeur >= 1 ? Math.floor(valeur) : 5;
}

function cleOtp(devisId: string): string {
  return `elembo:devis:otp:${devisId}`;
}

async function trouverDevis(reference: string): Promise<DevisOtp | null> {
  const { data, error } = await supabaseAdmin()
    .from('devis')
    .select('id,reference,client_id,clients(email,telephone)')
    .eq('reference', reference)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as DevisOtp;
}

async function envoyerEmail(destinataire: string, code: string, reference: string): Promise<boolean> {
  const cle = process.env.RESEND_API_KEY?.trim();
  const expediteur = process.env.DEVIS_EMAIL_FROM?.trim();
  if (!cle || !expediteur) return false;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `otp-${reference}-${Date.now()}`,
      },
      body: JSON.stringify({
        from: expediteur,
        to: [destinataire],
        subject: `Code de suivi du devis ${reference}`,
        text: `Votre code de suivi est ${code}. Il expire dans 10 minutes. Ne le communiquez à personne.`,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function envoyerSms(destinataire: string, code: string, reference: string): Promise<boolean> {
  const url = process.env.SMS_API_URL?.trim();
  const cle = process.env.SMS_API_KEY?.trim();
  const expediteur = process.env.SMS_SENDER?.trim();
  if (!url || !cle) return false;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: destinataire,
        from: expediteur,
        message: `Elembo : code de suivi ${code} pour le devis ${reference}. Valable 10 min.`,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Réponse générique : ne jamais révéler si la référence existe ou si un canal
 * est configuré. Retourne true si un code a réellement été émis.
 */
export async function demanderOtp(reference: string): Promise<boolean> {
  const devis = await trouverDevis(reference);
  if (!devis) return false;

  const code = genererCodeOtp();
  const hash = hacherOtp(code, devis.id);
  const email = devis.clients?.email?.trim();
  const telephone = devis.clients?.telephone?.trim();

  let envoye = false;
  if (email) envoye = await envoyerEmail(email, code, devis.reference);
  if (!envoye && telephone) envoye = await envoyerSms(telephone, code, devis.reference);
  if (!envoye) return false;

  const redis = await clientRedis();
  await redis.set(
    cleOtp(devis.id),
    JSON.stringify({ hash, tentatives: 0 }),
    'EX',
    ttlSecondes(),
  );
  return true;
}

export async function verifierOtp(reference: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const devis = await trouverDevis(reference);
  if (!devis) return false;

  const redis = await clientRedis();
  const brut = await redis.get(cleOtp(devis.id));
  if (!brut) return false;

  let stocke: { hash?: string; tentatives?: number };
  try {
    stocke = JSON.parse(brut) as { hash?: string; tentatives?: number };
  } catch {
    await redis.del(cleOtp(devis.id));
    return false;
  }

  const attendu = hacherOtp(code, devis.id);
  if (!stocke.hash || !comparerSecret(attendu, stocke.hash)) {
    const tentatives = (stocke.tentatives ?? 0) + 1;
    if (tentatives >= maxTentatives()) {
      await redis.del(cleOtp(devis.id));
    } else {
      await redis.set(
        cleOtp(devis.id),
        JSON.stringify({ hash: stocke.hash, tentatives }),
        'EX',
        ttlSecondes(),
      );
    }
    return false;
  }

  await redis.del(cleOtp(devis.id));
  return true;
}

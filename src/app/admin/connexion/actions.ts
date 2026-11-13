'use server';

import { createHash } from 'node:crypto';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { destinationSure } from '@/lib/admin/navigation';
import { journaliser } from '@/server/admin/audit';
import { staffCourant } from '@/server/admin/acces';
import { roleDepuisClaims } from '@/server/auth/roles';
import { creerClientAuthServeur } from '@/server/auth/session';
import { ErreurLimiteIndisponible, limiter } from '@/server/security/rateLimit';

function empreinte(valeur: string): string {
  return createHash('sha256').update(valeur).digest('hex').slice(0, 32);
}

/**
 * 10 tentatives par 15 min et par IP, 5 par 15 min et par compte. Si Redis est indisponible,
 * on laisse passer (Supabase Auth applique ses propres limites) plutôt que de bloquer tout le
 * personnel ; l'incident est journalisé.
 */
async function tentativeAutorisee(email: string): Promise<boolean> {
  const entetes = await headers();
  const ip = (entetes.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || entetes.get('x-real-ip') || 'inconnue';
  try {
    const parIp = await limiter(`admin:connexion:ip:${empreinte(ip)}`, 10, 900);
    const parCompte = await limiter(`admin:connexion:compte:${empreinte(email)}`, 5, 900);
    return parIp && parCompte;
  } catch (erreur) {
    if (erreur instanceof ErreurLimiteIndisponible) {
      console.error('Connexion back-office : limitation indisponible (Redis).');
      return true;
    }
    throw erreur;
  }
}

export async function connexion(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254);
  const motDePasse = String(formData.get('mot_de_passe') ?? '').slice(0, 200);
  const suite = destinationSure(formData.get('suite'));
  const retour = (erreur: string) =>
    `/admin/connexion?erreur=${erreur}${suite !== '/admin' ? `&suite=${encodeURIComponent(suite)}` : ''}`;

  if (!email || !motDePasse) redirect(retour('champs'));
  if (!(await tentativeAutorisee(email))) redirect(retour('limite'));

  const client = await creerClientAuthServeur();
  const { data, error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  // Message identique pour un email inconnu et un mauvais mot de passe.
  if (error || !data.user) redirect(retour('identifiants'));

  const role = roleDepuisClaims({ app_metadata: data.user.app_metadata });
  if (!role) {
    // Compte valide mais sans rôle staff : aucune session ne doit subsister.
    await client.auth.signOut();
    redirect(retour('acces'));
  }

  await journaliser({
    staff: { id: data.user.id, email: data.user.email ?? null },
    action: 'CONNEXION',
    entite: 'session',
    entiteId: data.user.id,
    apres: { role },
  });
  redirect(suite);
}

export async function deconnexion(): Promise<void> {
  const staff = await staffCourant();
  const client = await creerClientAuthServeur();
  // `scope: 'local'` : ferme cette session, pas celles ouvertes sur d'autres appareils.
  await client.auth.signOut({ scope: 'local' });
  if (staff) {
    await journaliser({ staff, action: 'DECONNEXION', entite: 'session', entiteId: staff.id });
  }
  redirect('/admin/connexion?ok=deconnexion');
}

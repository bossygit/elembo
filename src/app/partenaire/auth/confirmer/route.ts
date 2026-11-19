/**
 * Arrivée des liens envoyés par e-mail (confirmation d'inscription, réinitialisation du mot de
 * passe). Deux formes acceptées :
 *
 *  - `?token_hash=…&type=…` : modèles d'e-mail Elembo (supabase/templates) — fonctionne même si le
 *    lien est ouvert sur un autre appareil que celui de l'inscription ;
 *  - `?code=…` : modèles par défaut de Supabase (flux PKCE) — le lien doit être ouvert dans le
 *    navigateur qui a fait la demande.
 *
 * La session ouverte ici est écrite en cookie (Route Handler : `cookies().set` est autorisé).
 */

import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { destinationPartenaire, estTypeLien } from '@/lib/partenaires/compte';
import { estCheminInvitation } from '@/lib/partenaires/invitations';
import { journaliser } from '@/server/admin/audit';
import { creerClientAuthServeur } from '@/server/auth/session';
import { finaliserInscription, lireEtatCompte } from '@/server/partenaires/acces';

export const dynamic = 'force-dynamic';

const MOT_DE_PASSE = '/partenaire/mot-de-passe/nouveau';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const suite = destinationPartenaire(params.get('suite'));

  const client = await creerClientAuthServeur();
  let ok = false;
  const recuperation = type === 'recovery' || suite === MOT_DE_PASSE;
  try {
    if (tokenHash && estTypeLien(type) && /^[A-Za-z0-9_-]{8,200}$/.test(tokenHash)) {
      const { error } = await client.auth.verifyOtp({ type, token_hash: tokenHash });
      ok = !error;
    } else if (code && /^[A-Za-z0-9_-]{8,200}$/.test(code)) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      ok = !error;
    }
  } catch {
    ok = false;
  }
  // Lien expiré, déjà utilisé ou ouvert dans un autre navigateur (flux PKCE).
  if (!ok) redirect('/partenaire/connexion?erreur=lien');

  const etat = await lireEtatCompte();
  if (etat.type === 'staff') {
    await client.auth.signOut({ scope: 'local' });
    redirect('/partenaire/connexion?erreur=staff');
  }
  if (etat.type === 'anonyme' || etat.type === 'non_confirme') redirect('/partenaire/connexion?erreur=lien');

  if (recuperation) redirect(MOT_DE_PASSE);

  let cree: string | null = null;
  try {
    cree = await finaliserInscription(etat);
  } catch (erreur) {
    // La page « bienvenue » propose de créer l'entreprise à la main : rien n'est perdu.
    console.error('Création de l’entreprise après confirmation :', (erreur as Error).message);
  }
  if (cree && etat.type === 'sans_entreprise') {
    await journaliser({
      staff: { id: etat.userId, email: etat.email },
      action: 'PARTENAIRE_INSCRIPTION',
      entite: 'partenaire',
      entiteId: cree,
      apres: { statut: 'BROUILLON', confirmation: 'e-mail' },
    });
    redirect('/partenaire?ok=bienvenue');
  }
  // Compte invité : retour à l'invitation pour l'accepter ; sinon, création de l'entreprise.
  if (etat.type === 'sans_entreprise') redirect(estCheminInvitation(suite) ? suite : '/partenaire/bienvenue');
  redirect(suite);
}

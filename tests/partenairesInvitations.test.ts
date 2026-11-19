/**
 * Invitations et équipe d'un atelier (sous-lot 1.6) — jetons, états, formulaire, navigation et
 * garanties structurelles.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MATRICE } from '../src/lib/admin/permissions';
import { destinationPartenaire, estPagePubliquePartenaire } from '../src/lib/partenaires/compte';
import {
  CHEMIN_INVITATION,
  estCheminInvitation,
  estJetonInvitation,
  etatInvitation,
  lienInvitation,
  lireInvitation,
} from '../src/lib/partenaires/invitations';
import { empreinteJeton } from '../src/server/partenaires/invitations';

const JETON = 'a'.repeat(43);

function f(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

describe('jetons et liens', () => {
  it('format base64url de 43 caractères (32 octets), rien d’autre', () => {
    expect(estJetonInvitation(JETON)).toBe(true);
    expect(estJetonInvitation('A-_9'.repeat(10) + 'abc')).toBe(true);
    for (const x of ['a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}/`, `${'a'.repeat(42)}.`, 42, null]) {
      expect(estJetonInvitation(x), String(x)).toBe(false);
    }
  });

  it('seule l’empreinte SHA-256 est stockée (64 hexadécimaux, compatible avec la contrainte SQL)', () => {
    expect(empreinteJeton(JETON)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteJeton(JETON)).not.toContain(JETON);
    expect(empreinteJeton(JETON)).toBe(empreinteJeton(JETON));
    expect(empreinteJeton(JETON)).not.toBe(empreinteJeton('b'.repeat(43)));
  });

  it('lien et chemin', () => {
    expect(lienInvitation('https://elembo.cg/', JETON)).toBe(`https://elembo.cg${CHEMIN_INVITATION}${JETON}`);
    expect(estCheminInvitation(`${CHEMIN_INVITATION}${JETON}`)).toBe(true);
    expect(estCheminInvitation(`${CHEMIN_INVITATION}${JETON}/x`)).toBe(false);
    expect(estPagePubliquePartenaire(`${CHEMIN_INVITATION}${JETON}`)).toBe(true);
  });

  it('après connexion, on revient sur l’invitation, et sur aucune autre page publique', () => {
    expect(destinationPartenaire(`${CHEMIN_INVITATION}${JETON}`)).toBe(`${CHEMIN_INVITATION}${JETON}`);
    expect(destinationPartenaire(`${CHEMIN_INVITATION}pas-un-jeton`)).toBe('/partenaire');
    expect(destinationPartenaire(`${CHEMIN_INVITATION}${JETON}/../../admin`)).toBe('/partenaire');
    expect(destinationPartenaire('/partenaire/inscription')).toBe('/partenaire');
  });
});

describe('état d’une invitation', () => {
  const maintenant = new Date('2026-11-19T10:00:00Z');
  const base = { acceptee_le: null, revoquee_le: null, expire_le: '2026-11-26T10:00:00Z' };

  it('en attente, acceptée, annulée, expirée', () => {
    expect(etatInvitation(base, maintenant)).toBe('EN_ATTENTE');
    expect(etatInvitation({ ...base, acceptee_le: '2026-11-19T09:00:00Z' }, maintenant)).toBe('ACCEPTEE');
    expect(etatInvitation({ ...base, revoquee_le: '2026-11-19T09:00:00Z' }, maintenant)).toBe('REVOQUEE');
    expect(etatInvitation({ ...base, expire_le: '2026-11-19T10:00:00Z' }, maintenant)).toBe('EXPIREE');
  });
});

describe('formulaire d’invitation', () => {
  it('adresse normalisée, rôle limité à la liste autorisée', () => {
    expect(lireInvitation(f({ email: ' Ope@Atelier.CG ', role: 'PRODUCTION' }), ['RESPONSABLE', 'PRODUCTION', 'LECTURE'])).toEqual({
      ok: true,
      email: 'ope@atelier.cg',
      role: 'PRODUCTION',
    });
    // Le back-office n'invite que des responsables.
    expect(lireInvitation(f({ email: 'x@y.cg', role: 'PRODUCTION' }), ['RESPONSABLE']).ok).toBe(false);
    expect(lireInvitation(f({ email: 'x@y.cg', role: 'ADMIN' }), ['RESPONSABLE', 'PRODUCTION', 'LECTURE']).ok).toBe(false);
    expect(lireInvitation(f({ email: 'pas-un-email', role: 'LECTURE' }), ['LECTURE']).ok).toBe(false);
  });
});

/* ------------------------------------------------- garanties structurelles -- */

const lire = (chemin: string) => readFileSync(join(process.cwd(), chemin), 'utf8');

describe('garanties des invitations et de l’équipe', () => {
  it('le jeton en clair n’est jamais écrit dans la table des invitations', () => {
    const serveur = lire('src/server/partenaires/invitations.ts');
    const insertion = serveur.slice(serveur.indexOf(".from('partenaire_invitations')\n    .insert("), serveur.indexOf(".select('id')\n    .single();"));
    expect(insertion).toMatch(/jeton_hash: empreinteJeton\(jeton\)/);
    expect(insertion).not.toMatch(/\bjeton(?!_hash)\s*[,}]/);
  });

  it('l’inscription d’une personne invitée prend l’adresse de l’invitation, jamais du formulaire', () => {
    const actions = lire('src/app/partenaire/actions.ts');
    const bloc = actions.slice(actions.indexOf('export async function inscrireInvite'), actions.indexOf('export async function accepterInvitationAction'));
    expect(bloc).toMatch(/email: invitation\.email/);
    expect(bloc).not.toMatch(/formData\.get\('email'\)/);
    expect(bloc).not.toMatch(/CLE_INSCRIPTION/); // aucune entreprise créée pour une personne invitée
  });

  it('le responsable gère son équipe (droit utilisateurs.gerer) sans pouvoir modifier son propre accès', () => {
    const actions = lire('src/app/partenaire/utilisateurs-actions.ts');
    const exportees = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
    expect(exportees.length).toBe(3);
    for (const [, nom, premiere] of exportees) expect(premiere, nom).toMatch(/await exigerPartenaire\('utilisateurs\.gerer'\)/);
    expect(actions).toMatch(/cible\.user_id === session\.userId\) return \{ erreur: 'Vous ne pouvez pas modifier votre propre accès\.' \}/);
    expect(lire('src/server/partenaires/invitations.ts')).toMatch(/\.eq\('id', membreId\)\n\s+\.eq\('partenaire_id', partenaireId\)/);
  });

  it('back-office : comptes réservés à l’administration, invitation d’un responsable seulement', () => {
    expect(MATRICE['partenaires.comptes']).toEqual(['admin']);
    const actions = lire('src/app/admin/(protected)/partenaires/actions.ts');
    expect(actions).toMatch(/inviterResponsableAction[^]*?await exigerAcces\('partenaires\.comptes'\)[^]*?lireInvitation\(formData, \['RESPONSABLE'\]\)/);
  });

  it('la page d’invitation n’accepte rien sans un compte confirmé à la bonne adresse', () => {
    const page = lire('src/app/partenaire/invitation/[jeton]/page.tsx');
    expect(page).toMatch(/if \(email !== invitation\.email\)/);
    expect(page).toMatch(/etat\.type === 'non_confirme'/);
    expect(page).toMatch(/etat\.type === 'staff'/);
  });
});

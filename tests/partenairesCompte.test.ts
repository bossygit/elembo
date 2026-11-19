/**
 * Portail partenaire — comptes, navigation et formulaires d'accès (sous-lot 1.2).
 *
 * Partie 1 : règles pures (`src/lib/partenaires/compte.ts`).
 * Partie 2 : garanties structurelles vérifiées sur le code source, comme pour le back-office
 * (`adminSecurite.test.ts`) : chaque page protégée appelle la couche d'accès, aucune n'accepte
 * un identifiant d'entreprise venu de la requête.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CLE_INSCRIPTION,
  destinationPartenaire,
  erreurMotDePasse,
  estPagePubliquePartenaire,
  estTypeLien,
  intentionInscription,
  lireConnexion,
  lireInscription,
  lireNouveauMotDePasse,
  resoudreEtatCompte,
  type Rattachement,
} from '../src/lib/partenaires/compte';

const confirme = { id: 'u1', email: 'Atelier@Exemple.CG', email_confirmed_at: '2026-11-16T10:00:00Z', app_metadata: {}, user_metadata: {} };
const rattachement: Rattachement = { partenaire_id: 'p1', role_partenaire: 'RESPONSABLE', nom: 'Imprimerie A', statut: 'BROUILLON' };

function formulaire(champs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
}

describe('état d’un compte sur le portail', () => {
  it('anonyme sans utilisateur', () => {
    expect(resoudreEtatCompte(null, null)).toEqual({ type: 'anonyme' });
  });

  it('un compte staff n’entre jamais dans le portail, même rattaché', () => {
    const staff = { ...confirme, app_metadata: { role: 'admin' } };
    expect(resoudreEtatCompte(staff, rattachement).type).toBe('staff');
  });

  it('un rôle staff vide n’est pas un rôle staff', () => {
    expect(resoudreEtatCompte({ ...confirme, app_metadata: { role: '  ' } }, rattachement).type).toBe('partenaire');
  });

  it('e-mail non confirmé : aucun accès, même rattaché', () => {
    expect(resoudreEtatCompte({ ...confirme, email_confirmed_at: null }, rattachement).type).toBe('non_confirme');
  });

  it('confirmé sans rattachement : création ou invitation, avec l’intention de l’inscription', () => {
    const avecIntention = { ...confirme, user_metadata: { [CLE_INSCRIPTION]: { nom: ' Atelier B ', telephone: '06 111 22 33' } } };
    expect(resoudreEtatCompte(avecIntention, null)).toEqual({
      type: 'sans_entreprise',
      userId: 'u1',
      email: 'atelier@exemple.cg',
      intention: { nom: 'Atelier B', telephone: '06 111 22 33' },
    });
    expect(resoudreEtatCompte(confirme, null)).toMatchObject({ type: 'sans_entreprise', intention: null });
  });

  it('rattachement incohérent (rôle ou statut inconnus) : traité comme absent', () => {
    expect(resoudreEtatCompte(confirme, { ...rattachement, role_partenaire: 'ADMIN' }).type).toBe('sans_entreprise');
    expect(resoudreEtatCompte(confirme, { ...rattachement, statut: 'PIRATE' }).type).toBe('sans_entreprise');
  });

  it('partenaire : l’entreprise vient du rattachement, l’e-mail est normalisé', () => {
    expect(resoudreEtatCompte(confirme, rattachement)).toEqual({
      type: 'partenaire',
      session: {
        userId: 'u1',
        email: 'atelier@exemple.cg',
        partenaireId: 'p1',
        nomPartenaire: 'Imprimerie A',
        role: 'RESPONSABLE',
        statutPartenaire: 'BROUILLON',
      },
    });
  });

  it('l’intention d’inscription est ignorée si elle est mal formée', () => {
    expect(intentionInscription(null)).toBeNull();
    expect(intentionInscription({ [CLE_INSCRIPTION]: 'texte' })).toBeNull();
    expect(intentionInscription({ [CLE_INSCRIPTION]: { nom: 'A' } })).toBeNull();
    expect(intentionInscription({ [CLE_INSCRIPTION]: { nom: 'x'.repeat(121) } })).toBeNull();
    expect(intentionInscription({ [CLE_INSCRIPTION]: { nom: 'Atelier', telephone: 42 } })).toEqual({ nom: 'Atelier', telephone: null });
  });
});

describe('navigation du portail', () => {
  it('pages publiques', () => {
    for (const p of ['/partenaire/connexion', '/partenaire/inscription', '/partenaire/mot-de-passe', '/partenaire/auth/confirmer', '/partenaire/invitation/abc']) {
      expect(estPagePubliquePartenaire(p), p).toBe(true);
    }
    for (const p of ['/partenaire', '/partenaire/bienvenue', '/partenaire/suspendu', '/partenaire/mot-de-passe/nouveau', '/partenaire/connexionx']) {
      expect(estPagePubliquePartenaire(p), p).toBe(false);
    }
  });

  it('aucune redirection ouverte après connexion', () => {
    for (const suite of [
      'https://pirate.example',
      '//pirate.example',
      '/partenaire/../admin',
      '/admin',
      '/partenaire//pirate.example',
      '/partenaire/connexion',
      '/partenaire/inscription',
      42,
      undefined,
    ]) {
      expect(destinationPartenaire(suite), String(suite)).toBe('/partenaire');
    }
    expect(destinationPartenaire('/partenaire/machines')).toBe('/partenaire/machines');
    expect(destinationPartenaire('/partenaire/mot-de-passe/nouveau')).toBe('/partenaire/mot-de-passe/nouveau');
  });

  it('types de lien d’e-mail acceptés', () => {
    expect(estTypeLien('recovery')).toBe(true);
    expect(estTypeLien('email')).toBe(true);
    expect(estTypeLien('magiclink')).toBe(false);
    expect(estTypeLien(null)).toBe(false);
  });
});

describe('formulaires d’accès', () => {
  const valide = {
    nom: 'Imprimerie du Plateau',
    telephone: '+242 06 123 45 67',
    email: ' Contact@Plateau.CG ',
    mot_de_passe: 'une phrase solide',
    confirmation: 'une phrase solide',
    engagement: 'oui',
  };

  it('inscription valide, e-mail normalisé', () => {
    expect(lireInscription(formulaire(valide))).toEqual({
      ok: true,
      valeur: { email: 'contact@plateau.cg', motDePasse: 'une phrase solide', nom: 'Imprimerie du Plateau', telephone: '+242 06 123 45 67' },
    });
  });

  it('inscription refusée champ par champ', () => {
    const cas: [Partial<typeof valide>, RegExp][] = [
      [{ nom: 'A' }, /nom/],
      [{ telephone: 'abc' }, /téléphone/],
      [{ email: 'pas-un-email' }, /e-mail/],
      [{ mot_de_passe: 'court', confirmation: 'court' }, /au moins 10/],
      [{ confirmation: 'autre chose!!' }, /correspondent/],
    ];
    for (const [modif, motif] of cas) {
      const r = lireInscription(formulaire({ ...valide, ...modif }));
      expect(r.ok, JSON.stringify(modif)).toBe(false);
      if (!r.ok) expect(r.erreur).toMatch(motif);
    }
    const sansEngagement = formulaire(valide);
    sansEngagement.delete('engagement');
    expect(lireInscription(sansEngagement).ok).toBe(false);
  });

  it('mot de passe : longueur, limite de 72 octets, espaces aux bords', () => {
    expect(erreurMotDePasse('123456789')).toMatch(/au moins/);
    expect(erreurMotDePasse('1234567890')).toBeNull();
    expect(erreurMotDePasse('é'.repeat(37))).toMatch(/trop long/); // 74 octets
    expect(erreurMotDePasse(' commence par un espace')).toMatch(/espace/);
  });

  it('connexion et nouveau mot de passe', () => {
    expect(lireConnexion(formulaire({ email: 'a@b.cg', mot_de_passe: 'x' }))).toEqual({ email: 'a@b.cg', motDePasse: 'x' });
    expect(lireConnexion(formulaire({ email: 'a@b.cg' }))).toBeNull();
    expect(lireNouveauMotDePasse(formulaire({ mot_de_passe: 'nouveau mot de passe', confirmation: 'nouveau mot de passe' }))).toEqual({
      ok: true,
      motDePasse: 'nouveau mot de passe',
    });
    expect(lireNouveauMotDePasse(formulaire({ mot_de_passe: 'nouveau mot de passe', confirmation: 'autre' })).ok).toBe(false);
  });
});

/* ------------------------------------------------- garanties structurelles -- */

const RACINE = process.cwd();
const PORTAIL = join(RACINE, 'src/app/partenaire');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const pages = fichiers(PORTAIL).filter((f) => f.endsWith('page.tsx'));
const routeDe = (f: string) => '/' + relative(join(RACINE, 'src/app'), f).replace(/\/?page\.tsx$/, '');

describe('portail — contrôle d’accès à chaque point d’entrée', () => {
  it('chaque page protégée appelle la couche d’accès', () => {
    const protegees = pages.filter((f) => !estPagePubliquePartenaire(routeDe(f)));
    expect(protegees.length).toBeGreaterThanOrEqual(4);
    for (const page of protegees) {
      const contenu = readFileSync(page, 'utf8');
      expect(contenu, relative(RACINE, page)).toMatch(/await (exigerPartenaire\('[a-z_.]+'|etatCompte\(\))/);
    }
  });

  it('aucune page ni action ne lit un identifiant d’entreprise dans la requête', () => {
    for (const f of fichiers(PORTAIL).filter((x) => /\.(ts|tsx)$/.test(x))) {
      const contenu = readFileSync(f, 'utf8');
      expect(contenu, relative(RACINE, f)).not.toMatch(/(formData|searchParams|params)\.get\(['"]partenaire_?id['"]\)/i);
      expect(contenu, relative(RACINE, f)).not.toMatch(/\bpartenaire_?[iI]d\b[^;\n]*(searchParams|formData)/);
    }
  });

  it('les actions du portail sont des actions serveur et ne font jamais confiance à user_metadata pour un droit', () => {
    const actions = readFileSync(join(PORTAIL, 'actions.ts'), 'utf8');
    expect(actions.trimStart().startsWith("'use server'")).toBe(true);
    expect(actions).not.toMatch(/user_metadata\??\.\w*role/);
    const acces = readFileSync(join(RACINE, 'src/server/partenaires/acces.ts'), 'utf8');
    expect(acces).not.toMatch(/user_metadata\??\.\w*role/);
  });

  it('le proxy couvre le portail et ne lit pas la base', () => {
    const proxy = readFileSync(join(RACINE, 'src/proxy.ts'), 'utf8');
    expect(proxy).toMatch(/'\/partenaire\/:path\*'/);
    expect(proxy).not.toMatch(/supabaseAdmin|service_role|\.from\(/);
  });

  it('robots.txt exclut le portail', () => {
    expect(readFileSync(join(RACINE, 'src/app/robots.ts'), 'utf8')).toMatch(/'\/partenaire'/);
  });
});

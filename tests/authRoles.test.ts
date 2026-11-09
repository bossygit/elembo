import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  ErreurAcces,
  ROLES_STAFF,
  estStaff,
  exigerRole,
  roleDepuisClaims,
} from '../src/server/auth/roles';

function fichiersTs(dossier: string): string[] {
  const resultat: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiersTs(chemin));
    else if (chemin.endsWith('.ts') || chemin.endsWith('.tsx')) resultat.push(chemin);
  }
  return resultat;
}

describe('rôles staff', () => {
  it('lit le rôle dans app_metadata, jamais dans user_metadata', () => {
    expect(roleDepuisClaims({ app_metadata: { role: 'commercial' } })).toBe('commercial');
    expect(roleDepuisClaims({ user_metadata: { role: 'admin' } })).toBeNull();
    expect(
      roleDepuisClaims({
        app_metadata: { role: 'atelier' },
        user_metadata: { role: 'admin' },
      }),
    ).toBe('atelier');
  });

  it('refuse un rôle inconnu, absent ou mal typé', () => {
    expect(roleDepuisClaims(null)).toBeNull();
    expect(roleDepuisClaims({})).toBeNull();
    expect(roleDepuisClaims({ app_metadata: { role: 'superadmin' } })).toBeNull();
    expect(roleDepuisClaims({ app_metadata: { role: 42 } })).toBeNull();
    expect(estStaff({ app_metadata: { role: 'client' } })).toBe(false);
  });

  it('autorise seulement les rôles demandés', () => {
    expect(exigerRole({ app_metadata: { role: 'admin' } }, ['admin'])).toBe('admin');
    expect(exigerRole({ app_metadata: { role: 'atelier' } }, ['admin', 'atelier'])).toBe('atelier');
    expect(() => exigerRole({ app_metadata: { role: 'commercial' } }, ['admin'])).toThrow(ErreurAcces);
    expect(() => exigerRole({ user_metadata: { role: 'admin' } }, ['admin'])).toThrow(ErreurAcces);
  });

  it('couvre les quatre rôles prévus', () => {
    expect([...ROLES_STAFF].sort()).toEqual(['admin', 'atelier', 'commercial', 'finance']);
  });

  it('aucune route API n’utilise service_role sans garde de rôle', () => {
    const routes = fichiersTs(join(process.cwd(), 'src/app/api')).filter((f) => f.endsWith('route.ts'));
    const avecServiceRole = routes.filter((f) => {
      const contenu = readFileSync(f, 'utf8');
      return /SUPABASE_SERVICE_ROLE_KEY|service_role/.test(contenu);
    });
    for (const route of avecServiceRole) {
      const contenu = readFileSync(route, 'utf8');
      expect(contenu, `${route} doit importer avecGardeRole/exigerRole`).toMatch(
        /avecGardeRole|exigerRole|roleDepuisClaims|garderRoles/,
      );
      expect(contenu, `${route} ne doit pas être un composant client`).not.toMatch(
        /['"]use client['"]/,
      );
    }
  });

  it('toute future route /api/admin est protégée par un garde de rôle', () => {
    const routes = fichiersTs(join(process.cwd(), 'src/app/api')).filter((f) => f.endsWith('route.ts'));
    const adminRoutes = routes.filter((f) => f.includes('/api/admin/'));
    for (const route of adminRoutes) {
      const contenu = readFileSync(route, 'utf8');
      expect(contenu, `${route} doit importer avecGardeRole/exigerRole`).toMatch(
        /avecGardeRole|exigerRole|roleDepuisClaims|garderRoles/,
      );
    }
  });

  it('le nettoyage des tests ne supprime que par identifiants', () => {
    const contenu = readFileSync(
      join(process.cwd(), 'tests/supabaseLifecycle.integration.test.ts'),
      'utf8',
    );
    const filtres = [...contenu.matchAll(/service\(`([^`]+)`,\s*\{\s*method:\s*'DELETE'/g)].map(
      (m) => m[1],
    );
    expect(filtres.length).toBeGreaterThan(0);
    for (const filtre of filtres) {
      expect(filtre, filtre).toMatch(/(?:id|commande_id|reference_id)=(?:in\.\(|eq\.)/);
      expect(filtre, filtre).not.toMatch(/like\./i);
    }
  });

  it('la clé service_role n’est jamais préfixée NEXT_PUBLIC_', () => {
    for (const fichier of fichiersTs(join(process.cwd(), 'src'))) {
      const contenu = readFileSync(fichier, 'utf8');
      expect(contenu, fichier).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
    }
  });
});

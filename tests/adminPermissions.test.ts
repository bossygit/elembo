import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MATRICE, peut, permissionsDu, type Permission } from '../src/lib/admin/permissions';
import {
  STATUTS_COMMANDE,
  STATUTS_PAR_ROLE,
  TRANSITIONS_COMMANDE,
  transitionPermise,
  transitionsPossibles,
  type StatutCommande,
} from '../src/lib/admin/statuts';
import { ROLES_STAFF } from '../src/server/auth/roles';

describe('matrice des droits du back-office', () => {
  it('l’administrateur a toutes les permissions', () => {
    for (const permission of Object.keys(MATRICE) as Permission[]) {
      expect(peut('admin', permission), permission).toBe(true);
    }
  });

  it('refuse tout à un rôle absent ou inconnu', () => {
    expect(peut(null, 'tableau_de_bord.voir')).toBe(false);
    expect(peut(undefined, 'commandes.voir')).toBe(false);
    expect(peut('client' as never, 'commandes.voir')).toBe(false);
  });

  it('le dossier de production n’est accessible qu’à l’administration et à l’atelier', () => {
    expect(MATRICE['production.fichiers']).toEqual(['admin', 'atelier']);
    expect(peut('commercial', 'production.fichiers')).toBe(false);
    expect(peut('finance', 'production.fichiers')).toBe(false);
  });

  it('l’atelier ne voit ni chiffre d’affaires, ni marges, ni coordonnées complètes des clients', () => {
    expect(peut('atelier', 'ventes.voir')).toBe(false);
    expect(peut('atelier', 'marges.voir')).toBe(false);
    expect(peut('atelier', 'clients.coordonnees')).toBe(false);
    expect(peut('atelier', 'clients.voir')).toBe(false);
    expect(peut('atelier', 'devis.voir')).toBe(false);
  });

  it('les prix et les coûts ne sont modifiables que par l’administration et la finance', () => {
    expect(MATRICE['produits.prix']).toEqual(['admin', 'finance']);
    expect(MATRICE['commandes.couts']).toEqual(['admin', 'finance']);
    expect(MATRICE['devis.valider_prix']).toEqual(['admin', 'finance']);
    expect(peut('commercial', 'marges.voir')).toBe(false);
  });

  it('chaque rôle staff peut au moins ouvrir le tableau de bord', () => {
    for (const role of ROLES_STAFF) {
      expect(permissionsDu(role)).toContain('tableau_de_bord.voir');
    }
  });

  it('la matrice ne référence que des rôles staff existants', () => {
    for (const roles of Object.values(MATRICE)) {
      for (const role of roles) expect(ROLES_STAFF).toContain(role);
    }
  });
});

describe('cycle des commandes côté back-office', () => {
  it('reflète exactement transition_commande_autorisee (migration 0003)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261109130003_fonctions_index.sql'), 'utf8');
    const corps = sql.slice(sql.indexOf('function public.transition_commande_autorisee'), sql.indexOf('create or replace function public.verifier_transition_commande'));
    const depuisSql: Record<string, string[]> = {};
    for (const m of corps.matchAll(/when ancien = '([A-Z_]+)'\s+and nouveau in \(([^)]*)\)/g)) {
      depuisSql[m[1]] = [...m[2].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
    }
    for (const s of STATUTS_COMMANDE) {
      expect([...TRANSITIONS_COMMANDE[s.id]].sort(), s.id).toEqual(depuisSql[s.id] ?? []);
    }
  });

  it('« Payée » n’est jamais posé à la main, quel que soit le rôle', () => {
    for (const role of ROLES_STAFF) expect(STATUTS_PAR_ROLE[role]).not.toContain('PAYEE');
    for (const role of ROLES_STAFF) expect(transitionsPossibles('EN_ATTENTE_DE_PAIEMENT', role)).not.toContain('PAYEE');
  });

  it('l’atelier fait avancer la fabrication mais n’annule pas une commande', () => {
    expect(transitionPermise('PAYEE', 'A_PRODUIRE', 'atelier')).toBe(true);
    expect(transitionPermise('A_PRODUIRE', 'EN_PRODUCTION', 'atelier')).toBe(true);
    expect(transitionPermise('CONTROLE_QUALITE', 'PRETE', 'atelier')).toBe(true);
    expect(transitionPermise('BROUILLON', 'ANNULEE', 'atelier')).toBe(false);
    expect(transitionPermise('PAYEE', 'REMBOURSEMENT_A_TRAITER', 'atelier')).toBe(false);
  });

  it('la finance traite les remboursements, pas la production', () => {
    expect(transitionPermise('LIVREE', 'REMBOURSEMENT_A_TRAITER', 'finance')).toBe(true);
    expect(transitionPermise('A_PRODUIRE', 'EN_PRODUCTION', 'finance')).toBe(false);
  });

  it('aucune transition hors du cycle, même pour l’administrateur', () => {
    const tous = STATUTS_COMMANDE.map((s) => s.id);
    for (const de of tous) {
      for (const vers of tous) {
        if (transitionPermise(de, vers as StatutCommande, 'admin')) {
          expect(TRANSITIONS_COMMANDE[de]).toContain(vers);
        }
      }
    }
    expect(transitionPermise('ANNULEE', 'A_PRODUIRE', 'admin')).toBe(false);
    expect(transitionPermise('BROUILLON', 'LIVREE', 'admin')).toBe(false);
  });
});

/**
 * Elembo Partners — règles pures et alignement avec la migration 0012.
 *
 * La base est l'arbitre (contraintes, triggers, RLS) ; ces tests garantissent que le portail et
 * le back-office appliquent les mêmes règles, pour afficher l'erreur avant l'envoi plutôt que de
 * laisser la base la renvoyer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CATEGORIES_SERVICE,
  ETATS_MACHINE,
  FAMILLES,
  FICHIER_TAILLE_MAX,
  FICHIER_TYPES_MIME,
  FINITIONS_PRODUCTION,
  FORMAT_CODE,
  MODES_CALCUL,
  NATURES_TARIF,
  PRESTATIONS,
  STATUTS_DISPONIBILITE,
  TYPES_FICHIER,
  TYPES_MACHINE,
  UNITES_CAPACITE,
  UNITES_VITESSE,
  machineProductive,
  prestationDeFamille,
} from '../src/lib/partenaires/catalogue';
import { DROITS, ROLES_PARTENAIRE, droitsDu, peutPartenaire, type DroitPartenaire } from '../src/lib/partenaires/droits';
import { prixPourQuantite, verifierPaliers, type Palier } from '../src/lib/partenaires/paliers';
import {
  STATUTS_PARTENAIRE,
  STATUTS_TARIF,
  STATUTS_VALIDATION,
  TRANSITIONS_PARTENAIRE,
  TRANSITIONS_TARIF,
  accesPortail,
  decisionsPossibles,
  partenaireAffectable,
  soumissionPossible,
  tarifModifiable,
} from '../src/lib/partenaires/statuts';
import { SUPPORTS } from '../src/lib/grand-format/catalogue';

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261116120000_elembo_partners.sql'), 'utf8');

/** Valeurs de la contrainte `check (<colonne> in (...))` de la table donnée. */
function valeursCheck(table: string, colonne: string): string[] {
  const debut = SQL.indexOf(`create table if not exists public.${table} (`);
  const corps = debut >= 0 ? SQL.slice(debut, SQL.indexOf('\n);', debut)) : SQL;
  const m = corps.match(new RegExp(`check \\((?:${colonne} is null or )?${colonne} in \\(([^)]*)\\)`));
  if (!m) throw new Error(`Contrainte ${table}.${colonne} introuvable`);
  return [...m[1].matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]).sort();
}

/** Paires (ancien, nouveau) d'une fonction `transition_*_autorisee`. */
function transitionsSql(fonction: string): Record<string, string[]> {
  const debut = SQL.indexOf(`function public.${fonction}`);
  const corps = SQL.slice(debut, SQL.indexOf('$$;', debut));
  const res: Record<string, string[]> = {};
  for (const m of corps.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)) (res[m[1]] ??= []).push(m[2]);
  for (const k of Object.keys(res)) res[k].sort();
  return res;
}

const ids = (liste: { id: string }[]) => liste.map((o) => o.id).sort();

describe('catalogue aligné sur les contraintes SQL', () => {
  it('familles, unités, états, catégories, modes et natures', () => {
    expect(ids(FAMILLES)).toEqual(valeursCheck('partenaire_machines', 'famille'));
    expect(ids(FAMILLES)).toEqual(valeursCheck('partenaire_capacites', 'categorie'));
    expect(ids(ETATS_MACHINE)).toEqual(valeursCheck('partenaire_machines', 'etat'));
    expect(ids(UNITES_VITESSE)).toEqual(valeursCheck('partenaire_machines', 'unite_vitesse'));
    expect(ids(UNITES_CAPACITE)).toEqual(valeursCheck('partenaire_capacites', 'unite_capacite'));
    expect(ids(CATEGORIES_SERVICE)).toEqual(valeursCheck('partenaire_services', 'categorie'));
    expect(ids(MODES_CALCUL)).toEqual(valeursCheck('partenaire_tarifs', 'mode_calcul'));
    expect(ids(NATURES_TARIF)).toEqual(valeursCheck('partenaire_tarifs', 'nature'));
    expect(ids(STATUTS_DISPONIBILITE)).toEqual(valeursCheck('partenaire_disponibilites', 'statut'));
    expect(ids(TYPES_FICHIER)).toEqual(valeursCheck('partenaire_fichiers', 'type_fichier'));
    expect(ids(STATUTS_VALIDATION)).toEqual(valeursCheck('partenaire_capacites', 'statut_validation'));
    expect(ids(STATUTS_TARIF)).toEqual(valeursCheck('partenaire_tarifs', 'statut'));
    expect(ids(ROLES_PARTENAIRE)).toEqual(valeursCheck('partenaire_utilisateurs', 'role_partenaire'));
  });

  it('statuts de l’entreprise', () => {
    const m = SQL.match(/add column if not exists statut text[^]*?check \(statut in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    expect(ids(STATUTS_PARTENAIRE)).toEqual([...m![1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort());
  });

  it('fichiers : types MIME et taille identiques au bucket et à la table', () => {
    expect([...FICHIER_TYPES_MIME].sort()).toEqual(
      ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    );
    expect(SQL).toContain(`taille_octets between 1 and ${FICHIER_TAILLE_MAX}`);
    expect(SQL).toMatch(new RegExp(`'partenaires', 'partenaires', false, ${FICHIER_TAILLE_MAX}`));
  });

  it('tous les codes libres respectent le format imposé en base', () => {
    const codes = [
      ...Object.values(TYPES_MACHINE).flat(),
      ...Object.values(PRESTATIONS).flat(),
      ...FINITIONS_PRODUCTION,
    ].map((o) => o.id);
    for (const code of codes) expect(code, code).toMatch(FORMAT_CODE);
    // Pas de doublon d'identifiant au sein d'une famille.
    for (const f of FAMILLES) {
      expect(new Set(ids(PRESTATIONS[f.id])).size).toBe(PRESTATIONS[f.id].length);
      expect(new Set(ids(TYPES_MACHINE[f.id])).size).toBe(TYPES_MACHINE[f.id].length);
    }
  });

  it('chaque support grand format vendu sur Elembo a sa prestation partenaire', () => {
    for (const s of SUPPORTS.filter((s) => s.id !== 'AUTRE')) {
      expect(prestationDeFamille('GRAND_FORMAT', s.id), s.id).toBe(true);
    }
  });

  it('seule une machine opérationnelle compte dans la capacité', () => {
    expect(ETATS_MACHINE.filter((e) => machineProductive(e.id)).map((e) => e.id)).toEqual(['OPERATIONNELLE']);
  });
});

describe('cycle de l’entreprise partenaire', () => {
  it('reflète exactement transition_partenaire_autorisee (migration 0012)', () => {
    const sql = transitionsSql('transition_partenaire_autorisee');
    for (const s of STATUTS_PARTENAIRE) {
      expect([...TRANSITIONS_PARTENAIRE[s.id]].sort(), s.id).toEqual(sql[s.id] ?? []);
    }
  });

  it('seule une entreprise validée et active est affectable', () => {
    for (const s of STATUTS_PARTENAIRE) {
      expect(partenaireAffectable({ statut: s.id, actif: true }), s.id).toBe(s.id === 'VALIDE');
      expect(partenaireAffectable({ statut: s.id, actif: false }), s.id).toBe(false);
    }
  });

  it('la soumission revient au partenaire, les décisions au staff', () => {
    expect(STATUTS_PARTENAIRE.filter((s) => soumissionPossible(s.id)).map((s) => s.id)).toEqual(['BROUILLON', 'REFUSE']);
    for (const s of STATUTS_PARTENAIRE) expect(decisionsPossibles(s.id)).not.toContain('EN_ATTENTE_VALIDATION');
    expect(decisionsPossibles('EN_ATTENTE_VALIDATION').sort()).toEqual(['ARCHIVE', 'BROUILLON', 'REFUSE', 'VALIDE']);
  });

  it('une entreprise suspendue ou archivée perd tout accès au portail', () => {
    expect(accesPortail('SUSPENDU')).toBe('aucun');
    expect(accesPortail('ARCHIVE')).toBe('aucun');
    expect(accesPortail('VALIDE')).toBe('complet');
    for (const s of ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'REFUSE'] as const) expect(accesPortail(s)).toBe('dossier');
  });
});

describe('cycle d’un tarif', () => {
  it('reflète exactement transition_tarif_autorisee (migration 0012)', () => {
    const sql = transitionsSql('transition_tarif_autorisee');
    for (const s of STATUTS_TARIF) {
      expect([...TRANSITIONS_TARIF[s.id]].sort(), s.id).toEqual(sql[s.id] ?? []);
    }
  });

  it('un tarif décidé n’est plus modifiable, et rien ne revient à VALIDE sans passer par PROPOSE', () => {
    expect(STATUTS_TARIF.filter((s) => tarifModifiable(s.id)).map((s) => s.id)).toEqual(['PROPOSE', 'MODIFICATION_DEMANDEE']);
    for (const s of STATUTS_TARIF) {
      if (s.id !== 'PROPOSE') expect(TRANSITIONS_TARIF[s.id], s.id).not.toContain('VALIDE');
    }
  });
});

describe('droits du portail', () => {
  it('les tarifs négociés ne sont visibles que du responsable (comme la RLS)', () => {
    for (const r of ROLES_PARTENAIRE) {
      expect(peutPartenaire(r.id, 'tarifs.voir', 'VALIDE'), r.id).toBe(r.id === 'RESPONSABLE');
    }
    expect(SQL).toMatch(/partenaire_id = public\.partenaire_session\(\) and public\.role_partenaire_session\(\) = 'RESPONSABLE'/);
  });

  it('le rôle lecture ne modifie rien', () => {
    const ecritures = droitsDu('LECTURE', 'VALIDE').filter((d) => !d.endsWith('.voir'));
    expect(ecritures).toEqual([]);
  });

  it('un opérateur déclare pannes et disponibilités mais pas les valeurs techniques', () => {
    expect(peutPartenaire('PRODUCTION', 'machines.etat', 'VALIDE')).toBe(true);
    expect(peutPartenaire('PRODUCTION', 'disponibilites.declarer', 'VALIDE')).toBe(true);
    for (const d of ['machines.modifier', 'capacites.modifier', 'tarifs.proposer', 'utilisateurs.gerer', 'validation.soumettre'] as DroitPartenaire[]) {
      expect(peutPartenaire('PRODUCTION', d, 'VALIDE'), d).toBe(false);
    }
  });

  it('aucun droit sans rôle, ni pour une entreprise suspendue ou archivée', () => {
    for (const d of Object.keys(DROITS) as DroitPartenaire[]) {
      expect(peutPartenaire(null, d, 'VALIDE')).toBe(false);
      expect(peutPartenaire('RESPONSABLE', d, 'SUSPENDU')).toBe(false);
      expect(peutPartenaire('RESPONSABLE', d, 'ARCHIVE')).toBe(false);
    }
  });

  it('un dossier en cours de constitution reste complétable par son responsable', () => {
    for (const s of ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'REFUSE'] as const) {
      expect(peutPartenaire('RESPONSABLE', 'machines.modifier', s), s).toBe(true);
      expect(peutPartenaire('RESPONSABLE', 'tarifs.proposer', s), s).toBe(true);
    }
  });
});

describe('paliers de quantité', () => {
  const p = (quantiteMin: number, quantiteMax: number | null, prixUnitaireFcfa: number | null): Palier => ({
    quantiteMin,
    quantiteMax,
    prixUnitaireFcfa,
  });
  const grilleCdc = [p(1, 5, 2500), p(6, 20, 2200), p(21, 50, 2000), p(51, null, null)];

  it('accepte la grille du cahier des charges (§8.4), dans le désordre', () => {
    expect(verifierPaliers(null, [...grilleCdc].reverse())).toBeNull();
  });

  it('refuse un trou, un chevauchement, un palier ouvert au milieu', () => {
    expect(verifierPaliers(null, [p(1, 5, 1), p(7, null, 1)])).toMatch(/sans trou/);
    expect(verifierPaliers(null, [p(1, 5, 1), p(5, null, 1)])).toMatch(/sans trou/);
    expect(verifierPaliers(null, [p(1, null, 1), p(6, 10, 1)])).toMatch(/dernier palier/);
  });

  it('refuse un tarif sans prix ni palier, des valeurs invalides et plus de vingt paliers', () => {
    expect(verifierPaliers(null, [])).toMatch(/prix ou au moins un palier/);
    expect(verifierPaliers(2500, [])).toBeNull();
    expect(verifierPaliers(-1, [])).toMatch(/Prix de base/);
    expect(verifierPaliers(null, [p(0, 5, 1)])).toMatch(/minimale/);
    expect(verifierPaliers(null, [p(5, 2, 1)])).toMatch(/maximale/);
    expect(verifierPaliers(null, [p(1, 2, 1.5)])).toMatch(/Prix invalide/);
    const vingtEtUn = Array.from({ length: 21 }, (_, i) => p(i + 1, i + 1, 100));
    expect(verifierPaliers(null, vingtEtUn)).toMatch(/Vingt/);
  });

  it('donne le prix unitaire applicable à une quantité', () => {
    expect(prixPourQuantite(null, grilleCdc, 3)).toEqual({ type: 'PRIX', prixUnitaireFcfa: 2500, source: 'PALIER' });
    expect(prixPourQuantite(null, grilleCdc, 20)).toEqual({ type: 'PRIX', prixUnitaireFcfa: 2200, source: 'PALIER' });
    expect(prixPourQuantite(null, grilleCdc, 51)).toEqual({ type: 'NEGOCIATION' });
    expect(prixPourQuantite(null, [p(10, null, 900)], 4)).toEqual({ type: 'SOUS_MINIMUM', quantiteMin: 10 });
    expect(prixPourQuantite(1800, [p(1, 5, 2500)], 12)).toEqual({ type: 'PRIX', prixUnitaireFcfa: 1800, source: 'BASE' });
    expect(prixPourQuantite(1800, [], 0)).toEqual({ type: 'HORS_GRILLE' });
  });

  it('applique la même règle que erreur_paliers_tarif (SQL)', () => {
    const corps = SQL.slice(SQL.indexOf('function public.erreur_paliers_tarif'), SQL.indexOf('$$;', SQL.indexOf('function public.erreur_paliers_tarif')));
    expect(corps).toContain('Seul le dernier palier peut être sans quantité maximale');
    expect(corps).toContain('Les paliers doivent se suivre sans trou ni chevauchement');
    expect(corps).toContain('Indiquez un prix ou au moins un palier');
    expect(corps).toContain('v_nb > 20');
  });
});

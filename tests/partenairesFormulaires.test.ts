/**
 * Dossier partenaire (sous-lot 1.3) — lecteurs de formulaires et garanties structurelles des
 * actions et des écritures.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DROITS } from '../src/lib/partenaires/droits';
import {
  disponibiliteCourante,
  lireCapacite,
  lireDisponibilite,
  lireEntreprise,
  lireEtatMachine,
  lireMachine,
  lireService,
  liste,
  mmEnMetres,
} from '../src/lib/partenaires/formulaires';

function f(champs: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
}

const MAINTENANT = new Date('2026-11-17T10:00:00Z');

describe('entreprise', () => {
  const base = { nom: 'Imprimerie du Plateau', specialite: 'Grand format', telephone: '06 123 45 67' };

  it('liste blanche : seules les colonnes autorisées, valeurs vides → null', () => {
    const r = lireEntreprise(f({ ...base, statut: 'VALIDE', partenaire_id: 'x', notes: 'pirate', ville: '  Brazzaville ' }), MAINTENANT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur).not.toHaveProperty('statut');
    expect(r.valeur).not.toHaveProperty('notes');
    expect(r.valeur).not.toHaveProperty('partenaire_id');
    expect(r.valeur.ville).toBe('Brazzaville');
    expect(r.valeur.raison_sociale).toBeNull();
  });

  it('refuse un téléphone, un site, une année ou un délai invalides', () => {
    expect(lireEntreprise(f({ ...base, telephone: 'abc' }), MAINTENANT).ok).toBe(false);
    expect(lireEntreprise(f({ ...base, site_web: 'javascript:alert(1)' }), MAINTENANT).ok).toBe(false);
    expect(lireEntreprise(f({ ...base, annee_creation: '2030' }), MAINTENANT).ok).toBe(false);
    expect(lireEntreprise(f({ ...base, delai_jours: '-3' }), MAINTENANT).ok).toBe(false);
    expect(lireEntreprise(f({ ...base, site_web: 'https://plateau.cg' }), MAINTENANT).ok).toBe(true);
  });
});

describe('machines', () => {
  const base = { type: 'GRAND_FORMAT:ECO_SOLVANT', nom: 'Traceur 3,20 m', quantite: '1', etat: 'OPERATIONNELLE' };

  it('dimensions saisies en mètres « à la française » → millimètres', () => {
    const r = lireMachine(f({ ...base, largeur_max_m: '3,20', longueur_max_m: '50' }), MAINTENANT);
    expect(r.ok && r.valeur.largeur_max_mm).toBe(3200);
    expect(r.ok && r.valeur.longueur_max_mm).toBe(50000);
    expect(r.ok && r.valeur.famille).toBe('GRAND_FORMAT');
    expect(r.ok && r.valeur.type_machine).toBe('ECO_SOLVANT');
    expect(mmEnMetres(3200)).toBe('3,2');
  });

  it('refuse un type hors catalogue ou mal rattaché à sa famille', () => {
    expect(lireMachine(f({ ...base, type: 'TEXTILE:ECO_SOLVANT' }), MAINTENANT).ok).toBe(false);
    expect(lireMachine(f({ ...base, type: 'PIRATE:X' }), MAINTENANT).ok).toBe(false);
  });

  it('refuse des valeurs absurdes, exige l’unité d’une vitesse', () => {
    expect(lireMachine(f({ ...base, largeur_max_m: '-1' }), MAINTENANT).ok).toBe(false);
    expect(lireMachine(f({ ...base, largeur_max_m: '3,2,1' }), MAINTENANT).ok).toBe(false);
    expect(lireMachine(f({ ...base, quantite: '0' }), MAINTENANT).ok).toBe(false);
    expect(lireMachine(f({ ...base, vitesse: '25' }), MAINTENANT).ok).toBe(false);
    expect(lireMachine(f({ ...base, vitesse: '25', unite_vitesse: 'M2_HEURE' }), MAINTENANT).ok).toBe(true);
  });

  it('l’état seul (opérateur) ne contient aucune valeur technique', () => {
    const r = lireEtatMachine(f({ etat: 'EN_PANNE', largeur_max_m: '9', derniere_maintenance_le: '2026-11-01' }));
    expect(r).toEqual({ ok: true, valeur: { etat: 'EN_PANNE', derniere_maintenance_le: '2026-11-01', prochaine_maintenance_le: null } });
    expect(lireEtatMachine(f({ etat: 'EN_PANNE', derniere_maintenance_le: '2026-02-30' })).ok).toBe(false);
  });

  it('les listes libres sont nettoyées et sans doublon', () => {
    expect(liste(f({ x: ' bâche, Bâche ;vinyle\npapier,, ' }), 'x')).toEqual(['bâche', 'vinyle', 'papier']);
  });
});

describe('capacités', () => {
  const base = { prestation: 'GRAND_FORMAT:BANDEROLE', unite_capacite: 'M2' };

  it('nom par défaut, finitions limitées au catalogue, machines filtrées', () => {
    const r = lireCapacite(
      f({
        ...base,
        capacite_journaliere: '60',
        finitions: ['OEILLETS', 'OURLETS', 'PIRATE'],
        machines: ['00000000-0000-4000-a000-000000000001', 'pas-un-uuid'],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.champs.nom).toBe('Banderoles');
    expect(r.valeur.champs.categorie).toBe('GRAND_FORMAT');
    expect(r.valeur.champs.finitions).toEqual(['OEILLETS', 'OURLETS']);
    expect(r.valeur.machines).toEqual(['00000000-0000-4000-a000-000000000001']);
  });

  it('refuse des bornes inversées et un délai express plus long', () => {
    expect(lireCapacite(f({ ...base, largeur_min_m: '3', largeur_max_m: '1' })).ok).toBe(false);
    expect(lireCapacite(f({ ...base, delai_jours: '2', delai_express_jours: '5' })).ok).toBe(false);
    expect(lireCapacite(f({ ...base, unite_capacite: 'TONNES' })).ok).toBe(false);
    expect(lireCapacite(f({ ...base, capacite_journaliere: '0' })).ok).toBe(false);
  });
});

describe('services', () => {
  it('la sous-traitance déclarée exige une précision', () => {
    expect(lireService(f({ categorie: 'INSTALLATION', nom: 'Pose', realise_par_tiers: 'oui' })).ok).toBe(false);
    const r = lireService(f({ categorie: 'INSTALLATION', nom: 'Pose', realise_par_tiers: 'oui', tiers_precision: 'Poseur partenaire à Bacongo' }));
    expect(r.ok && r.valeur.realise_par_tiers).toBe(true);
    const sans = lireService(f({ categorie: 'INSTALLATION', nom: 'Pose', tiers_precision: 'ignoré' }));
    expect(sans.ok && sans.valeur.tiers_precision).toBeNull();
  });
});

describe('disponibilités', () => {
  it('début par défaut à aujourd’hui, fin postérieure', () => {
    expect(lireDisponibilite(f({ statut: 'SATURE' }), '2026-11-17')).toMatchObject({ ok: true, valeur: { debut_periode: '2026-11-17', fin_periode: null } });
    expect(lireDisponibilite(f({ statut: 'SATURE', fin_periode: '2026-11-10' }), '2026-11-17').ok).toBe(false);
    expect(lireDisponibilite(f({ statut: 'PIRATE' }), '2026-11-17').ok).toBe(false);
  });

  it('la déclaration en vigueur est la plus récente qui couvre la date', () => {
    const d = (debut: string, fin: string | null, cree: string, statut: string) => ({ debut_periode: debut, fin_periode: fin, cree_le: cree, statut });
    const declarations = [
      d('2026-11-01', null, '2026-11-01T08:00:00Z', 'DISPONIBLE'),
      d('2026-11-15', '2026-11-20', '2026-11-14T08:00:00Z', 'SATURE'),
      d('2026-11-15', '2026-11-20', '2026-11-16T08:00:00Z', 'MAINTENANCE'),
      d('2026-12-01', null, '2026-11-16T09:00:00Z', 'INDISPONIBLE'),
    ];
    expect(disponibiliteCourante(declarations, '2026-11-17')?.statut).toBe('MAINTENANCE');
    expect(disponibiliteCourante(declarations, '2026-11-25')?.statut).toBe('DISPONIBLE');
    expect(disponibiliteCourante([], '2026-11-17')).toBeNull();
  });
});

/* ------------------------------------------------- garanties structurelles -- */

const ACTIONS = readFileSync(join(process.cwd(), 'src/app/partenaire/dossier-actions.ts'), 'utf8');
const ECRITURE = readFileSync(join(process.cwd(), 'src/server/partenaires/ecriture.ts'), 'utf8');

describe('actions et écritures du dossier', () => {
  it('chaque action exige d’abord un droit du portail qui existe', () => {
    expect(ACTIONS.trimStart().startsWith("'use server'")).toBe(true);
    const exportees = [...ACTIONS.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
    expect(exportees.length).toBeGreaterThanOrEqual(9);
    for (const [, nom, premiere] of exportees) {
      const m = premiere.match(/await exigerPartenaire\('([a-z_.]+)'\)/);
      expect(m, nom).not.toBeNull();
      expect(Object.keys(DROITS), nom).toContain(m![1]);
    }
  });

  it('aucune action ne lit l’entreprise dans le formulaire', () => {
    expect(ACTIONS).not.toMatch(/formData\.get\(['"]partenaire/);
  });

  it('les écritures prennent l’entreprise dans la session et filtrent chaque objet existant par elle', () => {
    expect(ECRITURE).not.toMatch(/\bpartenaire_id:\s+(?!session\.partenaireId\b)\S/);
    expect(ECRITURE.match(/\bpartenaire_id: session\.partenaireId/g)?.length).toBeGreaterThanOrEqual(4);
    for (const table of ['partenaire_machines', 'partenaire_capacites', 'partenaire_services']) {
      const blocs = ECRITURE.split(`.from('${table}')`).slice(1);
      for (const bloc of blocs) {
        const requete = bloc.slice(0, bloc.indexOf(';'));
        if (/\.(update|select)\(/.test(requete) && /\.eq\('id'/.test(requete)) {
          expect(requete, table).toMatch(/\.eq\('partenaire_id', session\.partenaireId\)/);
        }
      }
    }
  });

  it('les écritures ne touchent jamais aux champs de validation', () => {
    expect(ECRITURE).not.toMatch(/statut_validation|valide_par|valide_le|motif_refus/);
  });
});

/**
 * Back-office Elembo Partners (sous-lot 1.5) — coût d'impression à partir des tarifs validés,
 * profil grand format, permissions et garanties structurelles.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MATRICE, peut } from '../src/lib/admin/permissions';
import { coutImpression, enVigueur, profilGrandFormat, tarifImpression, type TarifImpression } from '../src/lib/partenaires/coutGrandFormat';
import { texteRecherche } from '../src/server/admin/partenaires';

const t = (id: string, prestation: string | null, prix: number | null, extra: Partial<TarifImpression> = {}): TarifImpression => ({
  id,
  nom: id,
  mode_calcul: 'AU_M2',
  prix_fcfa: prix,
  conditions: null,
  prestation,
  valide_du: '2026-01-01',
  valide_jusquau: null,
  paliers: [],
  ...extra,
});

describe('tarif d’impression retenu pour une banderole', () => {
  const aujourdhui = '2026-11-19';

  it('le tarif du même support l’emporte sur le tarif général ; un autre support est ignoré', () => {
    const tarifs = [t('general', null, 3000), t('bache', 'BACHE', 2000), t('banderole', 'BANDEROLE', 2500)];
    expect(tarifImpression(tarifs, 'BANDEROLE', aujourdhui)?.id).toBe('banderole');
    expect(tarifImpression(tarifs, 'ROLL_UP', aujourdhui)?.id).toBe('general');
    expect(tarifImpression([t('bache', 'BACHE', 2000)], 'BANDEROLE', aujourdhui)).toBeNull();
  });

  it('seuls les tarifs au m² en vigueur comptent', () => {
    expect(tarifImpression([t('piece', 'BANDEROLE', 100, { mode_calcul: 'A_LA_PIECE' })], 'BANDEROLE', aujourdhui)).toBeNull();
    expect(tarifImpression([t('futur', 'BANDEROLE', 100, { valide_du: '2026-12-01' })], 'BANDEROLE', aujourdhui)).toBeNull();
    expect(tarifImpression([t('expire', 'BANDEROLE', 100, { valide_jusquau: '2026-11-18' })], 'BANDEROLE', aujourdhui)).toBeNull();
    expect(enVigueur({ valide_du: null, valide_jusquau: '2026-11-19' }, aujourdhui)).toBe(true);
  });
});

describe('coût d’impression', () => {
  it('tarif validé : prix × surface, arrondi à la centaine supérieure', () => {
    expect(coutImpression(t('x', 'BANDEROLE', 2500), 6.3, 9999)).toEqual({ type: 'MONTANT', montantFcfa: 15800, prixUnitaireFcfa: 2500, source: 'TARIF_VALIDE' });
  });

  it('les paliers s’appliquent à la surface arrondie au m² supérieur', () => {
    const paliers = [
      { quantiteMin: 1, quantiteMax: 10, prixUnitaireFcfa: 2500 },
      { quantiteMin: 11, quantiteMax: null, prixUnitaireFcfa: 2000 },
    ];
    const cout = coutImpression(t('x', 'BANDEROLE', null, { paliers }), 10.5, null);
    expect(cout).toEqual({ type: 'MONTANT', montantFcfa: 21000, prixUnitaireFcfa: 2000, source: 'TARIF_VALIDE' });
  });

  it('palier « sur négociation » : pas de montant inventé', () => {
    const paliers = [{ quantiteMin: 1, quantiteMax: null, prixUnitaireFcfa: null }];
    expect(coutImpression(t('x', 'BANDEROLE', null, { paliers }), 4, 2000)).toEqual({ type: 'NEGOCIATION' });
  });

  it('sans tarif validé : ancien prix, signalé comme tel ; sinon rien', () => {
    expect(coutImpression(null, 3, 2000)).toMatchObject({ type: 'MONTANT', source: 'ANCIEN_PRIX', montantFcfa: 6000 });
    expect(coutImpression(null, 3, null)).toEqual({ type: 'INDISPONIBLE' });
    expect(coutImpression(t('x', 'BANDEROLE', 2500), 0, null)).toEqual({ type: 'INDISPONIBLE' });
  });
});

describe('profil grand format d’un imprimeur', () => {
  const ancien = { types_impression: ['BANDEROLE'], largeur_max_m: 1.6, longueur_max_m: null };

  it('déduit des capacités validées ; sans capacité, l’ancienne fiche reste', () => {
    expect(
      profilGrandFormat(
        [
          { prestation: 'BANDEROLE', largeur_max_mm: 3200, longueur_max_mm: 50000 },
          { prestation: 'BACHE', largeur_max_mm: 5000, longueur_max_mm: null },
          { prestation: 'VINYLE_ADHESIF', largeur_max_mm: 1370, longueur_max_mm: null },
        ],
        ['BANDEROLE', 'BACHE', 'ROLL_UP'],
        ancien,
      ),
    ).toEqual({ types_impression: ['BANDEROLE', 'BACHE'], largeur_max_m: 5, longueur_max_m: 50 });
    expect(profilGrandFormat([], ['BANDEROLE'], ancien)).toBe(ancien);
  });
});

describe('droits du back-office Partenaires', () => {
  it('lecture pour tout le personnel, décisions et gestion pour l’administration (P9)', () => {
    for (const r of ['admin', 'commercial', 'atelier', 'finance'] as const) expect(peut(r, 'partenaires.voir'), r).toBe(true);
    for (const p of ['partenaires.gerer', 'partenaires.valider', 'partenaires.suspendre'] as const) {
      expect(MATRICE[p], p).toEqual(['admin']);
    }
  });

  it('tarifs négociés : administration et finance uniquement (P3)', () => {
    for (const p of ['partenaires.tarifs_voir', 'partenaires.tarifs_saisir', 'partenaires.tarifs_valider'] as const) {
      expect(MATRICE[p], p).toEqual(['admin', 'finance']);
    }
    expect(peut('atelier', 'partenaires.tarifs_voir')).toBe(false);
    expect(peut('commercial', 'partenaires.tarifs_voir')).toBe(false);
  });

  it('recherche : la syntaxe PostgREST est neutralisée', () => {
    expect(texteRecherche('a,nom.eq.x)*%')).toBe('a nom.eq.x');
    expect(texteRecherche('  Poto-Poto  ')).toBe('Poto-Poto');
  });
});

/* ------------------------------------------------- garanties structurelles -- */

const lire = (chemin: string) => readFileSync(join(process.cwd(), chemin), 'utf8');

describe('affectation et notifications', () => {
  it('un partenaire non validé ne reçoit aucun travail, quel que soit le chemin d’écriture', () => {
    const production = lire('src/server/admin/production.ts');
    expect(production).toMatch(/data\.statut !== 'VALIDE' \|\| !data\.actif/);
    // Depuis le Lot 2, une tâche naît interne : l'atelier n'est posé qu'à l'acceptation
    // d'une affectation (trigger 0013), plus jamais par le formulaire de tâche.
    expect(production).toMatch(/partenaire_id: null/);
    expect(production).not.toMatch(/export async function creerTache[^]*?partenaire_id: champs\.partenaire_id/);
    const affectations = lire('src/server/admin/affectations.ts');
    expect(affectations).toMatch(/await verifierAffectation\(champs\.partenaireId, null\)/);
    const banderoles = lire('src/app/admin/(protected)/banderoles/actions.ts');
    expect(banderoles).not.toMatch(/verifierAffectation|partenaire_id: p/);
  });

  it('les e-mails aux ateliers ne contiennent jamais de montant, et ne vont qu’aux responsables actifs', () => {
    const serveur = lire('src/server/admin/partenaires.ts');
    const bloc = serveur.slice(serveur.indexOf('export async function notifierPartenaire'), serveur.indexOf('/* ---------------------------------------------------------------- décisions'));
    expect(bloc).toMatch(/\.eq\('role_partenaire', 'RESPONSABLE'\)/);
    expect(bloc).toMatch(/\.eq\('actif', true\)/);
    const messages = serveur.slice(serveur.indexOf('const MESSAGES_DECISION'), serveur.indexOf('export async function deciderPartenaireAdmin'));
    expect(messages).not.toMatch(/fcfa|prix|tarif/i);
  });

  it('un refus d’élément exige un motif ; une suspension exige la permission dédiée', () => {
    expect(lire('src/server/admin/partenaires.ts')).toMatch(/decision === 'REFUSEE' && !texte\) throw new ErreurMetier/);
    const actions = lire('src/app/admin/(protected)/partenaires/actions.ts');
    expect(actions).toMatch(/if \(suspension && !peut\(staff\.role, 'partenaires\.suspendre'\)\)/);
  });

  it('l’ancienne page Prestataires redirige et n’écrit plus l’ancien prix', () => {
    expect(lire('src/app/admin/(protected)/production/prestataires/page.tsx')).toMatch(/redirect\('\/admin\/partenaires'\)/);
    expect(lire('src/app/admin/(protected)/production/actions.ts')).not.toMatch(/tarif_prix_m2_fcfa|creerPartenaire/);
  });
});

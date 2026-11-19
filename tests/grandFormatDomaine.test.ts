import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DELAIS, FINITIONS, PRESTATIONS, SUPPORTS, USAGES, formatDimensions, surfaceM2 } from '../src/lib/grand-format/catalogue';
import {
  ETATS,
  coutsDepuisTaches,
  etatGrandFormat,
  genererProposition,
  postesAttendus,
  prixVente,
  rentabilite,
  totalCouts,
} from '../src/lib/grand-format/suivi';
import { STATUTS_COMMANDE, STATUTS_DEVIS } from '../src/lib/admin/statuts';
import {
  besoinDepuisParametres,
  lireMetres,
  specificationsLisibles,
  validerDemandeGrandFormat,
  validerParametres,
  validerParametresEstimation,
} from '../src/lib/grand-format/validation';

const MIGRATION = readFileSync(join(process.cwd(), 'supabase/migrations/20261113120000_grand_format.sql'), 'utf8');

function valeursCheck(colonne: string): string[] {
  const m = MIGRATION.match(new RegExp(`check \\(${colonne} in \\(([^)]*)\\)\\)`));
  if (!m) throw new Error(`CHECK introuvable pour ${colonne}`);
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
}

describe('catalogue grand format ↔ contraintes SQL', () => {
  it('les identifiants du catalogue sont exactement ceux autorisés par la base', () => {
    expect(USAGES.map((u) => u.id).sort()).toEqual(valeursCheck('usage'));
    expect(FINITIONS.map((f) => f.id).sort()).toEqual(valeursCheck('finition'));
    expect(DELAIS.map((d) => d.id).sort()).toEqual(valeursCheck('delai'));
    expect(PRESTATIONS.map((p) => p.id).sort()).toEqual(valeursCheck('prestation'));
    // La grille de vente n'existe pas pour « AUTRE » (toujours sur devis).
    const supports = [...MIGRATION.matchAll(/check \(support in \(([^)]*)\)\)/g)].map((m) =>
      [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort(),
    );
    expect(supports).toContainEqual(SUPPORTS.map((s) => s.id).sort());
    expect(supports).toContainEqual(SUPPORTS.filter((s) => s.id !== 'AUTRE').map((s) => s.id).sort());
  });

  it('les slugs des catégories sont uniques et sûrs pour une URL', () => {
    const slugs = USAGES.map((u) => u.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z-]+$/);
  });

  it('la migration ne contient aucun prix et la grille démarre en TEST', () => {
    expect(MIGRATION).toMatch(/statut_prix public\.statut_prix not null default 'TEST'/);
    expect(MIGRATION).toMatch(/insert into public\.tarifs_grand_format \(support, libelle\) values/);
    expect(MIGRATION).toMatch(/tarifs_grand_format_valide_check/);
  });

  it('les nouvelles tables sont fermées au public (RLS + révocation)', () => {
    expect(MIGRATION).toMatch(/alter table public\.tarifs_grand_format enable row level security/);
    expect(MIGRATION).toMatch(/alter table public\.demandes_grand_format enable row level security/);
    expect(MIGRATION).toMatch(/revoke all on public\.tarifs_grand_format, public\.demandes_grand_format from anon, authenticated/);
    expect(MIGRATION).not.toMatch(/to anon/);
    expect(MIGRATION).toMatch(/grant execute on function public\.creer_demande_grand_format\([^)]*\) to service_role;/);
  });

  it('la migration est additive : aucune suppression ni réécriture de données existantes', () => {
    expect(MIGRATION).not.toMatch(/\bdrop table\b|\bdrop column\b|\btruncate\b|\bdelete from\b/i);
    expect(MIGRATION).not.toMatch(/\bupdate public\.(?!devis\s+set cout_estime_fcfa)/i);
  });
});

describe('outils de format', () => {
  it('surface en centimètres entiers et format lisible', () => {
    expect(surfaceM2(1.1, 3)).toBe(3.3);
    expect(surfaceM2(0.85, 2)).toBe(1.7);
    expect(formatDimensions(3, 1.5)).toBe('3 × 1,5 m');
  });

  it('lit les mètres saisis avec virgule ou point, refuse le reste', () => {
    expect(lireMetres('1,5')).toBe(1.5);
    expect(lireMetres('2.25')).toBe(2.25);
    expect(lireMetres(3)).toBe(3);
    expect(lireMetres('1,234')).toBe(1.23);
    for (const v of ['', 'abc', '-1', '1e3', '1 000', null, undefined, {}]) expect(Number.isNaN(lireMetres(v))).toBe(true);
  });
});

const PARAMS = {
  usage: 'DEUIL',
  support: 'BANDEROLE',
  largeurM: '3',
  hauteurM: '1',
  quantite: 2,
  finition: 'OEILLETS',
  delai: 'STANDARD',
  prestation: 'CREATION',
  commentaire: 'Hommage à notre père, photo jointe.',
};

describe('validation des paramètres', () => {
  it('accepte une demande complète et normalise les valeurs', () => {
    const r = validerParametres(PARAMS, '2026-11-13');
    expect(r).toMatchObject({ ok: true, valeur: { usage: 'DEUIL', largeurM: 3, hauteurM: 1, quantite: 2, dateSouhaitee: null } });
  });

  it('refuse les dimensions hors bornes et les quantités invalides', () => {
    const r = validerParametres({ ...PARAMS, largeurM: '0,1', hauteurM: '60', quantite: 0 }, '2026-11-13');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erreurs).sort()).toEqual(['hauteurM', 'largeurM', 'quantite']);
    expect(validerParametres({ ...PARAMS, quantite: 1.5 }, '2026-11-13').ok).toBe(false);
    expect(validerParametres({ ...PARAMS, quantite: 1001 }, '2026-11-13').ok).toBe(false);
  });

  it('refuse des valeurs hors catalogue', () => {
    const r = validerParametres({ ...PARAMS, usage: 'MARIAGE', finition: 'DORURE', delai: 'HIER', prestation: 'GRATUIT' }, '2026-11-13');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erreurs).sort()).toEqual(['delai', 'finition', 'prestation', 'usage']);
  });

  it('exige une date future (≤ 12 mois) pour le délai « date précise »', () => {
    expect(validerParametres({ ...PARAMS, delai: 'DATE' }, '2026-11-13').ok).toBe(false);
    expect(validerParametres({ ...PARAMS, delai: 'DATE', dateSouhaitee: '2026-11-12' }, '2026-11-13').ok).toBe(false);
    expect(validerParametres({ ...PARAMS, delai: 'DATE', dateSouhaitee: '2026-02-30' }, '2026-11-13').ok).toBe(false);
    expect(validerParametres({ ...PARAMS, delai: 'DATE', dateSouhaitee: '2028-01-01' }, '2026-11-13').ok).toBe(false);
    expect(validerParametres({ ...PARAMS, delai: 'DATE', dateSouhaitee: '2026-11-13' }, '2026-11-13').ok).toBe(true);
    // Hors délai « date », une date transmise est ignorée.
    const r = validerParametres({ ...PARAMS, dateSouhaitee: '2026-12-01' }, '2026-11-13');
    expect(r.ok && r.valeur.dateSouhaitee).toBe(null);
  });

  it('force « sans finition » sur un support monté et exige les précisions « autre »', () => {
    const r = validerParametres({ ...PARAMS, support: 'ROLL_UP', finition: 'OEILLETS' }, '2026-11-13');
    expect(r.ok && r.valeur.finition).toBe('SANS');
    expect(validerParametres({ ...PARAMS, support: 'AUTRE' }, '2026-11-13').ok).toBe(false);
    expect(validerParametres({ ...PARAMS, support: 'AUTRE', supportPrecision: 'Drapeau' }, '2026-11-13').ok).toBe(true);
    expect(validerParametres({ ...PARAMS, finition: 'AUTRE' }, '2026-11-13').ok).toBe(false);
  });

  it('l’accompagnement exige une description ; l’estimation seule ne l’exige pas', () => {
    expect(validerParametres({ ...PARAMS, prestation: 'ACCOMPAGNEMENT', commentaire: '' }, '2026-11-13').ok).toBe(false);
    expect(validerParametresEstimation({ ...PARAMS, prestation: 'ACCOMPAGNEMENT', commentaire: '' }, '2026-11-13').ok).toBe(true);
    expect(validerParametresEstimation({ ...PARAMS, support: 'AUTRE' }, '2026-11-13').ok).toBe(true);
  });
});

describe('demande complète (coordonnées + fichiers, règles du devis général)', () => {
  const corps = {
    ...PARAMS,
    contact: { nom: 'Grâce Mabiala', telephone: '06 123 45 67', email: 'grace@example.cg', ville: 'Brazzaville' },
    fichiers: [{ nom: 'photo.jpg', typeMime: 'image/jpeg', tailleOctets: 2_000_000 }],
    consentement: true,
  };

  it('construit un devis IMPRESSION avec besoin, format et quantité dérivés', () => {
    const r = validerDemandeGrandFormat(corps, '2026-11-13');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.devis).toMatchObject({
      famille: 'IMPRESSION',
      nom: 'Grâce Mabiala',
      telephoneNormalise: '242061234567',
      format: '3 × 1 m',
      quantite: 2,
      typeClient: 'PARTICULIER',
    });
    expect(r.valeur.devis.besoin).toContain('Banderole 3 × 1 m × 2');
    expect(r.valeur.devis.besoin).toContain('Hommage à notre père');
  });

  it('réutilise les refus du devis : téléphone, consentement, fichiers', () => {
    const r = validerDemandeGrandFormat(
      {
        ...corps,
        contact: { nom: 'G', telephone: '123' },
        consentement: false,
        fichiers: [{ nom: 'virus.exe', typeMime: 'application/x-msdownload', tailleOctets: 10 }],
      },
      '2026-11-13',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erreurs).sort()).toEqual(['consentement', 'fichiers', 'nom', 'telephone']);
    const trop = validerDemandeGrandFormat(
      { ...corps, fichiers: Array.from({ length: 6 }, (_, i) => ({ nom: `f${i}.png`, typeMime: 'image/png', tailleOctets: 10 })) },
      '2026-11-13',
    );
    expect(trop.ok).toBe(false);
  });

  it('les spécifications montrées au client ne contiennent que des libellés publics', () => {
    const r = validerParametres(PARAMS, '2026-11-13');
    if (!r.ok) throw new Error('paramètres invalides');
    const specs = specificationsLisibles(r.valeur, { disponible: true, montantFcfa: 46200, impressionFcfa: 33200, creationFcfa: 13000, prixPieceFcfa: 16600, quantite: 2, surfacePieceM2: 3, surfaceTotaleM2: 6, minimumApplique: false });
    expect(specs).toMatchObject({ Utilisation: 'Deuil & hommage', Dimensions: '3 × 1 m', Finition: 'Œillets', 'Estimation en ligne': '46 200 FCFA (indicatif, hors livraison)' });
    for (const v of Object.values(specs)) expect(typeof v).toBe('string');
    expect(specificationsLisibles(r.valeur, null)['Estimation en ligne']).toBe('Sur devis');
    expect(besoinDepuisParametres(r.valeur).length).toBeGreaterThanOrEqual(10);
  });
});

describe('statuts dérivés — aucun statut nouveau', () => {
  it('chaque statut de devis et de commande existant a un état grand format', () => {
    for (const d of STATUTS_DEVIS) expect(ETATS.map((e) => e.id)).toContain(etatGrandFormat(d.id).id);
    for (const c of STATUTS_COMMANDE) expect(ETATS.map((e) => e.id)).toContain(etatGrandFormat('ACCEPTE', c.id).id);
  });

  it('suit le cycle commercial attendu', () => {
    expect(etatGrandFormat('NOUVEAU').label).toBe('Nouvelle demande');
    expect(etatGrandFormat('EN_ANALYSE').label).toBe('En attente de validation');
    expect(etatGrandFormat('PROPOSE').label).toBe('Devis transmis');
    expect(etatGrandFormat('ACCEPTE')).toMatchObject({ id: 'ATTENTE_PAIEMENT', detail: 'Devis accepté — commande à créer' });
    expect(etatGrandFormat('ACCEPTE', 'EN_ATTENTE_DE_PAIEMENT').label).toBe('En attente de paiement');
    expect(etatGrandFormat('ACCEPTE', 'PAYEE').label).toBe('Payée');
    expect(etatGrandFormat('ACCEPTE', 'EN_PRODUCTION').label).toBe('En production');
    expect(etatGrandFormat('ACCEPTE', 'CONTROLE_QUALITE').label).toBe('Contrôle qualité');
    expect(etatGrandFormat('ACCEPTE', 'PRETE').label).toBe('Prête à livrer');
    expect(etatGrandFormat('ACCEPTE', 'LIVREE').label).toBe('Livrée');
    expect(etatGrandFormat('REFUSE')).toMatchObject({ id: 'ANNULEE', detail: 'Devis refusé' });
    expect(etatGrandFormat('ACCEPTE', 'ANNULEE').id).toBe('ANNULEE');
  });

  it('expose exactement les dix états demandés', () => {
    expect(ETATS.map((e) => e.label)).toEqual([
      'Nouvelle demande',
      'En attente de validation',
      'Devis transmis',
      'En attente de paiement',
      'Payée',
      'En production',
      'Contrôle qualité',
      'Prête à livrer',
      'Livrée',
      'Annulée',
    ]);
  });
});

describe('rentabilité', () => {
  it('marge brute = prix facturé − coûts directs', () => {
    const r = rentabilite(40000, { impression: 15000, creation: 4000, livraison: 1500, autres: null }, ['impression', 'creation']);
    expect(r).toEqual({ prixFcfa: 40000, coutsFcfa: 20500, margeFcfa: 19500, taux: 0.4875, postesManquants: [] });
  });

  it('signale les postes manquants et ne calcule pas de marge sans prix ou sans coût', () => {
    expect(rentabilite(40000, { creation: 4000 }, ['impression', 'creation']).postesManquants).toEqual(['impression']);
    expect(rentabilite(null, { impression: 1000 }).margeFcfa).toBeNull();
    expect(rentabilite(40000, {}).margeFcfa).toBeNull();
    expect(rentabilite(0, { impression: 0 }).taux).toBeNull();
    expect(rentabilite(10000, { impression: 12000 }).margeFcfa).toBe(-2000);
  });

  it('totaux et prix de vente', () => {
    expect(totalCouts({ impression: null, creation: null })).toBeNull();
    expect(totalCouts({ impression: 0 })).toBe(0);
    expect(prixVente(null, null)).toBeNull();
    expect(prixVente(30000, null)).toBe(30000);
    expect(prixVente(30000, 10000)).toBe(40000);
    expect(postesAttendus('CREATION')).toEqual(['impression', 'creation']);
    expect(postesAttendus('FICHIER_PRET')).toEqual(['impression']);
  });

  it('ventile les coûts réels des tâches et range les autres tâches en « autres »', () => {
    const couts = coutsDepuisTaches([
      { etape: 'Impression grand format', cout_fcfa: 16000 },
      { etape: 'Création graphique', cout_fcfa: 4000 },
      { etape: 'INITIALISATION', cout_fcfa: null },
      { etape: 'Reprise découpe', cout_fcfa: 500 },
      { etape: 'Autres frais', cout_fcfa: 1000 },
    ]);
    expect(couts).toEqual({ impression: 16000, creation: 4000, livraison: null, autres: 1500 });
  });
});

describe('proposition commerciale', () => {
  const texte = genererProposition({
    usage: 'EGLISE',
    support: 'BANDEROLE',
    largeurM: 5,
    hauteurM: 1,
    quantite: 3,
    finition: 'OURLETS_OEILLETS',
    prestation: 'CREATION',
    prixImpressionFcfa: 75000,
    fraisCreationFcfa: 15000,
    productionPrevueLe: '2026-11-20',
    livraisonPrevueLe: '2026-11-21',
  });

  it('reprend format, quantité, finition, prix et planning', () => {
    expect(texte).toContain('Banderole — Églises & ministères');
    expect(texte).toContain('5 × 1 m (5 m² par pièce)');
    expect(texte).toContain('Quantité : 3');
    expect(texte).toContain('Ourlets + œillets');
    expect(texte).toContain('Impression : 75 000 FCFA');
    expect(texte).toContain('Création graphique : 15 000 FCFA');
    expect(texte).toContain('Total : 90 000 FCFA, hors livraison.');
    expect(texte).toContain('production prévue le 20 novembre 2026');
    expect(texte).toContain('maquette');
  });

  it('ne divulgue ni imprimeur, ni coût, ni marge', () => {
    expect(texte.toLowerCase()).not.toMatch(/imprimeur|partenaire|coût|marge/);
  });
});

describe('droits du back-office grand format', async () => {
  const { MATRICE, peut } = await import('../src/lib/admin/permissions');

  it('coûts, marges, tarifs négociés et grille : administration et finance uniquement', () => {
    expect(MATRICE['grand_format.couts']).toEqual(['admin', 'finance']);
    expect(MATRICE['grand_format.tarifs']).toEqual(['admin', 'finance']);
  });

  it('le commercial chiffre et propose, sans voir les coûts', () => {
    expect(peut('commercial', 'grand_format.voir')).toBe(true);
    expect(peut('commercial', 'grand_format.chiffrer')).toBe(true);
    expect(peut('commercial', 'grand_format.couts')).toBe(false);
  });

  it('l’atelier n’accède pas aux demandes commerciales', () => {
    for (const p of ['grand_format.voir', 'grand_format.chiffrer', 'grand_format.couts', 'grand_format.tarifs'] as const) {
      expect(peut('atelier', p)).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  aujourdhui,
  bornesDates,
  celluleCsv,
  documentCsv,
  entierChamp,
  estDateIso,
  lirePeriode,
  tauxMarge,
} from '../src/lib/admin/format';
import { destinationSure } from '../src/lib/admin/navigation';

describe('export CSV', () => {
  it('neutralise l’injection de formule dans les champs texte saisis par un client', () => {
    expect(celluleCsv('=HYPERLINK("http://x","clic")')).toBe(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(celluleCsv('+242 06 000 00 00')).toBe(`"'+242 06 000 00 00"`);
    expect(celluleCsv('-1+1')).toBe(`"'-1+1"`);
    expect(celluleCsv('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
  });

  it('laisse les nombres négatifs intacts et double les guillemets', () => {
    expect(celluleCsv(-1500)).toBe('"-1500"');
    expect(celluleCsv('Dit "Awa"')).toBe('"Dit ""Awa"""');
    expect(celluleCsv(null)).toBe('""');
  });

  it('produit un document Excel français : BOM, point-virgule, CRLF', () => {
    const csv = documentCsv(['Réf', 'Total'], [['ELB-1', 300]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿"Réf";"Total"\r\n"ELB-1";"300"\r\n');
  });
});

describe('périodes du tableau de bord (heure de Brazzaville)', () => {
  const maintenant = new Date('2026-11-12T23:30:00Z'); // 00:30 le 13 à Brazzaville

  it('calcule la date du jour à Brazzaville, pas en UTC', () => {
    expect(aujourdhui(maintenant)).toBe('2026-11-13');
  });

  it('30 derniers jours par défaut, bornes à minuit Brazzaville', () => {
    const p = lirePeriode({}, maintenant);
    expect(p.cle).toBe('30j');
    expect(p.du).toBe('2026-10-15');
    expect(p.au).toBe('2026-11-13');
    expect(p.debut).toBe('2026-10-14T23:00:00.000Z');
    expect(p.fin).toBe('2026-11-13T23:00:00.000Z');
  });

  it('accepte une période personnalisée valide et refuse une période inversée', () => {
    const ok = lirePeriode({ periode: 'perso', du: '2026-01-01', au: '2026-01-31' }, maintenant);
    expect(ok.cle).toBe('perso');
    expect(ok.fin).toBe('2026-01-31T23:00:00.000Z');
    expect(lirePeriode({ periode: 'perso', du: '2026-02-01', au: '2026-01-01' }, maintenant).cle).toBe('30j');
    expect(lirePeriode({ periode: 'perso', du: '2026-02-30', au: '2026-03-01' }, maintenant).cle).toBe('30j');
  });

  it('plafonne une période personnalisée à 3 ans', () => {
    const p = lirePeriode({ periode: 'perso', du: '2010-01-01', au: '2026-01-01' }, maintenant);
    expect(p.du).toBe('2023-01-02');
  });

  it('bornes de filtre de liste : fin exclusive au lendemain', () => {
    expect(bornesDates('2026-11-01', '2026-11-01')).toEqual({
      debut: '2026-10-31T23:00:00.000Z',
      fin: '2026-11-01T23:00:00.000Z',
    });
    expect(bornesDates('pas-une-date', undefined)).toEqual({ debut: null, fin: null });
  });

  it('valide les dates ISO réelles uniquement', () => {
    expect(estDateIso('2026-02-28')).toBe(true);
    expect(estDateIso('2026-02-29')).toBe(false);
    expect(estDateIso('2026-2-1')).toBe(false);
  });
});

describe('lecture des champs de formulaire', () => {
  it('entiers positifs uniquement', () => {
    expect(entierChamp('1 500')).toBe(1500);
    expect(entierChamp('')).toBeNull();
    expect(entierChamp('-3')).toBeNaN();
    expect(entierChamp('1e9')).toBeNaN();
    expect(entierChamp('12.5')).toBeNaN();
  });

  it('taux de marge nul si pas de ventes', () => {
    expect(tauxMarge(50, 200)).toBe(0.25);
    expect(tauxMarge(50, 0)).toBeNull();
  });
});

describe('redirection après connexion', () => {
  it('n’autorise qu’une page du back-office', () => {
    expect(destinationSure('/admin/commandes/abc')).toBe('/admin/commandes/abc');
    expect(destinationSure('/admin')).toBe('/admin');
  });

  it('refuse les redirections ouvertes et les détours', () => {
    for (const piege of [
      'https://exemple.com',
      '//exemple.com',
      '/admin//exemple.com',
      '/admin/../boutique',
      '/adminx',
      '/admin/connexion',
      '/\\exemple.com',
      'javascript:alert(1)',
      undefined,
      42,
    ]) {
      expect(destinationSure(piege), String(piege)).toBe('/admin');
    }
  });
});

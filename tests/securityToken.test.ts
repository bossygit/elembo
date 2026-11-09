import { describe, expect, it } from 'vitest';

import { atelierAutorise, jetonAtelier, jetonValide } from '../src/server/security/token';

describe('jetons serveur', () => {
  it('accepte un jeton identique et refuse tout le reste', () => {
    expect(jetonValide('secret-atelier', 'secret-atelier')).toBe(true);
    expect(jetonValide('secret-atelie', 'secret-atelier')).toBe(false);
    expect(jetonValide('secret-atelier ', 'secret-atelier')).toBe(true); // trim volontaire
    expect(jetonValide('', 'secret-atelier')).toBe(false);
    expect(jetonValide('secret-atelier', '')).toBe(false);
    expect(jetonValide(null, 'secret-atelier')).toBe(false);
  });

  it('lit le jeton dans l’en-tête, jamais dans l’URL', () => {
    const avecEntete = new Request('https://elembo.test/api/commandes/ELB-1/fichiers', {
      headers: { 'x-atelier-token': 'secret-atelier' },
    });
    expect(jetonAtelier(avecEntete)).toBe('secret-atelier');

    const enQuery = new Request('https://elembo.test/api/commandes/ELB-1/fichiers?token=secret-atelier');
    expect(jetonAtelier(enQuery)).toBe('');
    expect(atelierAutorise(enQuery, 'secret-atelier')).toBe(false);
  });

  it('refuse quand ATELIER_TOKEN n’est pas configuré', () => {
    const demande = new Request('https://elembo.test/api', {
      headers: { 'x-atelier-token': 'n-importe-quoi' },
    });
    expect(atelierAutorise(demande, '')).toBe(false);
    expect(atelierAutorise(demande, undefined)).toBe(false);
  });
});

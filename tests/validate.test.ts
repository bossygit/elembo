import { describe, it, expect } from 'vitest';
import { validateFile, validateDimensions, MAX_SIZE_BYTES, MIN_DIMENSION } from '../src/lib/validate';

describe('validateFile', () => {
  it('accepte un PNG sous la limite', () => {
    expect(validateFile(9.9 * 1024 * 1024, 'image/png')).toEqual({ ok: true });
  });

  it('accepte un JPG', () => {
    expect(validateFile(1024, 'image/jpeg')).toEqual({ ok: true });
  });

  it('est insensible à la casse du type MIME', () => {
    expect(validateFile(1024, 'IMAGE/PNG').ok).toBe(true);
  });

  it('rejette un format non supporté (PDF)', () => {
    const r = validateFile(1000, 'application/pdf');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('PNG ou JPG');
  });

  it('rejette un fichier au-dessus de 10 Mo', () => {
    const r = validateFile(MAX_SIZE_BYTES + 1, 'image/png');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('10 Mo');
  });

  it('rejette un fichier vide', () => {
    expect(validateFile(0, 'image/png').ok).toBe(false);
    expect(validateFile(-1, 'image/png').ok).toBe(false);
  });
});

describe('validateDimensions', () => {
  it('accepte une image ≥ 500 px sur chaque dimension', () => {
    expect(validateDimensions(1200, 800)).toEqual({ ok: true });
    expect(validateDimensions(MIN_DIMENSION, MIN_DIMENSION)).toEqual({ ok: true });
  });

  it('rejette une image trop petite (300×300)', () => {
    const r = validateDimensions(300, 300);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('500');
  });

  it('rejette si UNE dimension est sous le minimum (600×499)', () => {
    expect(validateDimensions(600, 499).ok).toBe(false);
    expect(validateDimensions(499, 600).ok).toBe(false);
  });

  it('rejette les dimensions invalides', () => {
    expect(validateDimensions(0, 0).ok).toBe(false);
    expect(validateDimensions(NaN, 800).ok).toBe(false);
  });
});

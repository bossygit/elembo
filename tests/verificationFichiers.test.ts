import { describe, expect, it } from 'vitest';

import {
  TAILLE_MAX_DEVIS,
  typeDepuisSignature,
  mimeAttendu,
  nomFichierAcceptable,
  verifierFichier,
} from '../src/server/storage/verification';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('vérification binaire des fichiers', () => {
  it('reconnaît les signatures PNG, JPEG, PDF, ZIP et WEBP', () => {
    expect(typeDepuisSignature(PNG)).toBe('PNG');
    expect(typeDepuisSignature(JPEG)).toBe('JPEG');
    expect(typeDepuisSignature(PDF)).toBe('PDF');
    expect(typeDepuisSignature(ZIP)).toBe('ZIP');
    expect(typeDepuisSignature(WEBP)).toBe('WEBP');
    expect(typeDepuisSignature(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
  });

  it('accepte un PNG cohérent avec son extension', () => {
    const resultat = verifierFichier({
      nom: 'visuel-avant.png',
      tailleOctets: PNG.length,
      octets: PNG,
      typesAutorises: ['PNG', 'PDF'],
      tailleMax: TAILLE_MAX_DEVIS,
    });
    expect(resultat).toEqual({ ok: true, type: 'PNG', mime: 'image/png' });
    expect(mimeAttendu('PDF')).toBe('application/pdf');
  });

  it('refuse une extension qui ment sur le contenu', () => {
    const resultat = verifierFichier({
      nom: 'visuel.jpg',
      tailleOctets: PNG.length,
      octets: PNG,
      typesAutorises: ['JPEG'],
      tailleMax: TAILLE_MAX_DEVIS,
    });
    expect(resultat.ok).toBe(false);
  });

  it('refuse les noms dangereux, les traversées et les doubles extensions', () => {
    expect(nomFichierAcceptable('logo.png', ['PNG'])).toBe(true);
    expect(nomFichierAcceptable('../logo.png', ['PNG'])).toBe(false);
    expect(nomFichierAcceptable('logo.png.exe', ['PNG'])).toBe(false);
    expect(nomFichierAcceptable('logo.exe.png', ['PNG'])).toBe(false);
    expect(nomFichierAcceptable('logo.svg', ['PNG'])).toBe(false);
    expect(nomFichierAcceptable('logo', ['PNG'])).toBe(false);
    expect(nomFichierAcceptable('a'.repeat(121) + '.png', ['PNG'])).toBe(false);
  });

  it('refuse un fichier trop volumineux ou vide', () => {
    expect(
      verifierFichier({
        nom: 'grand.png',
        tailleOctets: TAILLE_MAX_DEVIS + 1,
        octets: PNG,
        typesAutorises: ['PNG'],
        tailleMax: TAILLE_MAX_DEVIS,
      }).ok,
    ).toBe(false);
    expect(
      verifierFichier({
        nom: 'vide.png',
        tailleOctets: 0,
        octets: new Uint8Array(),
        typesAutorises: ['PNG'],
        tailleMax: TAILLE_MAX_DEVIS,
      }).ok,
    ).toBe(false);
  });
});

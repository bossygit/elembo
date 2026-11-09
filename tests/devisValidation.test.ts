import { describe, expect, it } from 'vitest';

import {
  emailValide,
  normaliserTelephone,
  validerDemandeDevis,
} from '@/lib/devis/validation';
import { creerJetonSuivi, hashJeton } from '@/server/devis/jetons';
import { genererCodeOtp, hacherOtp } from '@/server/devis/otp';
import { comparerSecret, origineAutorisee } from '@/server/security/http';

function demande(extra: Record<string, unknown> = {}) {
  return {
    famille: 'SERVICES',
    nom: 'Aline Mbemba',
    email: 'aline@example.com',
    telephone: '+242 06 123 45 67',
    ville: 'Brazzaville',
    besoin: 'Création de visuels pour une campagne de communication.',
    format: 'A4',
    quantite: 100,
    specifications: {},
    fichiers: [],
    consentement: true,
    ...extra,
  };
}

describe('validation des demandes de devis', () => {
  it('normalise les numéros congolais', () => {
    expect(normaliserTelephone('+242 06 123 45 67')).toBe('242061234567');
    expect(normaliserTelephone('06 123 45 67')).toBe('242061234567');
    expect(normaliserTelephone('00242 06 123 45 67')).toBe('242061234567');
    expect(normaliserTelephone('123')).toBe('');
  });

  it('accepte une demande complète sans fichier', () => {
    const resultat = validerDemandeDevis(demande());
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.valeur.typeClient).toBe('PARTICULIER');
      expect(resultat.valeur.telephoneNormalise).toBe('242061234567');
    }
  });

  it('déduit le type entreprise de la société', () => {
    const resultat = validerDemandeDevis(demande({ societe: 'Smart Vision Congo' }));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.valeur.typeClient).toBe('ENTREPRISE');
  });

  it('refuse un email ou un téléphone invalide', () => {
    const email = validerDemandeDevis(demande({ email: 'pas-un-email' }));
    expect(email.ok).toBe(false);
    if (!email.ok) expect(email.erreurs.email).toBeTruthy();

    const telephone = validerDemandeDevis(demande({ telephone: '123' }));
    expect(telephone.ok).toBe(false);
    if (!telephone.ok) expect(telephone.erreurs.telephone).toBeTruthy();
  });

  it('refuse un fichier dont le nom ou le type ne correspond pas', () => {
    const resultat = validerDemandeDevis(
      demande({
        fichiers: [{ nom: 'script.exe', typeMime: 'application/pdf', tailleOctets: 100 }],
      }),
    );
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs.fichiers).toBeTruthy();
  });

  it('refuse plus de 5 fichiers et plus de 50 Mo cumulés', () => {
    const trop = validerDemandeDevis(
      demande({
        fichiers: Array.from({ length: 6 }, (_, i) => ({
          nom: `fichier-${i}.pdf`,
          typeMime: 'application/pdf',
          tailleOctets: 100,
        })),
      }),
    );
    expect(trop.ok).toBe(false);

    const lourd = validerDemandeDevis(
      demande({
        fichiers: [
          { nom: 'a.pdf', typeMime: 'application/pdf', tailleOctets: 25 * 1024 * 1024 },
          { nom: 'b.pdf', typeMime: 'application/pdf', tailleOctets: 25 * 1024 * 1024 },
          { nom: 'c.pdf', typeMime: 'application/pdf', tailleOctets: 1 },
        ],
      }),
    );
    expect(lourd.ok).toBe(false);
    if (!lourd.ok) expect(lourd.erreurs.fichiers).toMatch(/50 Mo/);
  });

  it('refuse les doublons de nom de fichier', () => {
    const resultat = validerDemandeDevis(
      demande({
        fichiers: [
          { nom: 'logo.png', typeMime: 'image/png', tailleOctets: 10 },
          { nom: 'LOGO.png', typeMime: 'image/png', tailleOctets: 10 },
        ],
      }),
    );
    expect(resultat.ok).toBe(false);
  });

  it('refuse sans consentement', () => {
    const resultat = validerDemandeDevis(demande({ consentement: false }));
    expect(resultat.ok).toBe(false);
  });
});

describe('jetons et OTP', () => {
  it('ne stocke qu’un hash du jeton de suivi', () => {
    const jeton = creerJetonSuivi();
    expect(jeton.token).not.toBe(jeton.hash);
    expect(hashJeton(jeton.token)).toBe(jeton.hash);
    expect(jeton.token.length).toBeGreaterThan(32);
  });

  it('génère un code à 6 chiffres et le hache avec le devis', () => {
    process.env.DEVIS_OTP_SECRET = 'secret-de-test-suffisamment-long-pour-hmac';
    const code = genererCodeOtp();
    expect(code).toMatch(/^\d{6}$/);
    const hash = hacherOtp(code, 'devis-1');
    expect(hash).toHaveLength(64);
    expect(hacherOtp(code, 'devis-2')).not.toBe(hash);
    expect(comparerSecret(hash, hacherOtp(code, 'devis-1'))).toBe(true);
  });
});

describe('contrôles HTTP', () => {
  it('refuse une origine inconnue et accepte celle configurée', () => {
    const ancienne = process.env.APP_ORIGINS;
    process.env.APP_ORIGINS = 'https://elembo.test';
    try {
      expect(origineAutorisee(new Request('https://elembo.test/api/devis', {
        method: 'POST',
        headers: { Origin: 'https://evil.test' },
      }))).toBe(false);
      expect(origineAutorisee(new Request('https://elembo.test/api/devis', {
        method: 'POST',
        headers: { Origin: 'https://elembo.test' },
      }))).toBe(true);
    } finally {
      if (ancienne === undefined) delete process.env.APP_ORIGINS;
      else process.env.APP_ORIGINS = ancienne;
    }
  });

  it('valide le format email', () => {
    expect(emailValide('a@b.cg')).toBe(true);
    expect(emailValide('a@b')).toBe(false);
  });
});

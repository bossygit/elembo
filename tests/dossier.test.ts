// Règles du dépôt du dossier de production : c'est ce qui empêche qu'un fichier arrive pour une
// commande non payée, ou que le stockage serve de dépotoir.

import { describe, expect, it } from 'vitest';

import {
  MAX_FICHIERS,
  normaliserFichiers,
  prefixeCommande,
  recapDossier,
  verifierAutorisation,
  verifierChemin,
  verifierDepot,
} from '../src/server/dossiers/dossier';
import type { Transaction } from '../src/server/momo/store';

const COMMANDE = 'ELB-20261026-1200-AB';

function transaction(patch: Partial<Transaction> = {}): Transaction {
  return {
    referenceId: 'ref-1',
    commande: COMMANDE,
    produitId: 'tshirt-basic',
    montantFcfa: 11_000,
    montantEnvoye: '11000',
    devise: 'XAF',
    msisdn: '242061234567',
    statut: 'PAYE',
    financialTransactionId: 'FT-1',
    raison: null,
    creeLe: '2026-10-26T10:00:00.000Z',
    majLe: '2026-10-26T10:01:00.000Z',
    historique: [],
    ...patch,
  };
}

const FICHIER = {
  nom: `${COMMANDE}-avant.png`,
  chemin: `dossiers/${COMMANDE}/${COMMANDE}-avant.png`,
  taille: 250_000,
  type: 'image/png',
};

describe('autorisation du dépôt', () => {
  it('refuse une référence inconnue', () => {
    const v = verifierAutorisation({ transaction: undefined, commande: COMMANDE });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.statut).toBe(404);
  });

  it('refuse une référence qui ne correspond pas à la commande', () => {
    const v = verifierAutorisation({ transaction: transaction({ commande: 'ELB-AUTRE' }), commande: COMMANDE });
    expect(!v.ok && v.statut).toBe(403);
  });

  it('refuse une commande non payée (PENDING, ECHEC, ANOMALIE)', () => {
    for (const statut of ['PENDING', 'ECHEC', 'ANOMALIE'] as const) {
      const v = verifierAutorisation({ transaction: transaction({ statut }), commande: COMMANDE });
      expect(!v.ok && v.statut, statut).toBe(409);
      expect(!v.ok && v.motif).toMatch(/pas payée/);
    }
  });

  it('accepte une commande PAYÉE de la bonne référence', () => {
    expect(verifierAutorisation({ transaction: transaction(), commande: COMMANDE }).ok).toBe(true);
  });
});

describe('chemins d’archive', () => {
  it('borne les fichiers au dossier de la commande', () => {
    expect(verifierChemin(COMMANDE, FICHIER.chemin)).toBeNull();
    expect(verifierChemin(COMMANDE, `dossiers/ELB-AUTRE/x.png`)).toMatch(/hors de la commande/);
    expect(verifierChemin(COMMANDE, `dossiers/${COMMANDE}/../secret.png`)).toMatch(/hors de la commande/);
    expect(prefixeCommande(COMMANDE)).toBe(`dossiers/${COMMANDE}/`);
  });
});

describe('dépôt complet', () => {
  it('accepte un dossier normal', () => {
    const v = verifierDepot({ transaction: transaction(), commande: COMMANDE, fichiers: [FICHIER] });
    expect(v.ok).toBe(true);
  });

  it('refuse un dépôt vide, trop gros ou trop nombreux', () => {
    expect(verifierDepot({ transaction: transaction(), commande: COMMANDE, fichiers: [] })).toMatchObject({
      ok: false,
      statut: 422,
    });
    const trop = Array.from({ length: MAX_FICHIERS + 1 }, (_, i) => ({ ...FICHIER, nom: `f${i}.png` }));
    expect(verifierDepot({ transaction: transaction(), commande: COMMANDE, fichiers: trop })).toMatchObject({
      ok: false,
      statut: 422,
    });
    const lourd = { ...FICHIER, taille: 26 * 1024 * 1024 };
    expect(verifierDepot({ transaction: transaction(), commande: COMMANDE, fichiers: [lourd] })).toMatchObject({
      ok: false,
      statut: 422,
    });
  });

  it('refuse un type inattendu et un nom avec traversée', () => {
    expect(
      verifierDepot({
        transaction: transaction(),
        commande: COMMANDE,
        fichiers: [{ ...FICHIER, type: 'application/x-msdownload' }],
      }),
    ).toMatchObject({ ok: false, statut: 422 });

    expect(
      verifierDepot({
        transaction: transaction(),
        commande: COMMANDE,
        fichiers: [{ ...FICHIER, nom: '../evade.png' }],
      }),
    ).toMatchObject({ ok: false, statut: 422 });
  });

  it('ignore un montant ou un fichier mal typé sans casser', () => {
    const v = verifierDepot({
      transaction: transaction(),
      commande: COMMANDE,
      fichiers: [{ nom: 'x.png', chemin: `dossiers/${COMMANDE}/x.png`, taille: 'beaucoup', type: 'image/png' }],
    });
    expect(v).toMatchObject({ ok: false, statut: 422 });
  });
});

describe('normalisation et récapitulatif', () => {
  it('normalise les champs et écarte ce qui n’est pas un tableau', () => {
    expect(normaliserFichiers([{ nom: ' a.png ', chemin: 'c', taille: '12', type: 'image/png' }])).toEqual([
      { nom: 'a.png', chemin: 'c', taille: 12, type: 'image/png' },
    ]);
    expect(normaliserFichiers('pas un tableau')).toEqual([]);
  });

  it('récapitule la commande pour l’atelier sans exposer le numéro complet', () => {
    const recap = recapDossier(transaction(), normaliserFichiers([FICHIER]));
    expect(recap).toContain(`Commande ${COMMANDE} — PAYÉE`);
    expect(recap).toContain('11000 XAF');
    expect(recap).toContain('Transaction MTN : FT-1');
    expect(recap).toContain(FICHIER.nom);
    expect(recap).toContain('24206••••67');
    expect(recap).not.toContain('242061234567');
  });
});

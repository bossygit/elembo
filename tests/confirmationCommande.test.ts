import { describe, expect, it } from 'vitest';

import {
  construireRecap,
  enregistrerRecap,
  formaterFcfa,
  lienConfirmation,
  lireRecap,
  masquerTelephone,
  referencePlausible,
  type EntreeRecap,
} from '../src/lib/order/confirmation';

const COMMANDE = 'ELB-20261110-1015-AB';
const PAIEMENT = '3f9c2a1e-8b1d-4c1a-9d3e-0a1b2c3d4e5f';

function entree(extra: Partial<EntreeRecap> = {}): EntreeRecap {
  return {
    commande: COMMANDE,
    referenceId: PAIEMENT,
    produit: { id: 'tshirt-basic', nom: 'T-Shirt raglan', couleur: 'Noir', couleurHex: '#1A1A1A' },
    lignes: [
      { taille: 'M', quantite: 2 },
      { taille: 'L', quantite: 0 },
    ],
    prixUnitaireFcfa: 100,
    sousTotalFcfa: 200,
    livraison: { ville: 'Brazzaville', fraisFcfa: 100, delaiJours: 1 },
    totalFcfa: 300,
    financialTransactionId: '123456',
    nom: '  Bienvenu  ',
    telephone: '06 123 45 67',
    faces: ['Face avant'],
    atelier: { envoye: true, fichiers: 3, notifie: true },
    maintenant: new Date('2026-11-10T09:15:00Z'),
    ...extra,
  };
}

/** Stockage factice en mémoire (le navigateur n'existe pas dans l'environnement de test). */
function stockageMemoire() {
  const donnees = new Map<string, string>();
  return {
    donnees,
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => {
      donnees.set(k, v);
    },
  };
}

describe('masquerTelephone', () => {
  it('masque le milieu du numéro local', () => {
    expect(masquerTelephone('06 123 45 67')).toBe('06 ••• ••• 67');
  });

  it('retire le préfixe pays avant de masquer', () => {
    expect(masquerTelephone('+242 06 123 45 67')).toBe('06 ••• ••• 67');
    expect(masquerTelephone('00242061234567')).toBe('06 ••• ••• 67');
  });

  it('ne laisse rien filtrer d’un numéro trop court', () => {
    expect(masquerTelephone('12')).toBe('••••');
    expect(masquerTelephone('')).toBe('••••');
  });
});

describe('construireRecap', () => {
  it('écarte les tailles à zéro et totalise la quantité', () => {
    const recap = construireRecap(entree());
    expect(recap.lignes).toEqual([{ taille: 'M', quantite: 2 }]);
    expect(recap.quantite).toBe(2);
  });

  it('ne conserve que le téléphone masqué, jamais le numéro complet', () => {
    const recap = construireRecap(entree());
    expect(recap.client.telephoneMasque).toBe('06 ••• ••• 67');
    expect(JSON.stringify(recap)).not.toContain('123 45');
    expect(JSON.stringify(recap)).not.toContain('0612345');
  });

  it('nettoie le nom et accepte son absence', () => {
    expect(construireRecap(entree()).client.nom).toBe('Bienvenu');
    expect(construireRecap(entree({ nom: undefined })).client.nom).toBeNull();
  });

  it('consigne un envoi à l’atelier non abouti avec son motif', () => {
    const recap = construireRecap(entree({ atelier: { envoye: false, fichiers: 0, motif: 'réseau coupé' } }));
    expect(recap.atelier).toEqual({ envoye: false, fichiers: 0, notifie: false, motif: 'réseau coupé' });
  });
});

describe('enregistrer / lire le récapitulatif', () => {
  it('restitue exactement ce qui a été enregistré', () => {
    const stockage = stockageMemoire();
    const recap = construireRecap(entree());
    expect(enregistrerRecap(recap, stockage)).toBe(true);
    expect(lireRecap(COMMANDE, PAIEMENT, stockage)).toEqual(recap);
  });

  it('ignore un récapitulatif rattaché à un autre paiement', () => {
    const stockage = stockageMemoire();
    enregistrerRecap(construireRecap(entree()), stockage);
    expect(lireRecap(COMMANDE, 'autre-reference-de-paiement', stockage)).toBeNull();
  });

  it('ignore un contenu altéré ou illisible', () => {
    const stockage = stockageMemoire();
    stockage.setItem(`elembo:commande:${COMMANDE}`, '{pas du json');
    expect(lireRecap(COMMANDE, PAIEMENT, stockage)).toBeNull();

    stockage.setItem(`elembo:commande:${COMMANDE}`, JSON.stringify({ version: 1, commande: COMMANDE }));
    expect(lireRecap(COMMANDE, PAIEMENT, stockage)).toBeNull();
  });

  it('ignore un récapitulatif dont la commande ne correspond pas à la clé', () => {
    const stockage = stockageMemoire();
    const recap = construireRecap(entree());
    stockage.setItem('elembo:commande:ELB-AUTRE-0000-ZZ', JSON.stringify(recap));
    expect(lireRecap('ELB-AUTRE-0000-ZZ', PAIEMENT, stockage)).toBeNull();
  });

  it('ne jette jamais quand le navigateur refuse d’écrire (quota, navigation privée)', () => {
    const plein = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(enregistrerRecap(construireRecap(entree()), plein)).toBe(false);
  });

  it('sans stockage disponible, rien n’est enregistré ni lu', () => {
    expect(enregistrerRecap(construireRecap(entree()), null)).toBe(false);
    expect(lireRecap(COMMANDE, PAIEMENT, null)).toBeNull();
  });
});

describe('liens et références', () => {
  it('construit l’adresse de confirmation avec la commande et le paiement', () => {
    expect(lienConfirmation(COMMANDE, PAIEMENT)).toBe(`/commande/confirmation?ref=${COMMANDE}&paiement=${PAIEMENT}`);
  });

  it('refuse une référence qui ne ressemble pas à une référence', () => {
    expect(referencePlausible(COMMANDE)).toBe(true);
    expect(referencePlausible('')).toBe(false);
    expect(referencePlausible('../../etc/passwd')).toBe(false);
    expect(referencePlausible('<script>alert(1)</script>')).toBe(false);
    expect(referencePlausible(undefined)).toBe(false);
  });

  it('formate les montants comme le tunnel de commande', () => {
    expect(formaterFcfa(300)).toBe('300 FCFA');
    expect(formaterFcfa(26000)).toBe('26 000 FCFA');
  });
});

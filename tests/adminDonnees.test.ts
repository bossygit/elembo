import { describe, expect, it } from 'vitest';

import { differences } from '../src/server/admin/audit';
import { indicateursClient } from '../src/server/admin/clients';
import { etapesPipeline } from '../src/server/admin/devis';
import { bucketSupabase, cheminSur, nomTelechargement } from '../src/server/admin/fichiers';
import { quantitesParTailleCouleur, quantiteTotale } from '../src/server/admin/production';
import { verifierImage } from '../src/server/admin/produits';
import { couleurSure, zonesSures } from '../src/server/commandes/momo';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('vue atelier — quantités par taille et couleur', () => {
  const lignes = [
    { id: '1', designation: 'T M', quantite: 3, produit_id: 'tshirt', options: { taille: 'M' } },
    { id: '2', designation: 'T L', quantite: 2, produit_id: 'tshirt', options: { taille: 'L' } },
    { id: '3', designation: 'T M bis', quantite: 1, produit_id: 'tshirt', options: { taille: 'M' } },
    { id: '4', designation: 'T M rouge', quantite: 4, produit_id: 'tshirt', options: { taille: 'M', couleur: 'Rouge' } },
  ];

  it('regroupe par taille et couleur, la couleur de commande servant de défaut', () => {
    expect(quantitesParTailleCouleur(lignes, { couleur: 'Noir' })).toEqual([
      { taille: 'M', couleur: 'Noir', quantite: 4 },
      { taille: 'L', couleur: 'Noir', quantite: 2 },
      { taille: 'M', couleur: 'Rouge', quantite: 4 },
    ]);
    expect(quantiteTotale(lignes)).toBe(10);
  });

  it('utilise le format pour un tableau et « — » sans information', () => {
    expect(
      quantitesParTailleCouleur([{ id: 'x', designation: 'Toile', quantite: 2, produit_id: 'tableau', options: { formatId: '40x60' } }], {}),
    ).toEqual([{ taille: '40x60', couleur: '—', quantite: 2 }]);
  });
});

describe('fichiers de production', () => {
  it('refuse les chemins dangereux', () => {
    expect(cheminSur('dossiers/ELB-1/visuel.png')).toBe(true);
    expect(cheminSur('/etc/passwd')).toBe(false);
    expect(cheminSur('dossiers/../secrets')).toBe(false);
    expect(cheminSur('dossiers/a\\b')).toBe(false);
    expect(cheminSur('dossiers/a\nb')).toBe(false);
    expect(cheminSur('')).toBe(false);
  });

  it('choisit le bon bucket Supabase et un nom de téléchargement sûr', () => {
    expect(bucketSupabase('devis/123/plan.pdf')).toBe('devis');
    expect(bucketSupabase('commandes/ELB-1/bat.pdf')).toBe('production');
    expect(nomTelechargement('visuel "final"\r\n.png')).toBe('visuel _final___.png');
  });
});

describe('images du catalogue', () => {
  it('accepte un vrai PNG', () => {
    expect(verifierImage(PNG)).toEqual({ ok: true, type: 'PNG', mime: 'image/png' });
  });

  it('refuse un SVG, un fichier vide ou trop lourd, quel que soit le type annoncé', () => {
    expect(verifierImage(new TextEncoder().encode('<svg onload="alert(1)">')).ok).toBe(false);
    expect(verifierImage(new Uint8Array()).ok).toBe(false);
    const lourd = new Uint8Array(4 * 1024 * 1024 + 1);
    lourd.set(PNG);
    expect(verifierImage(lourd).ok).toBe(false);
  });
});

describe('pipeline commercial des devis', () => {
  const base = {
    cree_le: '2026-11-01T10:00:00Z',
    analyse_besoins: null,
    montant_propose_fcfa: null,
    proposition_commerciale: null,
    prix_valide: false,
    prix_valide_le: null,
    commande: null,
    historique: [],
  };

  it('un devis nouveau n’a que la réception de faite', () => {
    const etapes = etapesPipeline({ ...base, statut: 'NOUVEAU' });
    expect(etapes.map((e) => e.faite)).toEqual([true, false, false, false, false, false, false]);
    expect(etapes).toHaveLength(7);
  });

  it('un devis accepté, converti et payé a toutes ses étapes', () => {
    const etapes = etapesPipeline({
      ...base,
      statut: 'ACCEPTE',
      montant_propose_fcfa: 50000,
      prix_valide: true,
      prix_valide_le: '2026-11-03T10:00:00Z',
      commande: { reference: 'ELB-1', statut_paiement: 'PAYE', paye_le: '2026-11-05T10:00:00Z' },
      historique: [
        { nouveau_statut: 'ACCEPTE', cree_le: '2026-11-04T10:00:00Z' },
        { nouveau_statut: 'PROPOSE', cree_le: '2026-11-02T10:00:00Z' },
        { nouveau_statut: 'EN_ANALYSE', cree_le: '2026-11-01T12:00:00Z' },
      ],
    });
    expect(etapes.every((e) => e.faite)).toBe(true);
    expect(etapes.find((e) => e.cle === 'proposition')?.detail).toBe('50 000 FCFA'.replace(' ', ' '));
  });

  it('un devis proposé dont le prix n’est pas validé le signale', () => {
    const etapes = etapesPipeline({ ...base, statut: 'PROPOSE', montant_propose_fcfa: 1000 });
    expect(etapes.find((e) => e.cle === 'prix')?.faite).toBe(false);
    expect(etapes.find((e) => e.cle === 'proposition')?.faite).toBe(true);
  });
});

describe('fiche client', () => {
  it('ne compte que les commandes payées dans le montant dépensé', () => {
    const k = indicateursClient([
      { id: 'a', reference: 'A', statut: 'LIVREE', statut_paiement: 'PAYE', total_fcfa: 3000, marge_fcfa: 1000, cree_le: '2026-11-03' },
      { id: 'b', reference: 'B', statut: 'EN_ATTENTE_DE_PAIEMENT', statut_paiement: 'EN_ATTENTE', total_fcfa: 9000, marge_fcfa: 0, cree_le: '2026-11-02' },
      { id: 'c', reference: 'C', statut: 'PAYEE', statut_paiement: 'PAYE', total_fcfa: 1000, marge_fcfa: 200, cree_le: '2026-11-01' },
    ]);
    expect(k).toMatchObject({ nbCommandes: 3, nbPayees: 2, montantDepense: 4000, panierMoyen: 2000, marge: 1200 });
    expect(k.derniere).toBe('2026-11-03');
    expect(k.premiere).toBe('2026-11-01');
  });
});

describe('journal d’audit', () => {
  it('liste les champs modifiés en ignorant les dates techniques', () => {
    expect(differences({ nom: 'A', maj_le: '1', stock: 2 }, { nom: 'B', maj_le: '2', stock: 2 })).toEqual([
      { champ: 'nom', avant: 'A', apres: 'B' },
    ]);
    expect(differences(null, { a: 1 })).toEqual([]);
  });
});

describe('commande directe — informations atelier', () => {
  it('garde une couleur lisible et refuse le contenu suspect', () => {
    expect(couleurSure('Bleu marine')).toBe('Bleu marine');
    expect(couleurSure('#1a2b3c')).toBe('#1a2b3c');
    expect(couleurSure('<script>')).toBeNull();
    expect(couleurSure(42)).toBeNull();
  });

  it('limite les zones à 10 libellés courts', () => {
    expect(zonesSures(['Devant', 'Dos', '<img>', 7])).toEqual(['Devant', 'Dos']);
    expect(zonesSures(Array.from({ length: 20 }, (_, i) => `Zone ${i}`))).toHaveLength(10);
    expect(zonesSures('Devant')).toEqual([]);
  });
});

describe('historique de commande — résumé lisible', () => {
  it('traduit les champs et masque les identifiants techniques', async () => {
    const { resumeAudit } = await import('../src/server/admin/commandes');
    const texte = resumeAudit(null, {
      etape: 'Impression DTF',
      statut: 'A_FAIRE',
      interne: false,
      cout_fcfa: 1500,
      date_prevue: '2026-11-20',
      partenaire_id: 'aef4cd32-d3db-4e3b-926b-319ba6fb8903',
      id: 'x',
    });
    expect(texte).toBe('Étape : Impression DTF · État : À faire · Coût : 1 500 FCFA · Date prévue : 20 nov. 2026');
    expect(texte).not.toMatch(/partenaire_id|interne|aef4cd32/);
  });

  it('montre l’ancienne et la nouvelle valeur d’un champ modifié', async () => {
    const { resumeAudit } = await import('../src/server/admin/commandes');
    expect(resumeAudit({ ville: 'Brazzaville', adresse: 'A' }, { ville: 'Pointe-Noire', adresse: 'A' })).toBe(
      'Ville : Brazzaville → Pointe-Noire',
    );
  });
});

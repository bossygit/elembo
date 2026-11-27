// Tarifs COURANTS : prix des produits et frais de livraison réellement appliqués.
//
// Source de vérité : le tableau de bord administrateur (Supabase, table `produits` et paramètre
// `livraison`). Le paiement les relit à chaque demande ; l'affichage les reçoit du serveur (voir
// src/server/tarifs). `tarifs/grille.json` ne sert plus qu'aux valeurs de départ, au
// développement local et aux tests, quand Supabase n'est pas configuré.
//
// Ce module est pur (aucun accès réseau) : il est partagé par le navigateur et le serveur.
//
// Règle inchangée : un prix absent ou non validé ne devient JAMAIS un montant facturable.

import { GRILLE, type Grille, type StatutPrix } from './grille';

export type TarifProduit = {
  id: string;
  nom: string;
  prixFcfa: number | null;
  statutPrix: StatutPrix;
  /** Actif ET disponible dans l'admin : sans cela, aucune vente en ligne. */
  vendable: boolean;
};

export type TarifVille = { id: string; nom: string; fraisFcfa: number | null };

export type TarifsLivraison = {
  statutPrix: StatutPrix;
  delaiMaxJours: number;
  villes: TarifVille[];
};

export type Tarifs = {
  /** `base` : admin (Supabase) ; `grille` : fichier local ; `indisponible` : lecture échouée. */
  source: 'base' | 'grille' | 'indisponible';
  produits: TarifProduit[];
  livraison: TarifsLivraison;
};

/** Tarifs du fichier `tarifs/grille.json` (développement local, tests, valeurs de départ). */
export function tarifsDepuisGrille(grille: Grille = GRILLE): Tarifs {
  return {
    source: 'grille',
    produits: grille.produits.map((p) => ({
      id: p.id,
      nom: p.nom,
      prixFcfa: p.prixFcfa,
      statutPrix: p.statutPrix ?? 'provisoire',
      vendable: true,
    })),
    livraison: {
      statutPrix: grille.livraison.statutPrix ?? 'provisoire',
      delaiMaxJours: grille.livraison.delaiMaxJours,
      villes: grille.livraison.villes.map((v) => ({ id: v.id, nom: v.nom, fraisFcfa: v.fraisFcfa })),
    },
  };
}

/**
 * Tarifs quand la lecture de l'admin a échoué : aucun prix, aucuns frais. L'interface affiche
 * « Prix sur demande » et bloque la commande — on ne montre jamais un prix qui pourrait ne pas
 * être celui encaissé. Les villes restent listées (noms seulement).
 */
export function tarifsIndisponibles(grille: Grille = GRILLE): Tarifs {
  return {
    source: 'indisponible',
    produits: [],
    livraison: {
      statutPrix: 'provisoire',
      delaiMaxJours: grille.livraison.delaiMaxJours,
      villes: grille.livraison.villes.map((v) => ({ id: v.id, nom: v.nom, fraisFcfa: null })),
    },
  };
}

export function tarifProduit(tarifs: Tarifs, id: string): TarifProduit | undefined {
  return tarifs.produits.find((p) => p.id === id);
}

export function tarifVille(tarifs: Tarifs, id: string): TarifVille | undefined {
  return tarifs.livraison.villes.find((v) => v.id === id);
}

/** Un produit peut-il être payé en ligne à ce tarif ? (prix chiffré, validé, produit vendable) */
export function produitFacturable(tarif: TarifProduit | undefined): boolean {
  return Boolean(tarif && tarif.vendable && tarif.statutPrix === 'valide' && tarif.prixFcfa != null);
}

/* ---------------------------------------------------------- lecture de la base --- */

export type StatutPrixBase = 'TEST' | 'PROVISOIRE' | 'VALIDE';

export type LigneProduitBase = {
  id: string;
  nom: string;
  prix_fcfa: number | null;
  statut_prix: StatutPrixBase;
  actif: boolean;
  disponible: boolean;
};

/** Paramètre `livraison` tel qu'il est stocké (jsonb). */
export type LivraisonBase = {
  villes: { id: string; nom: string; frais_fcfa: number | null }[];
  statut_prix?: StatutPrixBase;
  delai_max_jours: number;
};

export function statutDepuisBase(statut: string): StatutPrix {
  if (statut === 'VALIDE') return 'valide';
  if (statut === 'TEST') return 'test';
  return 'provisoire';
}

export function statutVersBase(statut: StatutPrix): StatutPrixBase {
  return statut === 'valide' ? 'VALIDE' : statut === 'test' ? 'TEST' : 'PROVISOIRE';
}

const montantValide = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * Contrôle du paramètre `livraison`. Une valeur mal formée est REFUSÉE (exception) plutôt que
 * lue « au mieux » : des frais inventés seraient encaissés.
 */
export function lireLivraisonBase(valeur: unknown): TarifsLivraison {
  const v = valeur as Partial<LivraisonBase> | null;
  if (!v || !Array.isArray(v.villes) || !v.villes.length) throw new Error('Paramètre « livraison » : aucune ville.');
  if (!Number.isInteger(v.delai_max_jours) || (v.delai_max_jours as number) < 1 || (v.delai_max_jours as number) > 60) {
    throw new Error('Paramètre « livraison » : délai maximal invalide.');
  }
  const ids = new Set<string>();
  const villes = v.villes.map((ville) => {
    if (!ville || typeof ville.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(ville.id) || ids.has(ville.id)) {
      throw new Error('Paramètre « livraison » : identifiant de ville invalide ou en double.');
    }
    ids.add(ville.id);
    if (typeof ville.nom !== 'string' || !ville.nom.trim()) throw new Error(`Paramètre « livraison » : nom manquant (${ville.id}).`);
    if (ville.frais_fcfa !== null && !montantValide(ville.frais_fcfa)) {
      throw new Error(`Paramètre « livraison » : frais invalides pour ${ville.id}.`);
    }
    return { id: ville.id, nom: ville.nom.trim(), fraisFcfa: ville.frais_fcfa };
  });
  return {
    statutPrix: statutDepuisBase(v.statut_prix ?? 'PROVISOIRE'),
    delaiMaxJours: v.delai_max_jours as number,
    villes,
  };
}

/** Assemble les tarifs lus dans l'admin. */
export function tarifsDepuisBase(produits: LigneProduitBase[], livraison: unknown): Tarifs {
  return {
    source: 'base',
    produits: produits.map((p) => ({
      id: p.id,
      nom: p.nom,
      prixFcfa: montantValide(p.prix_fcfa) ? p.prix_fcfa : null,
      statutPrix: statutDepuisBase(p.statut_prix),
      vendable: p.actif === true && p.disponible === true,
    })),
    livraison: lireLivraisonBase(livraison),
  };
}

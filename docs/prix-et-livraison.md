# Prix et frais de livraison — pilotés depuis le tableau de bord

**Depuis le 27/11/2026**, le prix de vente des produits du configurateur (T-shirts, casquette,
mug) et les frais de livraison se règlent dans l'admin, sans redéploiement :

| Quoi | Où dans l'admin | Qui peut modifier |
|---|---|---|
| Prix d'un produit, statut (Test / Provisoire / Validé) | **Produits → fiche du produit → Prix et coût** | administration, finance |
| Produit actif / disponible | **Produits** (bascules) | administration, commercial |
| Frais par ville, délai maximal, statut | **Produits → Frais de livraison** | administration, finance |

Chaque modification est inscrite au journal d'audit et s'applique immédiatement :

- **au paiement MoMo** : le serveur relit les prix dans la base à **chaque** demande de paiement
  (aucun cache) ;
- **à l'affichage** (boutique, fiches, atelier, page tableaux) : les pages sont régénérées dès
  l'enregistrement (étiquette de cache `tarifs`), et au plus tard toutes les 5 minutes.

## Règles

- Le paiement en ligne n'est ouvert que pour un prix **Validé**, sur un produit **actif et
  disponible**. Sinon : « Prix sur demande » et devis / WhatsApp.
- Si le prix change entre l'affichage et le paiement, le paiement est **refusé avant tout débit**
  (« Les prix ont été mis à jour… ») : le client n'est jamais débité d'un autre montant que
  celui qu'il a vu.
- Si la base est illisible, aucun paiement n'est demandé (erreur 503) et le site affiche
  « Prix sur demande » : jamais de repli silencieux sur d'anciens prix.
- Une ville sans frais bloque la commande pour cette ville (pas de livraison gratuite par défaut).
- La casquette et le mug sont aussi soumis à la validation de leur **procédé** par l'atelier
  (`production/profils.json`) : un prix validé ne suffit pas tant que la broderie / le transfert
  (casquette) ou la sublimation (mug) sont « à valider ».

## Limites actuelles

- Les **prix de variante** (par taille ou couleur) saisis dans l'admin ne sont pas appliqués :
  le prix du produit vaut pour toutes ses variantes.
- Les **villes** desservies ne s'ajoutent pas depuis l'admin (seuls leurs frais se règlent).
- Le **barème des tableaux** (prix au m², châssis, paliers) reste dans `tarifs/grille.json`.

## `tarifs/grille.json`

Ses sections `produits` et `livraison` ne servent plus qu'au développement local et aux tests,
quand Supabase n'est pas configuré. En production, la base fait foi.

## Mise en service (ordre impératif)

1. Migrations `20261127120000_famille_objets` puis `20261127120100_tarifs_admin` sur le
   **staging**, vérification dans l'admin de staging, puis sur la **production**.
   Elles créent les fiches casquette (2 000 FCFA, validé) et mug, et alignent les T-shirts et la
   livraison sur les valeurs en vigueur (100 FCFA, validés) — seulement si ces lignes sont encore
   dans leur état de départ.
2. **Ensuite seulement**, déployer le code. Dans l'autre ordre, le site lirait des T-shirts encore
   en statut « Test » et fermerait leur paiement en ligne.
3. Contrôle : `GET /api/momo/tarifs` doit indiquer `"source": "base"` et les prix attendus.

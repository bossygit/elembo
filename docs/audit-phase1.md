# Elembo — audit Phase 1 (état réel, risques, cible)

> Audit réalisé le 9 novembre 2026 sur le dépôt `bossygit/elembo` (commit `538e719`),
> la production `https://elembo.vercel.app` et l'environnement local.
> Aucun prix, aucune clé, aucun paramètre de production n'a été modifié par cet audit.

## 1. Verdict

Le socle technique est **meilleur que ne le laisse croire le README** : le paiement MTN, la
vérification serveur du montant, le journal Redis, l'archive privée des dossiers et les tests
sont réellement opérationnels. La production encaisse en mode réel.

En revanche, **Elembo n'est pas encore une boutique** : c'est un configurateur 3D avec un tunnel
de paiement. Il manque la couche commerciale (navigation, accueil, catalogue, fiches produits,
devis), la couche de gestion (commandes, clients, production, stock, finances) et la couche de
données qui les relie. Surtout, **aucune commande n'existe en tant qu'objet** : seule la
transaction de paiement est conservée, sans nom de client, sans adresse, sans lignes de commande
détaillées pour le textile.

Deux risques doivent être traités avant toute campagne commerciale :

1. **Les prix de test sont en production** : 100 FCFA le T-shirt, 100 FCFA la livraison. Un
   client réel peut acheter à ce prix dès aujourd'hui.
2. **Un paiement confirmé peut rester sans dossier de production** : les PNG sont générés dans
   le navigateur du client *après* le paiement. Si l'onglet se ferme avant l'envoi, l'argent est
   encaissé et l'atelier n'a rien. La notification Telegram n'arrive qu'après l'envoi du dossier.

## 2. Méthode et preuves

| Vérification | Résultat réel |
|---|---|
| `npm install --include=dev` | installation OK, 18 vulnérabilités signalées par npm (dont 1 critique) |
| `npm test` | **29 fichiers, 352 tests, tous verts** |
| `npm run lint` | 0 erreur, 2 avertissements (`TableauPanel.tsx`) |
| `npm run build` | build Next.js 16.3.6 OK, 6 pages statiques, 10 routes API dynamiques |
| `GET /api/sante` (production) | `200` — `mode: reel`, `env: mtncongo`, `XAF`, `redis-tcp`, `stockageJoignable: true`, archive `blob`, notification `telegram` |
| `GET /api/momo/tarifs` (production) | `200` — T-shirts **100 FCFA**, livraison **100 FCFA**, tableaux 5 000 → 33 000 FCFA |
| `GET /` (production) | `200` — page unique : le configurateur 3D |
| `GET https://bossygit.github.io/elembo/` | `200` — ancien site statique encore accessible, sans routes API |

## 3. Ce qui fonctionne réellement

### 3.1 Configurateur et production textile

- Deux modèles 3D de T-shirts (`tshirt.glb`, `tshirt-alt/tshirt.glb`), rotation, zoom, couleurs,
  faces avant/arrière.
- Éditeur d'éléments indépendants : images et textes, 17 polices sous licence commerciale,
  position, échelle, rotation, calques, alignement, interlettrage.
- Zones d'impression physiques en centimètres, projection `decal` calibrée sur les maillages.
- Export PNG 300 dpi **par face réellement personnalisée**, recomposé depuis les paramètres
  (texte redessiné, images depuis l'original).
- Fiche de production `.txt` + `.json` avec positions en centimètres depuis le coin haut-gauche,
  tailles, quantités, couleurs, polices, avertissements de débordement.
- Contrôle de densité (dpi) et conseil de format pour les tableaux.

### 3.2 Paiement MTN MoMo

- Montant **toujours recalculé côté serveur** depuis `tarifs/grille.json` ; le montant du
  navigateur est ignoré.
- Client MTN avec cache du jeton, `requesttopay`, interrogation du statut.
- Callback non cru sur parole : re-vérification par l'API et comparaison du montant ; statut
  `ANOMALIE` si divergence.
- Prévention des doubles paiements par commande (payée / en cours < 5 min).
- Journal Redis obligatoire : sans stockage joignable, le service refuse d'encaisser (`503`).
- Mode mock pour les tests, refusé avec `MOMO_ENV=mtncongo`.
- Réconciliation périodique des transactions `PENDING`.
- Sandbox documenté (numéros et montants de test).

### 3.3 Dossier de production

- Autorisation d'envoi délivrée **uniquement si la transaction est `PAYE`**.
- Envoi direct navigateur → Vercel Blob privé (presigned), pas de limite de 4,5 Mo.
- Chemin borné à `dossiers/<commande>/`, types et tailles contrôlés, premier dépôt faisant foi.
- Métadonnées enregistrées dans Redis, notification Telegram à l'atelier.
- Routes de consultation/téléchargement protégées par `ATELIER_TOKEN`.

### 3.4 Tableaux

- 5 formats, toile seule ou châssis, bord galerie ou encadrement.
- Prix calculé (surface + montage + préparation, arrondi), remises par palier.
- Conseil de format selon la résolution de la photo.
- Fichier d'impression 150 dpi avec débords, fiche de production.

### 3.5 Qualité

- 352 tests couvrant tarification, cohérence des catalogues, transformation du design,
  export, paiement, dossier, configuration.
- Build et typecheck verts.
- Documentation technique riche (`docs/vercel.md`, `docs/momo-mtn-integration.md`,
  `docs/cahier-des-charges-prestataire-tableaux.md`).
- Séparation nette entre logique métier (`src/server/momo`, `src/lib`) et enveloppes HTTP.

## 4. Ce qui est réutilisable pour la cible

| Brique existante | Réutilisation |
|---|---|
| Configurateur 3D + éditeur 2D + export 300 dpi | cœur de la famille « personnalisation textile », à déplacer sous `/personnalisation` |
| Moteur de prix `tarifs/grille.json` | source unique à étendre (statut de prix, coûts, variantes, remises) |
| Service MoMo (`src/server/momo`) | conservé tel quel ; à relier à une vraie commande |
| Store Redis | journal de paiement et verrous ; **pas** le système de référence commercial |
| Archive Blob privée | dossiers de production, à compléter par une régénération serveur |
| Fiche de production | base du dossier atelier, à enrichir (matière, technique, partenaire) |
| Tableaux (formats, prix, débords) | famille « impression graphique » |
| Tests et conventions | à étendre, jamais à contourner |

## 5. Ce qui est à corriger

### P0 — avant toute vente réelle

| # | Constat | Preuve | Correction |
|---|---|---|---|
| P0-1 | Prix de test en production (100 FCFA produit et livraison) | `/api/momo/tarifs` | ajouter un statut de prix ; bloquer le paiement d'un prix non validé ; rétablir 1 000 / 2 000 FCFA pour la livraison après validation |
| P0-2 | Paiement possible sans dossier de production | génération navigateur après `PAYE` | créer la commande côté serveur avant paiement ; régénérer ou au moins alerter si le dossier manque ; rendre le dossier obligatoire |
| P0-3 | Aucune commande client (nom, adresse, lignes) | payload `payer` = téléphone + produit + tailles | modèle `orders` + `order_items` + `customers`, migration SQL |
| P0-4 | Journal Redis « RAM only », sans sauvegarde | `docs/vercel.md` §4 | sauvegarde/export quotidien ou bascule du journal vers Postgres |
| P0-5 | Aucune authentification administrateur (il n'y a pas d'admin) | absence de routes `/admin` | auth + rôles avant d'exposer le back-office |

### P1 — sécurité et fiabilité

| # | Constat | Correction |
|---|---|---|
| P1-1 | `ATELIER_TOKEN` accepté en paramètre d'URL (fuite par logs/referrer) | en-tête uniquement, comparaison à temps constant |
| P1-2 | Callback peut répondre `502` si MTN échoue, alors qu'il doit toujours répondre `200` | envelopper et journaliser, répondre `200` |
| P1-3 | Comparaison de montant en chaînes (`"100.0"` ≠ `"100"`) | comparaison numérique |
| P1-4 | Référence de commande cliente non validée (longueur, caractères) | motif strict + rejet `422` |
| P1-5 | Aucun en-tête de sécurité (nosniff, frame, HSTS, referrer) | `headers()` dans `next.config.ts` |
| P1-6 | Aucune limitation de débit sur `/payer` et `/statut` | limite par IP + commande (Redis), phase 3 |
| P1-7 | `MOMO_MOCK=1` possible en production si `MOMO_ENV=sandbox` | exiger `VERCEL_ENV=preview` ou un drapeau explicite |
| P1-8 | Aucune sauvegarde/export du journal Redis | export CSV/JSON planifié |
| P1-9 | Fichiers de production déposés par le client, métadonnées non signées | jeton de dépôt lié à la transaction, phase 3 |
| P1-10 | Aucune CSP | phase 3, avec nonce (Next 16) après stabilisation |

### P2 — cohérence documentaire et produit

| # | Constat | Correction |
|---|---|---|
| P2-1 | README : « Pas de paiement… » alors que le paiement est en production | corriger |
| P2-2 | README : « 339 tests » alors que 352 passent | corriger |
| P2-3 | README : « 100 % client-side, rien n'est stocké » alors que Redis + Blob sont utilisés | corriger |
| P2-4 | README : « modèle 3D placeholder », « pas de catalogue multi-produits » | corriger |
| P2-5 | `docs/vercel.md` : réconciliation « chaque minute », `vercel.json` = une fois par jour | aligner et expliquer la limite Hobby |
| P2-6 | `src/lib/payment/momo.ts` : commentaire « service tourne ailleurs » | corriger |
| P2-7 | `src/lib/products/tableaux.ts` : commentaire « copie dans momo-service » | corriger |
| P2-8 | `design-system/elembo/MASTER.md` : palette « Pharmacy green » contraire à la marque | marquer comme superseded, pointer vers les jetons réels |
| P2-9 | Page `/studio` : promesse « 24h-48h » alors que le tunnel annonce jusqu'à 3 jours | aligner |
| P2-10 | Casquette présentée comme produit alors qu'aucun accessoire presse n'existe | marquer indisponible, ne pas vendre |
| P2-11 | `globals.css` : mode sombre qui inverse le fond sans adapter les composants | retirer ou traiter complètement |
| P2-12 | Aucune page légale (CGV, confidentialité, mentions), aucun sitemap/robots | phase 2 |

## 6. Ce qui manque par rapport à la cible

| Domaine | État | Écart |
|---|---|---|
| Navigation publique | inexistante | 7 pages à créer |
| Accueil commercial | inexistant | proposition de valeur, familles, produits, preuves, process, CTA |
| Catalogue | 2 T-shirts + tableaux techniques | fiches commerciales, variantes, images, disponibilité, délais, quantités minimales |
| Impression graphique | tableaux seulement | flyers, affiches, cartes, menus, brochures, dépliants, finitions, fichier prêt |
| Devis | inexistant | formulaire, fichiers, suivi, prix validé, transformation en commande |
| Entreprises | inexistant | page, formulaire, commandes récurrentes |
| Commande | transaction de paiement | objet commande, statuts, historique, notes, export |
| Back-office | inexistant | dashboard, commandes, produits, devis, production, clients, stock, finances |
| Production | dossier déposé par le client | vue atelier, étapes, partenaire, BAT, contrôle qualité, livraison |
| Partenaires | inexistant | fiche, spécialité, tarifs, délais, historique, coût par commande |
| Stock | inexistant | entrées/sorties, seuil, valeur, mouvements |
| Finances | inexistant | CA commandé/encaissé, restes dus, coûts, marge, dépenses, budget 500 000 FCFA |
| Rôles | inexistant | admin, commercial, atelier, finance |
| Notifications client | inexistantes | confirmation, statut, BAT, livraison |
| Airtel Money | inexistant | abstraction prête, non activée |
| Livraison | 2 villes, tarif test | zones, tarifs configurables, statut de livraison |
| Légal / SEO | absent | CGV, confidentialité, mentions, sitemap, OG |

## 7. Risques techniques détaillés

1. **Perte de données commerciales** : Redis RAM-only, un seul hash, pas d'export. Une panne ou
   une réinitialisation de l'instance efface l'historique des paiements. Le registre local
   `~/.elembo/.../transactions.json` n'est plus alimenté.
2. **Commande non reconstructible** : la fiche de production est produite par le navigateur. Le
   serveur ne connaît ni le design, ni les textes, ni les fichiers avant l'envoi. Impossible de
   régénérer un dossier perdu.
3. **Confiance dans le client** : la référence de commande, les lignes et le téléphone viennent
   du navigateur. Le montant est recalculé (bien), mais l'identité et l'adresse n'existent pas.
4. **Prix** : un prix de test peut devenir un prix public par simple oubli. Aucun statut ne
   distingue provisoire / test / validé.
5. **Production** : DTF sous-traité, pressage interne, finitions sous-traitées, aucun partenaire
   enregistré, aucun coût, aucun délai engagé.
6. **Sécurité** : pas de back-office donc pas encore de surface d'administration, mais le jour où
   elle arrive, une simple route non protégée exposerait toutes les commandes. Les rôles doivent
   être posés avant le premier écran admin.
7. **Exploitation** : réconciliation quotidienne seulement (Hobby), pas d'alerte si un paiement
   `PAYE` n'a pas de dossier, pas de supervision des erreurs Telegram/Blob.
8. **Juridique** : vente à distance sans CGV, sans politique de confidentialité, sans mentions
   légales ; données personnelles (téléphone, adresse) à protéger.
9. **Qualité perçue** : aucune photo réelle de production, mockups placeholders ; l'accueil
   actuel est un outil technique, pas une vitrine.
10. **Dépendances** : `npm audit` signale 18 vulnérabilités (1 critique). À trier avant mise en
    production élargie ; ne pas lancer `npm audit fix --force` sans vérifier les montées de
    version (Next/React).

## 8. Architecture cible proposée

```
                        ┌──────────────────────────────────────────────┐
  Public                │  Next.js 16 (App Router) — Vercel            │
  /  /boutique          │  Pages publiques + composants serveur        │
  /personnalisation     │                                              │
  /impression           │  ┌───────────────┐   ┌────────────────────┐  │
  /entreprises          │  │ Domaine       │   │ Back-office        │  │
  /devis  /contact      │  │ commercial    │   │ /admin (rôles)     │  │
                        │  │ (services)    │   │                    │  │
                        │  └───────┬───────┘   └─────────┬──────────┘  │
                        └──────────┼─────────────────────┼─────────────┘
                                   │                     │
                 ┌─────────────────┼─────────────────────┼──────────────┐
                 │                 │                     │              │
          Postgres (Supabase)   Redis (Upstash)     Vercel Blob     MTN MoMo
          clients, commandes    paiements en cours   dossiers        requesttopay
          devis, produits       verrous, files       privés          statut
          stock, coûts, marges  réconciliation
          partenaires, audit
```

### Principes

- **Postgres est le système de référence** pour les clients, commandes, devis, produits, stock,
  dépenses et partenaires. Redis reste le journal rapide des paiements et des verrous.
- **La commande existe avant le paiement.** Le navigateur décrit ; le serveur crée une commande
  `BROUILLON`, calcule le montant, puis attache la transaction MTN. Un paiement ne crée jamais
  une commande à lui seul.
- **Le dossier de production est serveur.** À terme, le design est sérialisé et le serveur peut
  régénérer les PNG ; au minimum, le dossier manquant déclenche une alerte et une tâche atelier.
- **Prix en entiers FCFA**, jamais de flottants. Statut explicite : `test`, `provisoire`,
  `valide`. Seul `valide` est facturable publiquement.
- **Rôles** : `admin`, `commercial`, `atelier`, `finance`, vérifiés côté serveur à chaque route.
- **Migrations SQL versionnées** (`supabase/migrations/*.sql`), pas de schéma implicite.
- **Aucun secret côté navigateur** ; les clés MTN et service role restent dans l'environnement
  serveur.

### Modèle de données cible (première version)

```
customers(id, type, nom, societe, email, telephone, adresse, ville, notes, cree_le)
products(id, famille, nom, description, technique, disponible, statut_prix, prix_fcfa,
         cout_fcfa, delai_jours, quantite_min, actif)
product_variants(id, product_id, taille, couleur, sku, stock, seuil_alerte)
orders(id, reference, customer_id, statut, statut_paiement, statut_production,
       statut_livraison, sous_total_fcfa, livraison_fcfa, total_fcfa, cout_fcfa,
       marge_fcfa, ville, adresse, notes, cree_le, maj_le)
order_items(id, order_id, product_id, variant_id, quantite, prix_unitaire_fcfa,
            cout_unitaire_fcfa, designation, options_json)
order_files(id, order_id, nom, chemin, type, taille, kind, cree_le)
payments(id, order_id, reference_id, montant_fcfa, devise, statut, financial_tx_id,
         msisdn, cree_le, maj_le)
quotes(id, reference, customer_id, famille, besoin, format, quantite, fichier_url,
       statut, montant_propose_fcfa, prix_valide, date_relance, cree_le)
production_jobs(id, order_id, statut, partenaire_id, date_prevue, instructions,
                cout_fcfa, termine_le)
partners(id, nom, specialite, telephone, email, tarifs_json, delai_jours, notes)
inventory_movements(id, product_id, variant_id, type, quantite, cout_unitaire_fcfa,
                    motif, order_id, cree_le)
expenses(id, categorie, libelle, montant_fcfa, date, justificatif_url, budget_ligne)
budget_lines(id, libelle, montant_prevu_fcfa, reserve, categorie)
audit_log(id, acteur, action, entite, entite_id, avant_json, apres_json, cree_le)
```

### Décisions à valider

1. **Supabase** comme Postgres managé (auth + RLS + migrations). Coût : offre gratuite puis
   ~25 $/mois. Alternative : Neon (Postgres seul) + Auth.js. Recommandation : Supabase.
2. **Prix commerciaux** : T-shirts, tableaux et livraison à arbitrer avant activation publique.
   Sans cela, la boutique affiche « prix sur demande » et ne facture pas.
3. **Numéro WhatsApp professionnel** : absent du dépôt. À fournir pour les CTA et les
   notifications client.
4. **Photos réelles** : mockups actuels = placeholders. Fournir les visuels atelier/produits.
5. **Adresse de l'atelier** et modalités de retrait/livraison à publier.

## 9. Conclusion

La Phase 1 ne consiste pas à réécrire : elle consiste à **arrêter de présenter comme acquis ce
qui ne l'est pas**, à **protéger l'encaissement existant**, et à **poser les fondations
commerciales**. Le socle de paiement et de personnalisation est conservé ; tout le reste est
additif.

## 10. Correctifs et livrables de ce lot (9 novembre 2026)

### 10.1 Fiabilisation et sécurité

- **Prix de test bloqués côté serveur** : `POST /api/momo/payer` répond `422` pour un prix
  `test` ou `provisoire`, même si le bouton est contourné. Dérogation explicite :
  `MOMO_ALLOW_TEST_PRICES=1` (serveur) + `NEXT_PUBLIC_PAIEMENT_TEST=1` (bouton).
- **Statut de prix explicite** dans `tarifs/grille.json` : T-shirts `test`, tableaux
  `provisoire`, livraison `test`. La vitrine affiche « Prix sur demande » tant que le statut
  n'est pas `valide`.
- **Jeton atelier** : en-tête `x-atelier-token` uniquement (le paramètre `?token=` est refusé),
  comparaison à temps constant.
- **Callback MTN** : répond toujours `200`, même si la vérification échoue ; la transaction
  reste `PENDING` pour la réconciliation.
- **Montant** : comparaison numérique (`300.0` = `300`), plus de fausse `ANOMALIE`.
- **Référence de commande** : motif strict (6–40 caractères, pas de `/` ni `..`), validée dans
  `payer`, l'envoi et le téléchargement des dossiers.
- **En-têtes de sécurité** : `nosniff`, `DENY` frame, `Referrer-Policy`, `Permissions-Policy`,
  HSTS en production, `Cache-Control: no-store` sur `/api/*`, `poweredByHeader: false`.
- **Documentation** : README, `docs/vercel.md`, commentaires de `momo.ts` / `tableaux.ts`,
  avertissement sur `design-system/elembo/MASTER.md`.

### 10.2 Vitrine commerciale

- Jetons de marque dans `globals.css` (orange, violet, crème, texte atténué, filets).
- Shell public : en-tête sticky, menu mobile, pied de page, lien d'évitement, focus visible.
- Pages `/`, `/boutique`, `/personnalisation`, `/impression`, `/entreprises`,
  `/comment-ca-marche`, `/contact`, `/tableau`, `not-found`.
- `/` ne porte plus seul le configurateur : il est déplacé sur `/personnalisation` ;
  `/configurator` redirige.
- Photos de mockups Pexels (licence commerciale, crédits dans
  `public/mockups/CREDITS.md`) en remplacement des aplats du studio sur la vitrine.
- `sitemap.xml`, `robots.txt`, métadonnées Open Graph.

### 10.3 Preuves

| Vérification | Résultat |
|---|---|
| `npm test` | **39 fichiers passés + 2 suites ignorées, 408 tests verts + 18 tests d’intégration ignorés** (projet Supabase de test non fourni) |
| `npm run lint` | 0 erreur, 2 avertissements préexistants (`TableauPanel.tsx`) |
| `npm run build` | build Next.js 16.3.6 OK, 15 pages statiques + routes API |
| Routes publiques | `/`, `/boutique`, `/personnalisation`, `/impression`, `/entreprises`, `/comment-ca-marche`, `/contact`, `/tableau`, `/studio` → `200` |
| Mobile 390 px | aucune largeur débordante (`scrollWidth = clientWidth`), menu testé, navigation testée |
| Bouton de paiement | absent sur `/personnalisation` tant que le prix est `test` ; message et lien de devis affichés |
| Production | **aucun déploiement effectué** ; les vérifications production sont en lecture seule |

### 10.4 Ce qui reste explicitement à faire

- Base Postgres/Supabase, commandes, clients, devis persistés (lots 3.1–3.5).
- Back-office, rôles, production, partenaires, stock, finances (lots 3.3–4.3).
- Formulaire de devis avec fichiers (lot 2.2).
- Régénération serveur des dossiers de production (P0-2).
- Sauvegarde/export du journal Redis (P0-4).
- Prix commerciaux validés (P0-1) : sans eux, le paiement reste fermé — c'est voulu.


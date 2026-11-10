# Elembo — plan d'implémentation par lots

> Découle de `docs/audit-phase1.md`. Chaque lot est livrable seul, testé et buildé.
> Règle : aucune fonctionnalité n'est annoncée terminée si elle n'est pas exercée par un test
> ou une vérification réelle. Aucune fonctionnalité existante n'est supprimée sans justification.

## Vue d'ensemble

| Phase | Lot | Contenu | Dépend de | État |
|---|---|---|---|---|
| 1 | 1.1 | Audit, état des lieux, plan | — | livré |
| 1 | 1.2 | Vérité documentaire (README, docs, commentaires) | 1.1 | livré |
| 1 | 1.3 | Durcissement sécurité (headers, token, callback, référence, montant) | 1.1 | livré |
| 1 | 1.4 | Tests + build de référence | 1.2, 1.3 | livré |
| 2 | 2.1 | Jetons de design, shell public, accueil, boutique, pages familles, mobile | 1.4 | livré |
| 2 | 2.2 | Devis : formulaire, fichiers, persistance, notification, suivi | 2.1 + décision stockage | actif en production le 2026-11-10 (`elembo-production`, migrations 0001 → 0009) |
| 2 | 2.3 | Catalogue imprimé détaillé (formats, papiers, finitions, fichier prêt) | 2.2 | à faire |
| 2 | 2.4 | SEO, pages légales, accessibilité, analytics | 2.1 | à faire |
| 3 | 3.1 | Postgres Supabase, migrations, repository, seed | décision Supabase | migrations 0001 → 0009 appliquées sur `elembo-staging` et `elembo-production` |
| 3 | 3.2 | Commande serveur : création avant paiement, clients, lignes, fichiers | 3.1 | à faire |
| 3 | 3.3 | Auth + rôles + back-office (dashboard, commandes, clients, devis) | 3.1 | à faire |
| 3 | 3.4 | Production : dossiers, étapes, partenaires, BAT, contrôle qualité | 3.2, 3.3 | à faire |
| 3 | 3.5 | Produits, variantes, disponibilité, stock | 3.1, 3.3 | à faire |
| 4 | 4.1 | Coûts, dépenses, marges, budget de lancement 500 000 FCFA | 3.2, 3.5 | à faire |
| 4 | 4.2 | Stock : mouvements, seuils, valorisation | 3.5 | à faire |
| 4 | 4.3 | Rapports mensuels exportables | 4.1, 4.2 | à faire |
| 5 | 5.1 | Comptes clients, historique, commandes récurrentes | 3.2, 3.3 | à faire |
| 5 | 5.2 | Notifications client, conversion, relances | 3.3 | à faire |
| 5 | 5.3 | Abstraction Airtel Money (non activée) | 3.2 | à faire |

---

## Phase 1 — Audit et fiabilisation

### Lot 1.1 — Audit

**Livrable** : `docs/audit-phase1.md` (état réel, preuves, risques, cible, décisions à valider).

**Critère d'acceptation** : chaque affirmation est adossée à une commande, une réponse HTTP ou
un fichier du dépôt ; les fonctionnalités non opérationnelles sont explicitement listées.

### Lot 1.2 — Vérité documentaire

**Fichiers** : `README.md`, `docs/vercel.md`, `design-system/elembo/MASTER.md`,
`src/lib/payment/momo.ts`, `src/lib/products/tableaux.ts`, `src/app/studio/page.tsx`.

**Changements** :
- README : retirer « pas de paiement », « 100 % client-side », « 339 tests », « modèle
  placeholder », « pas de catalogue multi-produits » ; décrire l'état réel (352 tests, paiement
  réel, archive privée, limites).
- `docs/vercel.md` : réconciliation = cron quotidien (plan Hobby), plus l'interrogation de statut
  côté navigateur ; ne pas promettre « chaque minute ».
- `MASTER.md` : bandeau « document généré obsolète — palette Pharmacy rejetée ; la référence est
  `docs/design-system-elembo.md` et `globals.css` ».
- Commentaires de `momo.ts` et `tableaux.ts` : service dans l'application, grille unique.
- `/studio` : délai « jusqu'à 3 jours », pas « 24h-48h ».

**Critère** : aucune contradiction entre README, docs et code sur les points ci-dessus.

### Lot 1.3 — Durcissement

**Fichiers** : `next.config.ts`, `src/server/security/token.ts` (nouveau),
`src/server/momo/reference.ts` (nouveau), `src/server/momo/service.ts`,
`src/app/api/commandes/[commande]/fichiers/route.ts`,
`src/app/api/commandes/[commande]/fichiers/[nom]/route.ts`,
`src/app/api/commandes/[commande]/upload/route.ts`, `.env.example`.

**Changements** :
1. En-têtes de sécurité : `X-Content-Type-Options`, `X-Frame-Options: DENY`,
   `Referrer-Policy`, `Permissions-Policy`, HSTS en production, `poweredByHeader: false`.
2. `Cache-Control: no-store` sur `/api/*`.
3. `ATELIER_TOKEN` : en-tête uniquement, comparaison à temps constant (SHA-256 +
   `timingSafeEqual`).
4. Callback MTN : toujours `200`, même si la vérification échoue ; l'échec est journalisé et
   la transaction reste `PENDING` pour la réconciliation.
5. Référence de commande : motif `[A-Za-z0-9][A-Za-z0-9_-]{5,39}`, rejet `422` sinon, dans
   `payer` et dans les routes de dossier.
6. Montant : comparaison numérique, pas textuelle.
7. `.env.example` : ajouter `CRON_SECRET` et l'avertissement sur `MOMO_MOCK` en production.

**Tests** : `tests/securityToken.test.ts`, `tests/momoReference.test.ts`,
`tests/momoCallbackRobustesse.test.ts`.

**Critère** : tests verts, build vert, un callback en erreur MTN renvoie `200`, un token en query
est refusé.

### Lot 1.4 — Vérification

`npm test`, `npm run lint`, `npm run build`, et vérification production en lecture seule
(`/api/sante`, `/api/momo/tarifs`). Aucun paiement réel déclenché.

---

## Phase 2 — Fondations commerciales

### Lot 2.1 — Vitrine et navigation

**Objectif** : une boutique crédible, mobile-first, sans toucher au tunnel de paiement.

**Pages** :
- `/` accueil : promesse, 3 familles, produits populaires, personnalisation, entreprises,
  processus, appels à l'action.
- `/boutique` : catalogue unifié (textile, tableaux, impression), filtres par famille.
- `/personnalisation` : configurateur 3D existant, déplacé ici ; `/` ne le porte plus seul.
- `/impression` : flyers, affiches, cartes, menus, brochures, dépliants ; options ; CTA devis.
- `/entreprises` : identité, supports, textiles en quantité, événementiel, récurrence ; CTA.
- `/comment-ca-marche` : les étapes, les délais, les modes de paiement et de livraison.
- `/contact` : email, atelier, horaires, FAQ courte.
- `/tableau` : studio 2D prépositionné sur le tableau (sans casser `/studio`).
- `/configurator` : redirection vers `/personnalisation`.

**Design** : jetons `--marque-orange #E85F00`, `--action-orange #C75100`,
`--encre-violet #200233`, `--fond-creme #FEFCF6`, `--texte-attenue #5B5B6B`,
`--bordure-active #8A86A0`, `--filet #E0DBD0` ; Geist pour l'interface, Playfair Display pour
les titres ; pas de dégradés, pas d'emojis-icônes, focus visible, `prefers-reduced-motion`.

**Prix** : un produit dont le prix n'est pas `valide` affiche « Prix sur demande » et un CTA de
devis — jamais un prix de test. Le configurateur reste accessible pour les essais encadrés.

**Critère** : build vert, rendu vérifié en 390 px et 1440 px, navigation sans impasse, aucun
lien mort, contrastes texte ≥ 4,5:1.

### Lot 2.2 — Devis

**Prérequis** : décision de stockage (Supabase recommandé ; Redis en transition si le projet
Supabase n'est pas encore disponible).

**Contenu** :
- Modèle `Quote` + validation pure (nom, contact, famille, besoin, quantité, format, fichiers).
- Formulaire `/devis` avec upload de fichiers (Blob privé) et consentement.
- API `POST /api/devis` : validation, persistance, référence `DEV-…`, notification atelier.
- Page de confirmation avec référence et prochaine étape.
- Suivi interne minimal (statut `NOUVEAU`, `EN_ANALYSE`, `PROPOSE`, `ACCEPTE`, `REFUSE`).
- Un devis accepté conserve son prix, même si la grille change.

**État** : implémenté dans `docs/devis-lot-2.2.md` : formulaire, API, sessions révocables,
OTP, upload vérifié, notifications en outbox, back-office `/admin/devis`. Les migrations
0001 → 0009 sont appliquées sur `elembo-staging` et sur `elembo-production`
(`ogshtnmbeequefisqwcz`, `eu-west-3`). Les variables Supabase, les secrets HMAC et le compte
staff `admin@smartvision.cg` sont en place ; le formulaire est actif sur
`https://elembo.vercel.app/devis` (voir `docs/supabase-production.md`). Aucun email n'est envoyé
faute de `RESEND_API_KEY` : les messages restent dans l'outbox, la notification staff passe par
Telegram. L'antivirus n'est pas configuré : les fichiers restent `NON_ANALYSE` et non
téléchargeables.

**Critère** : une demande réelle apparaît dans le stockage, l'atelier est notifié, le client
reçoit une référence ; aucun prix inventé ; test de validation et d'injection.

### Lot 2.3 — Catalogue imprimé

- Familles : flyers, affiches, cartes de visite, menus, invitations, brochures, dépliants.
- Options : format, quantité, papier, recto/verso, finitions, fichier prêt ou création.
- Prix uniquement si validés ; sinon devis.
- Fiche technique téléchargeable (format, fond perdu, resolution, CMJN) pour les clients qui
  fournissent un fichier.

**Critère** : chaque option est enregistrée dans la demande ; aucun tarif non validé facturé.

### Lot 2.4 — SEO, légal, accessibilité

- `sitemap.ts`, `robots.ts`, métadonnées par page, Open Graph.
- CGV, politique de confidentialité, mentions légales.
- Audit contrastes, navigation clavier, labels, `aria-live` sur les formulaires.
- Analytics respectueux (Plausible ou GA4 avec consentement) — décision à valider.

---

## Phase 3 — Gestion opérationnelle

### Lot 3.1 — Socle Postgres

> Schéma SQL proposé, corrigé et testé : `docs/supabase-architecture.md`, `docs/supabase-securite.md`,
> `docs/paiements-robustesse.md`, `docs/fichiers-production.md` et `supabase/migrations/`.
> Les migrations ont des versions uniques et passent `supabase db reset` sur une instance
> locale vierge. Les 0001 → 0007 sont appliquées sur `elembo-staging`.

- Projet Supabase, migrations SQL versionnées (0001 → 0006).
- Couche repository (`src/server/db/*`) : aucune requête SQL dans les composants.
- Seed des produits et de la grille depuis `tarifs/grille.json`.
- RLS activée ; service role uniquement côté serveur.
- Tests : 18 tests d'intégration RLS/cycle de vie verts en local, 14 garde-fous de schéma.
- Garde de rôle `src/server/auth/roles.ts` livré ; routes admin à brancher au lot 3.3.
- Robustesse paiement : `paiement_evenements` et `taches_reconciliation` livrés ; worker à
  brancher au lot 3.2.

**Décision tranchée le 2026-11-10** : projet `elembo-production` (`ogshtnmbeequefisqwcz`, `eu-west-3`)
créé, migrations appliquées, variables Vercel en place — voir `docs/supabase-production.md`.

### Lot 3.2 — Commande serveur

- `POST /api/commandes` crée une commande `BROUILLON` avec client, lignes, options, fichiers.
- Le montant est recalculé par le serveur ; la commande conserve le prix convenu.
- `POST /api/momo/payer` reçoit `orderId` (ou référence), vérifie la commande, crée la
  transaction et l'attache.
- Statuts : brouillon, en attente de validation, en attente de paiement, payée, à produire,
  en production, contrôle qualité, prête, en livraison, livrée, annulée, remboursement.
- Transitions contrôlées par une machine à états testée.
- Un paiement confirmé ne passe jamais directement à « produite ».

### Lot 3.3 — Auth et back-office

- Supabase Auth (email/mot de passe + magic link), rôles `admin`, `commercial`, `atelier`,
  `finance` dans `app_metadata`.
- `/admin` inaccessible sans session + rôle ; vérification serveur dans le layout et chaque
  route.
- Dashboard : CA commandé/encaissé, commandes par statut, devis, top produits, alertes stock.
- Commandes : liste, recherche, filtres, fiche, historique, notes, export CSV.
- Clients : coordonnées, historique, total dépensé, type particulier/pro.
- Devis : réception, analyse, proposition, acceptation, transformation en commande.
- Journal d'audit pour chaque changement de statut.

### Lot 3.4 — Production et partenaires

- Vue atelier : commandes à produire, dossier, fichiers, fiche technique, quantités, tailles,
  couleurs, instructions, partenaire, date prévue, état.
- Partenaires : nom, contacts, spécialité, tarifs négociés, délais, historique, coût.
- Étapes internes vs sous-traitées (DTF, finitions, montage châssis).
- Alerte si un paiement `PAYE` n'a pas de dossier après N minutes.
- BAT et contrôle qualité.

### Lot 3.5 — Produits, variantes, stock

- CRUD produits, catégories, variantes, tailles, couleurs, images, prix, coûts, délais, stock,
  disponibilité.
- Un produit sans prix validé ne peut pas être activé à la vente.
- Mouvements de stock (entrée, sortie, ajustement) et seuil d'alerte.

---

## Phase 4 — Gestion financière

### Lot 4.1 — Coûts, dépenses, marges

- Coûts directs par commande : textiles vierges, DTF, flex, sous-traitance, emballage, paiement,
  livraison.
- Dépenses opérationnelles : publicité, transport, outils, autres.
- Marge brute par commande et par produit.
- Distinction CA commandé / CA encaissé / reste dû / marge / résultat estimé.
- Budget de lancement : 500 000 FCFA, dont 415 000 opérationnels et 85 000 de réserve
  protégée (non dépensable sans décision explicite).
- Justificatifs et solde par catégorie.

### Lot 4.2 — Stock valorisé

- Entrées/sorties, stock disponible, seuil, valeur au coût, historique.

### Lot 4.3 — Rapports mensuels

- Export CSV/PDF : ventes, encaissements, coûts, marge, dépenses, stock, budget.
- Rapprochement MTN (montant attendu / encaissé / commission).

---

## Phase 5 — Optimisation commerciale

- Comptes clients, historique, réachat.
- Commandes récurrentes (écoles, églises, entreprises, restaurants).
- Notifications client (confirmation, production, livraison) — email/WhatsApp.
- Relances de devis, taux de conversion, panier moyen.
- Préparation Airtel Money derrière une abstraction, sans activation prématurée.

---

## Dépendances et décisions bloquantes

| Décision | Impact | Contournement |
|---|---|---|
| Projet Supabase (URL + clés) | lots 3.1 à 3.5, 4.x | **fourni le 2026-11-10** : `elembo-production`, formulaire de devis actif |
| Prix commerciaux validés | affichage et facturation | « Prix sur demande » + devis |
| Numéro WhatsApp professionnel | CTA, notifications | email `store@smartvision.cg` en attendant |
| Photos réelles atelier/produits | crédibilité de la vitrine | mockups actuels, signalés comme visuels de travail |
| Adresse atelier / modalités de retrait | page contact, livraison | « communiquée sur rendez-vous » |
| Prestataire DTF et finitions (tarifs, délais) | coûts, marges, production | champs vides, aucun coût inventé |

## Règles de livraison (toutes phases)

1. Un lot = un diff cohérent, testé, buildé.
2. Les tests existants ne sont jamais supprimés pour faire passer un build.
3. Aucun paiement réel pendant les tests.
4. Aucun secret dans les logs, les captures ou le dépôt.
5. Toute fonctionnalité maquettée est annoncée comme telle.
6. Toute donnée affichée comme réelle provient d'une source réelle.
7. Le déploiement en production reste une décision explicite.

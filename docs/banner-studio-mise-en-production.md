# Banner Studio — mise en production

Procédure et liste de contrôle pour ouvrir le Banner Studio au public. Référence technique :
[`banner-studio.md`](banner-studio.md). Hébergement : [`vercel.md`](vercel.md) ; base :
[`supabase-production.md`](supabase-production.md).

État au 26 novembre 2026 : lots 1 à 7 fusionnés dans `main` (`9a89516`) et déployés, migrations appliquées en staging
et en production. **Studio ouvert au public le 26 novembre 2026** (`NEXT_PUBLIC_BANNER_STUDIO=1` en Production),
**avant** l'imprimeur pilote, par décision de Smart Vision : les étapes du §5 restent à faire, les profils publics sont
toujours « à valider » et chaque PDF doit être contrôlé par l'équipe avant production.

## 1. Principe

Le Studio part en production **fermé**. Fusionner la branche dans `main` ne change rien pour les clients : le formulaire
de banderole fonctionne comme avant, le Studio n'est proposé nulle part et n'est pas indexé. On l'ouvre ensuite par une
variable, après les tirages de l'imprimeur pilote. On le referme de la même façon.

## 2. Ce qui est déjà en place

| Élément | Staging | Production |
|---|---|---|
| Migration `20261125120000_banner_studio_fichiers` (fichiers du Studio, bucket `devis`) | appliquée | appliquée |
| Migration `20261125130000_banner_studio_visuels` (`visuels_banderole`, RPC de rendu) | appliquée | appliquée |
| Migration `20261126120000_banner_studio_profils` (`profils_impression`, archivage) | appliquée | appliquée |
| Six profils publics | « à valider » | « à valider » |
| Polices du PDF embarquées dans les fonctions | vérifié sur le build (39 fichiers par route) | idem |

Aucune nouvelle variable secrète : le Studio réutilise celles du devis (`SUPABASE_*`, `DEVIS_*`, `REDIS_URL`,
`APP_ORIGINS`, `TELEGRAM_*`).

## 3. Avant la fusion dans `main`

- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run lint` sur la branche : au vert.
- [ ] `npm run build` local : au vert.
- [ ] Parcours complet en local sur un build de production : `scripts/e2e/banner-parcours.mjs` (95 contrôles),
      accessibilité (`banner-accessibilite.mjs`), performances (`banner-performance.mjs`) et formulaire
      (`banderoles.mjs`). Commandes : [`banner-studio.md` §11](banner-studio.md#11-suivi-reprise-et-recette-lot-7).
- [ ] **Aperçu Vercel de la branche** : vérifier que ses variables Preview visent le **staging**
      (`NEXT_PUBLIC_SUPABASE_URL` = `https://wbbvpslpagptvlnvhiqo.supabase.co` et les clés du staging). Sinon, un essai
      sur l'aperçu écrirait dans la production. L'aperçu est protégé par l'authentification Vercel : l'ouvrir connecté
      au compte de l'équipe.
- [ ] Sur l'aperçu, avec `NEXT_PUBLIC_BANNER_STUDIO=1` en Preview : une demande complète depuis un vrai téléphone
      (Android et, si possible, iPhone avec Safari). Les essais automatiques n'ont tourné que dans Chrome.
- [ ] Rien d'important dans les journaux de l'aperçu (§7).

## 4. Fusion (Studio fermé)

1. Fusionner `feature/banner-studio` dans `main` (pas la branche `spike/…`). Pousser `main` déploie la production.
2. Contrôles juste après le déploiement :
   - [ ] `/banderoles` ne montre **pas** « Créer mon visuel en ligne » ;
   - [ ] `/banderoles/commander` : une demande classique avec un fichier passe ;
   - [ ] `/banderoles/studio` répond et porte `noindex` (code source : `<meta name="robots" content="noindex…">`) ;
   - [ ] `GET /api/banderoles/profils` renvoie six profils publics ;
   - [ ] back-office : la fiche d'une banderole s'ouvre, « Profils d'impression » est au menu.

## 5. Avec l'imprimeur pilote

C'est la condition de l'ouverture. Sans elle, les marges, ourlets, œillets et la netteté demandée aux photos sont des
valeurs prudentes, pas celles de l'atelier.

1. **Profil** : dans *Back-office → Banderoles → Profils d'impression*, créer le profil de l'imprimeur pour chaque
   support qu'il fait (prérempli depuis le profil public et sa capacité Elembo Partners). Saisir avec lui marges, ourlets,
   espacement et diamètre des œillets, laize, longueur maximale, découpe en lés, fond perdu, définition attendue.
2. **Validation** : cocher « l'imprimeur a confirmé ces valeurs » ; la validation est enregistrée au nom de la personne.
   Valider aussi, ou corriger, les **profils publics** : ce sont eux que voit un client avant l'affectation.
3. **Tirages d'essai**, depuis le Studio, avec une vraie photo de téléphone :
   - [ ] banderole 3 × 1 m, œillets, un modèle avec photo ;
   - [ ] banderole 6 × 1 m (au-delà de la laize : découpe en lés et repères) ;
   - [ ] une bâche ou un kakémono si l'imprimeur en fait.
   Vérifier sur le tirage : dimensions finies, ourlets et œillets hors du texte, couleurs, netteté de la photo, raccord
   des lés, lisibilité du texte à la distance prévue.
4. **Seuils de netteté** : faire confirmer par l'imprimeur les seuils par distance de lecture
   (1 m : 150/300 dpi, 3 m : 72/150, 10 m : 30/72). Les changer est une modification de code
   (`src/lib/banner/quality.ts`) : prévoir un déploiement.
5. **Modèles** : Smart Vision relit les modèles (textes, orthographe, usages, photos d'exemple) dans le Studio.

## 6. Ouverture

1. Vercel → *Settings → Environment Variables* : `NEXT_PUBLIC_BANNER_STUDIO` = `1`, environnement **Production**.
2. Redéployer la production (la variable est lue au build ; un simple enregistrement ne suffit pas).
3. Contrôles :
   - [ ] `/banderoles` montre « Créer mon visuel en ligne » ;
   - [ ] le formulaire propose le Studio à l'étape Fichiers ;
   - [ ] `/banderoles/studio` n'a plus `noindex` ;
   - [ ] une vraie demande de bout en bout, PDF téléchargé et ouvert, visible dans le back-office.
4. Prévenir l'équipe commerciale : les demandes du Studio arrivent avec un PDF prêt, à contrôler avant production.

## 7. Surveillance

Journaux Vercel (*Logs*), à suivre la première semaine :

| Événement | Sens | Que faire |
|---|---|---|
| `visuel_rendu_echec` | le PDF d'une demande n'a pas pu être fait | la carte du visuel le dit ; « Régénérer » depuis le back-office, sinon demander le fichier au client |
| `visuel_regeneration_echec` | régénération après l'acceptation d'un imprimeur échouée | « Régénérer » depuis la carte |
| `visuel_alerte_echec` | l'alerte « visuel à revoir » n'a pas pu être envoyée | vérifier `TELEGRAM_*`, `DEVIS_NOTIFY_EMAIL`, Resend |
| `visuel_archivage_echec` | copie du visuel dans la commande échouée | « Recopier dans la commande » sur la carte |
| `reprise_echec` | un client n'a pas pu mettre à jour son visuel | le client peut refaire une demande ; regarder la cause |

Dans le back-office, un visuel « à revoir » demande une décision humaine avant le devis.

Rendu : `maxDuration` de 120 s pour la route du visuel ; la régénération du back-office et celle d'après acceptation
utilisent la durée par défaut de Vercel. Sur les essais, un rendu prend quelques secondes ; un rendu qui approche la
limite se voit dans les journaux.

Stockage : les fichiers du client (projet, aperçu, images, PDF des versions) suivent la règle des 90 jours ; le visuel
archivé dans une commande est gardé 24 mois. Surveiller la taille du bucket `devis` le premier mois.

## 8. Retour arrière

| Situation | Action |
|---|---|
| Problème dans le Studio | retirer `NEXT_PUBLIC_BANNER_STUDIO` (ou la mettre à `0`) et redéployer : le Studio n'est plus proposé, le formulaire reste. Les demandes déjà faites restent traitables dans le back-office. |
| Problème dans le code fusionné | *Vercel → Deployments* : promouvoir le déploiement d'avant la fusion. Le schéma reste compatible : les migrations n'ajoutent que des tables, des colonnes, des fonctions et des types de fichiers, et le code actuel de `main` tourne déjà dessus en production. |
| Retirer le schéma | **Déconseillé** une fois des demandes reçues : supprime les visuels et les profils. Si décidé, sauvegarder d'abord, puis exécuter les scripts de `supabase/rollbacks/` dans l'ordre inverse (`…profils_down`, `…visuels_down`, `…fichiers_down`), staging d'abord. |

Après toute opération sur la production avec la CLI Supabase, relier de nouveau le staging
(`npx supabase link --project-ref wbbvpslpagptvlnvhiqo`), voir [`supabase-production.md` §9](supabase-production.md).

## 9. Ce qui n'a pas été vérifié

- Aucun tirage réel : rendu, couleurs et repères ne sont validés que sur écran et par les contrôles automatiques du PDF.
- Navigateurs : Chrome seulement (bureau et mobile émulé). Ni Safari, ni Firefox, ni téléphone réel.
- Lecteur d'écran réel : non essayé ; axe-core ne relève aucune violation.
- Aperçu Vercel de la branche : protégé par l'authentification et ses variables Supabase n'ont pas été contrôlées.

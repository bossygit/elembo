# Mise en production — dossier de décision

8 octobre 2026 — Elembo (Smart Vision SARLU)
Objet : transformer un prototype fonctionnel en service commercial exploitable **sans
intervention manuelle permanente**.

---

## 1. Où nous en sommes (audit de l'existant)

| Brique | État actuel | Limite pour un service commercial |
|---|---|---|
| Vitrine | Export statique Next.js sur GitHub Pages, config du service lue à l'exécution (`api-config.js`) | Aucune — c'est gratuit et suffisant |
| Service de paiement | Node/TypeScript sans dépendance, tourne **sur le MacBook**, exposé par un tunnel Cloudflare « rapide » | **Le Mac doit rester allumé.** Le tunnel tombe avec la machine et **change d'adresse** à chaque redémarrage |
| Adresse du service | Republie automatiquement sur `gh-pages` par le superviseur (agent launchd, toutes les 5 min) | Le CDN met ~1 min à suivre : une commande lancée pile pendant un changement peut échouer |
| État des transactions | Fichier JSON sur disque (`~/.elembo/elembo-service/data/transactions.json`) | **Aucune sauvegarde.** Perte du disque = perte de l'historique des encaissements |
| Prix | Source unique `tarifs/grille.json`, lue par l'application et par le service | Aucune : le montant est toujours recalculé côté serveur |
| Paiement | Le navigateur décrit la commande, le service recalcule, MTN encaisse ; statut confirmé par MTN, jamais par le navigateur ; doubles commandes refusées | Solide. Reste : URL de callback à repointer vers le service |
| **Fichiers de production** | **Générés dans le navigateur du CLIENT** après paiement (PNG + fiche), téléchargés puis transmis à l'atelier par WhatsApp | **Le point bloquant.** Si le client ferme la page, le fichier n'existe nulle part. Rien n'arrive automatiquement à l'atelier |
| Back-office | Aucun : on lit le fichier JSON | Impossible de suivre les commandes payées sans technique |
| Supervision | Agent local qui relance service et tunnel | **Personne n'est prévenu** quand ça tombe |
| Clés MTN | Fichier `.env.production` sur le Mac (mode 600) | À déplacer dans un coffre côté serveur, et à faire tourner après migration |

**Conclusion de l'audit** : la partie « encaisser » est fiable et sûre. Ce qui empêche
l'exploitation sans présence humaine, ce sont **trois choses** : un hébergement dépendant d'un
ordinateur personnel, **des fichiers de production qui ne quittent jamais le navigateur du
client**, et l'absence de supervision comme de sauvegarde.

---

## 2. Hébergement permanent — options et coûts

Prix vérifiés à la source le 8 octobre 2026. Taux : 1 EUR = 655,957 FCFA ; 1 USD ≈ 0,8929 EUR.

| Option | Détail | €/mois | FCFA/mois | €/an | FCFA/an |
|---|---|---|---|---|---|
| **A — VPS OVH VPS-1** *(recommandée)* | 2 vCores, 4 Go, 40 Go NVMe, trafic illimité, **sauvegarde quotidienne incluse**, anti-DDoS, SLA 99,9 % | **3,81 € HT** | **2 499** | 45,7 € | **29 985** |
| A′ — idem + domaine | + `.com` chez Cloudflare Registrar (~10,46 $/an) | 4,68 € | 3 070 | 56,2 € | **36 850** |
| **B — PaaS Render Starter** | 7 $/mois + disque persistant 1 Go (0,25 $) ; HTTPS et déploiements Git gérés, **zéro administration** | 7,25 $ ≈ 6,47 € | **4 246** | ~77,7 € | **50 963** |
| B′ — idem + domaine | | 7,34 € | 4 815 | 88,1 € | **57 780** |
| **C — Fly.io (le moins cher)** | Machine 256 Mo 2,19 $ + volume 1 Go 0,15 $ ; HTTPS et domaine perso gratuits | 2,34 $ ≈ 2,09 € | **1 371** | ~25 € | **16 400** |
| C′ — idem + domaine | | 2,96 € | 1 940 | 35,5 € | **23 300** |
| — Hetzner CPX02 (référence) | 1 vCPU, 1 Go, 20 To de trafic, +0,50 € d'IPv4 | 6,49 € | 4 257 | 77,9 € | 51 098 |

**À éviter ici** : Koyeb (29 $/mois minimum), Supabase/Neon payants (une base pour un fichier
d'état est un luxe), et le tier gratuit de Render (le service s'endort après 15 min **et n'a pas
de disque**). Côté serverless (Cloudflare Workers, Deno Deploy), il faudrait **réécrire le
service** : pas de système de fichiers, donc état à sortir dans une base — sans bénéfice à ce volume.

### Recommandation argumentée

**Option A′ — un VPS OVH à ~3,81 € HT/mois + un domaine dédié.** Pourquoi :

1. **Le service tourne tel quel** : pas une ligne à réécrire. Il lit un fichier, écrit un fichier —
   exactement ce qu'un VPS fait de mieux.
2. **Les fichiers de production y vivent** : 8 Mo par tableau 40 × 60 monté ; 40 Go en stockent des
   milliers, alors qu'un PaaS facture le disque au Go et que le serverless n'en a pas.
3. **URL HTTPS stable** sur un sous-domaine dédié (`paiement.<domaine>`) : la callback MTN ne bouge
   plus, et le site n'a plus besoin d'être republié quand quelque chose redémarre.
4. **Le même serveur servira aux autres briques** Smart Vision (callback, back-office, tâches
   planifiées) : le coût est mutualisable.
5. Sauvegarde quotidienne incluse, SLA 99,9 %, anti-DDoS, assistance francophone — utile quand
   l'administrateur est à Brazzaville.

**Option B** si vous préférez ne gérer aucun serveur : Render Starter avec disque persistant, pour
≈ 3 200 FCFA/mois de plus. On y perd le contrôle (et l'ajout d'autres briques), on y gagne les
déploiements automatiques et le TLS géré.

**Option C** si le budget est la contrainte absolue : Fly.io, ≈ 1 940 FCFA/mois. Attention : pas de
palier gratuit (carte bancaire obligatoire), machine à maintenir éveillée, et sortie de données vers
l'Afrique facturée 0,12 $/Go — négligeable à notre volume, mais à surveiller si les fichiers
grossissent.

**Dépendance externe à anticiper** : la souscription (VPS ou PaaS) et le domaine exigent un **moyen
de paiement international** (carte bancaire ou PayPal). C'est une contrainte réelle depuis le Congo :
à régler avant tout le reste, sinon rien d'autre ne peut avancer.

---

## 3. Architecture cible

```
                        ┌──────────────────────────────────────────────┐
   Client (navigateur)  │  Vitrine statique — GitHub Pages (gratuit)   │
        │               └──────────────────────────────────────────────┘
        │                            api-config.js → adresse fixe
        ▼
   paiement.<domaine>  ──────────►  VPS (OVH VPS-1, Caddy TLS auto)
        │                              ├── service Node (systemd, redémarrage auto)
        │                              ├── tarifs/grille.json     (source unique des prix)
        │                              ├── data/transactions.json (état)     ──┐
        │                              ├── commandes/<réf>/       (fichiers)   │ sauvegarde
        │                              ├── back-office protégé                  │ nocturne
        │                              └── /api/momo/callback  ◄── MTN ────────┘ (R2 gratuit)
        │
        └── après paiement : le navigateur ENVOIE le fichier d'impression au service
                              → l'atelier reçoit un lien (WhatsApp + Telegram), sans le client
```

Quatre changements structurels, par ordre d'importance :

1. **Le fichier de production quitte le navigateur.** Après un paiement confirmé, la page envoie le
   PNG et la fiche au service (`POST /api/commandes/<réf>/fichiers`, multipart, autorisé seulement
   si la transaction est PAYÉE). Le service les range dans `commandes/<réf>/` et prévient
   l'exploitant. **C'est ce qui supprime l'intervention manuelle obligatoire.**
2. **Un back-office minimal** (liste des commandes payées, téléchargement du fichier et de la fiche,
   marquage « produite » / « livrée »), accessible derrière un jeton, servi par le même service.
3. **Supervision qui prévient quelqu'un** : contrôle externe (UptimeRobot gratuit, toutes les 5 min)
   sur `/sante` + rapport quotidien par Telegram (service, solde du compte de collecte, commandes
   des dernières 24 h). Le canal Telegram est déjà en place.
4. **Sauvegarde quotidienne** : copie chiffrée de `data/` et `commandes/` vers un stockage objet
   (Cloudflare R2, 10 Go gratuits) + **un test de restauration** documenté.

Détails d'exploitation : pare-feu (SSH + 80/443 seulement), connexion par clé SSH, mises à jour de
sécurité automatiques, journaux avec rotation, service en `systemd` (`Restart=always`), clés MTN dans
`/etc/elembo/.env` (mode 600) — **et rotation des clés MTN après la migration**, puisque les clés
actuelles ont vécu sur un poste de travail.

**Point vérifié** : MTN accepte l'URL de callback **dans chaque requête** (en-tête `X-Callback-Url`,
déjà utilisé par notre service). La bascule du callback ne demande donc **aucune intervention chez
MTN** : changer la valeur de `MOMO_CALLBACK_URL` sur le nouveau serveur suffit, et le callback
arrivera directement au service (aujourd'hui il part vers un endpoint WordPress que nous ne
supervisons pas — les paiements n'en dépendent pas, puisque le statut est confirmé en interrogeant
MTN, mais c'est une longueur de chaîne en moins).

---

## 4. Plan priorisé

| # | Tâche | Dépendance externe | Effort | Coût |
|---|---|---|---|---|
| **0** | **Ouvrir le moyen de paiement international** (carte/PayPal) et souscrire le VPS + le domaine | Banque / carte de l'exploitant | 1 h (administratif) | 3,81 € HT/mois + ~10,46 $/an |
| **1** | Préparer le serveur : durcissement, Caddy + TLS, domaine, service en systemd, clés MTN au coffre, callback MTN repointer vers `paiement.<domaine>` | Accès DNS uniquement — l'URL de callback voyage avec chaque requête (`X-Callback-Url`), donc **aucune action chez MTN** n'est nécessaire | 2-3 h | 0 |
| **2** | **Envoi du fichier de production au service après paiement** + rangement par commande | — | 1 j | 0 |
| **3** | **Back-office minimal** : commandes payées, fichiers, statuts, jeton d'accès | — | 1 j | 0 |
| **4** | **Notification automatique à l'atelier** (WhatsApp + Telegram) avec le lien du fichier, à chaque paiement confirmé | — | 0,5 j | 0 |
| **5** | Sauvegardes nocturnes (R2 gratuit) + test de restauration documenté | Compte Cloudflare (gratuit) | 0,5 j | 0 |
| **6** | Supervision : UptimeRobot + rapport quotidien Telegram (service, solde, commandes) | Compte UptimeRobot (gratuit) | 0,5 j | 0 |
| **7** | Rotation des clés MTN + procédure documentée de changement de clé | MTN (nouvelle clé d'abonnement) | 0,5 j | 0 |
| **8** | Bascule : le Mac devient un simple poste de développement ; arrêt du tunnel et de l'agent | — | 0,5 j | 0 |
| **9** | *(optionnel)* Domaine pour la vitrine (Vercel ou Render Static, gratuit) | — | 0,5 j | 0 |

**Critère de réussite** : après la phase 8, l'exploitant peut **fermer son ordinateur** et une
commande payée arrive quand même jusqu'à l'atelier, avec son fichier, sa fiche, une notification, un
historique sauvegardé, et une alerte s'il y a une panne.

### Calendrier réaliste
- **Semaine 1** : phases 0 à 2 (le service est hébergé et reçoit les fichiers) — c'est la bascule qui
  supprime la dépendance au Mac.
- **Semaine 2** : phases 3 à 6 (back-office, notification, sauvegarde, supervision) — l'exploitation
  devient autonome.
- **Semaine 3** : phases 7 et 8 (sécurité, bascule finale), puis le barème et la phase catalogue
  (mugs, objets, « j'envoie mon fichier »).

---

## 5. Décisions attendues

1. **Hébergement** : VPS OVH (recommandé, ~3 070 FCFA/mois avec le domaine) ou PaaS Render
   (~4 815 FCFA/mois, zéro administration) ?
2. **Nom de domaine** : quel nom, et sur quel compte ? Utiliser un sous-domaine de `smartvision.cg`
   (si vous maîtrisez son DNS) ou acheter un domaine dédié chez Cloudflare ?
3. **Moyen de paiement international** : la carte ou le compte PayPal qui portera l'abonnement.
4. **Titulaire des accès** : les identifiants du serveur au nom de Smart Vision (recommandé) ou en
   votre nom ?
5. **Back-office** : je le construis maintenant (phases 2 à 4) ou après le prochain chantier
   catalogue ? Mon avis : maintenant — sans lui, chaque vente vous réclame.
6. **Barème des tableaux** : inchangé comme convenu ; à arbitrer dès les premiers devis des
   prestataires.

---

## 6. Budget récapitulatif

| Poste | FCFA/mois | FCFA/an |
|---|---|---|
| VPS OVH VPS-1 (2 vCores, 4 Go, sauvegarde incluse) | 2 499 | 29 985 |
| Domaine `.com` chez Cloudflare Registrar | 570 | 6 126 |
| Sauvegarde objet (Cloudflare R2, 10 Go gratuits) | 0 | 0 |
| Supervision (UptimeRobot, gratuit) | 0 | 0 |
| Vitrine (GitHub Pages, gratuit) | 0 | 0 |
| **Total recommandé** | **≈ 3 070** | **≈ 36 111** |

À comparer au coût actuel : 0 FCFA, mais un service qui s'arrête quand l'ordinateur s'éteint, des
fichiers qui restent dans le navigateur du client, et aucune sauvegarde. **Le budget ci-dessus
n'achète pas de la technique : il achète le fait de ne plus avoir à être présent.**

# Élargir Elembo : supports, catalogue et organisation

**Ce que Realisaprint nous apprend — proposition pour une plateforme d'impression à la demande
destinée aux entreprises ET aux particuliers, adaptée au Congo.**

Document de travail — 7 octobre 2026
Plateforme actuelle : https://bossygit.github.io/elembo/

---

## 1. Ce qu'est Realisaprint, et ce qu'il faut en retenir

### 1.1 Leur organisation

| Élément | Réalité |
|---|---|
| Création | 2007, Nice (France) — Rémy Barelli et Rafael Mari |
| Effectif | 122 personnes |
| Outil industriel | 8 000 m² de production **interne, intégrale** (impression, finition, expédition) |
| Volume | ~1 500 commandes imprimées par jour |
| Clients | +50 000 revendeurs |
| Catalogue | 200+ produits, 300 000 modèles, répartis en 3 familles : **imprimerie**, **signalétique**, **objets publicitaires** — plus décoration, textile, livres, packaging, PLV |
| Positionnement | **100 % B2B revendeur** : comptes validés à la main, tarifs masqués avant validation du compte |
| Services clés | Contrôle **gratuit** des fichiers avant impression · livraison **gratuite en marque blanche** · prix aligné −5 % (garantie « le moins cher d'Europe ») · remises fidélité jusqu'à 10 % · mensualisation des paiements · kit revendeur (échantillons) · Filecloud (fichiers conservés 2 ans) · Webprint (site e-commerce d'impression en marque blanche) · Geoprint (transmet des demandes de clients aux revendeurs) |

### 1.2 Comment ils prennent une commande

Leur tunnel est **un configurateur d'options**, pas un éditeur graphique :

```
produit → format (cm prédéfinis ou sur mesure)
        → matière / support (grammages papier, pelliculage, matériaux rigides)
        → faces imprimées / couleur d'impression
        → finitions (pelliculage, encapsulage, découpe)
        → quantité (paliers)
        → PRIX → le client téléverse un fichier prêt à imprimer
```

Exemples relevés :
- **Affiche** : formats A3 → A0, plus tailles d'affichage urbain, 3 orientations, 12 supports papier (90 g → 350 g, kraft, adhésif, photo, recyclé), recto/verso, quadri ou noir, pelliculage, encapsulage, paliers de quantité.
- **Tableau** : largeur 20 → 200 cm, hauteur idem, option « marge d'encadrement 12 cm », recto ou recto-verso, plusieurs matériaux.
- **Textile** : ils vendent le **film DTF prêt à poser** (planche, bobine, unitaire), la sublimation, les écussons (9 types, 5 attaches) — et même la **presse à chaud**.

**Le client fournit un fichier** (PDF/X4, polices vectorisées, sans traits de coupe) ; eux le contrôlent gratuitement. Ils ne dessinent pas à la place du client.

### 1.3 Leur offre « tableau » (à comparer à ce qu'on veut faire)

| Support | Détail | Prix affiché |
|---|---|---|
| Canvas sur châssis bois | Toile 100 % coton 340 g/m², toile seule ou montée, 20 → 200 cm | dès 41 € l'unité |
| Canevas (toile seule) | Idem, marge d'encadrement 12 cm en option | dès 32 € l'unité |
| Tableau aluminium brossé | Alupanel 3 mm | dès 39,80 €/m² |
| Tableau aluminium blanc | Alupanel 3 mm, découpe à la forme possible | dès 35,96 €/m² |
| Tableau PVC expansé (Forex®) | 3, 5 ou 10 mm | dès 13,50 €/m² |
| Tableau carton plume (Kapaplast®) | 5 ou 10 mm | dès 14,86 €/m² |
| Tableau carton alvéolaire (Lightboard®) | 3,5 ou 10 mm | dès 4,98 €/m² |
| Tableau Plexiglas® | 3, 5 ou 10 mm | dès 40,46 €/m² |
| Tableau tissu tendu | Structure aluminium, option jonc | dès 44 € l'unité |

### 1.4 Les trois idées à retenir pour nous

1. **Deux entrées pour une même commande.** Eux : « le pro apporte son fichier ». Nous : « le client compose dans le navigateur ». Les deux sont complémentaires — un imprimeur, une agence ou un particulier qui a déjà son visuel ne doit pas être obligé de passer par l'éditeur.
2. **La valeur est dans le contrôle et l'option, pas dans le catalogue.** Contrôle de fichier, formats, matières, finitions, paliers de quantité, BAT, marque blanche : c'est ce qui transforme « une boutique de T-shirts » en **plateforme d'impression**.
3. **Le configurateur d'options est le vrai produit.** Notre configurateur 3D est un bonus différenciant ; le socle commercial, c'est le choix format/matière/quantité avec un prix qui se met à jour.

### 1.5 Ce qu'on ne copie pas

- Le « moins cher d'Europe » : notre coût est local, notre argument est la **vitesse, la proximité et le Mobile Money**, pas le centime.
- La production intégrale dès le départ : nous imprimons en interne ce que notre presse sait faire, et nous sous-traitons le reste.
- Le B2B exclusif : on veut les **entreprises ET les particuliers** — donc deux parcours sur une seule plateforme.

---

## 2. Où en est Elembo aujourd'hui

| Brique | État |
|---|---|
| Configurateur 3D | T-shirt raglan + col rond, rotation/zoom, couleurs, éléments indépendants (images, textes), 17 polices, faces avant/arrière, calques |
| Studio 2D | 3 supports : T-shirt (24×28 cm), casquette (12×7,2 cm), tableau (24×42,9 cm) — zones normalisées + taille physique en cm |
| Contrôle de qualité | Densité réelle calculée en dpi sur la taille physique du support, alerte chiffrée |
| Dossier de production | PNG 300 dpi par face + fiche de production (position cm depuis le coin haut-gauche, dimensions, rotation, couleurs, polices, débordements) |
| Commande | Tailles S→3XL, quantités, ville (Brazzaville, Pointe-Noire), délai 3 jours, récapitulatif FCFA |
| Paiement | MTN MoMo — **encaissement validé en production le 07/10/2026** (montée 1 → 200 FCFA, solde du compte de collecte alimenté) |
| Qualité logicielle | 191 + 59 tests automatisés verts |

**La force de l'architecture actuelle** : un produit = une entrée de catalogue (photo de mockup + zone en cm, ou modèle 3D + zones). Ajouter un support n'est pas un chantier de code, c'est une **ligne de catalogue** — à condition d'avoir la photo et la taille physique réelle.

**Ce qui manque pour devenir une plateforme d'impression** : les variantes (couleurs, tailles, formats), les options (matière, finition), les paliers de quantité, l'entrée « fichier prêt », le compte professionnel (devis, facture, tarifs dégressifs), le BAT, et le suivi de production.

---

## 3. Matrice des supports : quoi intégrer, en 2D ou en 3D

Légende rendu : **3D** = modèle GLB dans le configurateur (vue en volume, rotation) · **2D** = photo de
mockup + zone. Effort : S ≈ 1 journée, M ≈ 2-4 jours, L ≈ 1-2 semaines.

| Famille | Produit | Rendu | Pourquoi ce rendu | Production | Effort | Priorité |
|---|---|---|---|---|---|---|
| **Textile** | T-shirt (col rond, raglan) | **3D** ✓ + 2D ✓ | Déjà fait — c'est notre vitrine | Presse DTF interne | — | Faite |
| | Polo, manches longues, sweat/hoodie | **3D** | Le volume change la perception (capuche, poche) | DTF interne | M (trouver/créer le GLB + zone) | 1 |
| | Casquette, tote bag, tablier, tenue enfant | 2D → 3D ensuite | 2D suffit pour vendre ; 3D si le GLB est propre | DTF interne | S puis M | 1 |
| | Écusson thermocollant | 2D | Petit format, la photo suffit | Presse interne | S | 2 |
| | Maillot de sport, dossard | 3D | Fort en entreprise/associations/écoles | DTF ou sublimation | M | 2 |
| **Tableaux & décoration murale** | Tableau canvas sur châssis (5 formats) | **2D** | Le rendu 3D n'apporte rien : on veut voir *le visuel*, à l'échelle, dans une pièce | Sous-traité (impression + montage châssis) | M | **1 (priorité locale)** |
| | Toile seule (pour encadrement local) | 2D | Les encadreurs de Brazzaville existent déjà | Sous-traité | S | **1** |
| | Poster / affiche (A3 → A1) | 2D | Vente d'impression pure | Sous-traité | S | 1 |
| | Tableau rigide (PVC, alu, plexi, carton plume) | 2D | Visible dans les bureaux et vitrines | Sous-traité | S | 2 |
| | Sticker mural, papier peint | 2D (+ aperçu à l'échelle) | Nécessite un aperçu dans la pièce pour rassurer | Sous-traité | M | 2 |
| | Cadre photo / plaque commémorative | 2D | Très demandé (familles, églises, écoles) | Interne + encadreur | S | 1 |
| **Objets** | Mug (blanc, métal, magique) | 2D | Le mockup photo vend très bien | Presse à sublimation (à acquérir) | S | 1 |
| | Gourde, tapis de souris, porte-clés, coque, badge, stylo | 2D | Idem — petit format, marge élevée | Sublimation / impression UV | S chacun | 2 |
| **Papeterie & petit format** | Carte de visite, flyer, dépliant, brochure, étiquette, sac kraft, calendrier | 2D + fichier | C'est du fichier, pas du design dans le navigateur | Sous-traité au départ | S chacun | 2 |
| | Album photo, livre | 2D | Produit d'appel émotionnel | Sous-traité | M | 3 |
| **Grand format / signalétique** | Bâche, banderole, roll-up, X-banner, panneau, enseigne | 2D + fichier | Marché B2B (entreprises, ONG, événements) — **très rentable** | Partenaire grand format obligatoire | M | 2 |

### 3.1 La règle qui décide du 2D ou du 3D

- **3D** quand le client doit *juger de l'objet* : un vêtement porté, un mug en main, un volume qui se tourne. Cela justifie un modèle GLB (et son calibrage de zones).
- **2D** quand le client doit *juger du visuel* : un tableau, une affiche, un sticker. La photo de mockup bien cadrée + une zone juste + un contrôle dpi suffisent — et coûtent dix fois moins cher à produire.

Autrement dit : **on ne modélise pas ce qu'on peut photographier**. Chaque support 2D se déclare aujourd'hui en une entrée de `studio.ts` (mockup + zone + `zoneCm`).

---

## 4. Les tableaux en détail — l'intégration

### 4.1 Pourquoi c'est le bon premier chantier

- Demande locale réelle : décoration intérieure, salons, bureaux, restaurants, églises, écoles, cadeaux (mariages, naissances, deuils, remises de diplômes).
- Valeur perçue élevée pour un coût matière faible : toile + châssis bois + impression.
- **Les compétences existent déjà à Brazzaville** : les encadreurs et ateliers de cadres travaillent depuis longtemps — il faut les brancher sur la plateforme, pas les remplacer.
- Panier moyen compatible avec les frais Mobile Money (2-3 % prélevés par MTN) : à 200 FCFA la pièce la commission est indolore mais la marge aussi ; un tableau à 15 000-60 000 FCFA supporte la structure de coûts.

### 4.2 Formats à proposer

| Gamme | Formats | Usage type |
|---|---|---|
| Petit | 20×30, 30×30 (carré), 30×40 | Cadeaux, photos de famille, bureau |
| Moyen | 40×50, 40×60, 50×50, 50×70 | Salon, chambre — **le cœur du marché** |
| Grand | 60×80, 60×90, 70×100, 80×120 | Murs de séjour, restaurants, salles de réunion |
| Panneaux | Diptyque (2× 40×60), triptyque (3× 40×60) | Effet décoratif, marges élevées |
| Toile seule | mêmes dimensions, roulée | Pour l'encadrement local (délai et coût réduits) |

### 4.3 Options produit

- **Montage** : toile seule roulée · toile sur châssis bois (épaisseur 2 ou 4 cm).
- **Bord** : galerie (l'image continue sur les côtés) ou encadrement (côtés unis, avec marge de 12 cm comme chez Realisaprint).
- **Finition** : mate (standard déco) ou satinée.
- **Orientation** : portrait / paysage — calculée automatiquement d'après le format choisi, mais laissée modifiable.
- **Rigide** (phase 2) : PVC expansé 3 ou 5 mm, alu, plexiglas — pour les entreprises et les vitrines.

### 4.4 Le parcours client

1. **Choisir le format** (avec un visuel d'échelle : « ceci est le tableau dans un salon de 3 m »).
2. **Importer** une photo, un visuel ou partir d'une bibliothèque de modèles.
3. **Vérifier** : l'aperçu montre le rendu au format choisi, avec débords, et le contrôle qualité indique
   la taille maximale raisonnable pour cette photo.
4. **Options** (montage, bord, finition) → **prix**.
5. **Commander et payer** (MoMo d'abord), avec BAT envoyé par WhatsApp pour les commandes à partir d'un seuil.

### 4.5 Le contrôle qualité spécifique aux tableaux

C'est **le point critique** : une photo prise au téléphone fait souvent 2 à 4 mégapixels. À 50×70 cm, cela donne
60 à 90 dpi — insuffisant. La plateforme doit donc :

- afficher la **densité réelle** (déjà codé) et **le plus grand format acceptable** pour l'image fournie ;
- proposer automatiquement **la taille du tableau qui correspond à la photo** (« votre photo convient jusqu'à 30×40 ») ;
- gérer un **recadrage guidé** (ne pas déformer : on recadre, on n'étire jamais) ;
- prévoir une option payante **retouche / agrandissement** si la demande existe ;
- bloquer la commande si la densité descend sous un seuil dur, avec un message clair — jamais imprimer un
  tableau flou, c'est le meilleur moyen de perdre un client.

### 4.6 Production

- **Impression** : imprimante à encre pigmentaire (grand format) chez un partenaire, ou impression à la planche pour les petits formats — à arbitrer.
- **Montage** : châssis bois par un encadreur local, ou châssis fournis par la plateforme.
- **Fichier transmis à l'atelier** : visuel au format final, résolution 150-300 dpi, marge d'encadrement si bord galerie, orientation, mode de bord, taille finie en cm — la fiche de production actuelle suffit, il faut juste y ajouter les champs « marge » et « mode de bord ».

### 4.7 L'angle marketplace (à moyen terme)

Une **galerie de créateurs congolais** : photographes, peintres, graphistes publient leurs visuels ; la plateforme imprime, encadre et livre ; le créateur touche une commission. C'est exactement la niche « impression à la demande » de la marketplace Smart Vision : un créateur vend sans stock, sans avance et sans logistique.

---

## 5. Ce qu'on reprend de Realisaprint, par ordre de valeur

1. **Le contrôle du fichier avant impression** — nous avons le contrôle de densité ; il faut y ajouter format, marges, fond perdu, transparence, polices. C'est ce qui évite les tirages ratés et les litiges.
2. **Les deux entrées** : « je compose dans le navigateur » (particuliers, événements) et « j'envoie mon fichier prêt à imprimer » (imprimeurs, agences, entreprises). Le second ouvre le marché professionnel à moindres frais.
3. **Le compte professionnel** : prix dégressifs par palier, devis, facture, paiement différé ou par Mobile Money, livraison en **marque blanche** (l'entreprise cliente livre ses propres clients).
4. **Les paliers de quantité** : 1, 5, 10, 25, 50, 100… avec un prix unitaire qui baisse. C'est le langage de tous les imprimeurs.
5. **Le BAT avant tirage** en série (déjà prévu) : envoyé par WhatsApp, validé par le client, archivé avec la commande.
6. **La bibliothèque de modèles** pour le particulier qui n'a aucun visuel (formes simples, citations, motifs, cadres).
7. **La conservation des fichiers du client** (recommande) — stockage local, durée limitée.
8. **Le devis en ligne** : un vrai besoin B2B (la plupart des entreprises demandent un devis avant de commander).

**Non repris** : le modèle « compte validé à la main » (trop lent pour le particulier), le catalogue papier de 200 produits dès le départ, le paiement mensualisé.

---

## 6. Adapter au contexte congolais

| Contrainte locale | Ce qu'on en fait |
|---|---|
| Mobile Money dominant, cartes bancaires rares | MoMo (opérationnel) puis Airtel Money ; espèces à la livraison pour les particuliers ; virement ou facture pour les entreprises |
| Commission MTN de 2-3 % sur les encaissements | Viser des paniers ≥ 5 000 FCFA ; éviter de vendre à l'unité à 1 000 FCFA ; proposer des lots (ex. 20 t-shirts, pack tableaux) |
| Pas d'adresse postale fiable | Retrait à l'atelier + livraison moto dans Brazzaville et Pointe-Noire ; la commande se confirme par WhatsApp ; frais de livraison **par zone**, pas par ville |
| Coupures d'électricité et d'internet | File de production hors ligne : une commande payée entre dans une file locale imprimable quand le courant revient ; la plateforme n'a pas besoin d'être connectée pour imprimer |
| Photos clients de faible qualité | Guide de résolution, format maximum proposé automatiquement, recadrage guidé, option retouche |
| Approvisionnement en supports vierges | Tenir un stock tampon des formats qui tournent (T-shirt, mug, 30×40, 40×60) ; acheter les châssis localement ; qualifier des fournisseurs régionaux pour le reste |
| Marché entreprise très actif (uniformisation, événements, ONG, écoles, églises) | Offre B2B dédiée : devis, facture, volume, délai garanti, marque blanche |
| Sensibilité au prix, arrondis | Barème par paliers avec des prix ronds (1 000, 2 500, 5 000, 10 000 FCFA), jamais de centimes |

---

## 7. Organisation du catalogue dans le code

Aujourd'hui un produit = `mockup` + `zone` + `zoneCm` (2D) ou `GLB` + zones physiques (3D). Pour tenir
un vrai catalogue, il faut une structure unifiée :

```
Famille        textile · décoration · objet · papier · signalétique
  Produit      « Tableau canvas »
    Variante   format (30×40, 40×60…) · couleur · taille (S→3XL)
    Rendus     mockup 2D (obligatoire) · modèle 3D (optionnel)
    Zones      face(s) d'impression, position + taille physique en cm
    Options    montage, bord, finition, matière
    Paliers    1 / 5 / 10 / 25 / 50 / 100 → prix unitaire et total
    Production méthode (DTF, sublimation, impression directe, sous-traitance) + délai
```

Ce découpage permet d'ajouter un support **sans toucher aux composants** : c'est déjà la philosophie du
catalogue actuel, il faut juste ajouter les variantes, les options et les paliers.

**Ordre de développement recommandé** : (1) catalogue multi-familles et variantes de format, (2) quantité et
barème par paliers, (3) entrée « fichier prêt » + contrôle de fichier, (4) compte pro, devis et facture,
(5) suivi des statuts de commande, (6) BAT WhatsApp, (7) bibliothèque de modèles.

---

## 8. Plan d'implémentation

### Phase 0 — Socle (fait)

Configurateur 3D, studio 2D, zones physiques, contrôle dpi, dossier de production, paiement MoMo
(encaissement validé le 07/10/2026), livraison Brazzaville/Pointe-Noire.

### Phase 1 — Tableaux, posters et vrais prix (2 à 3 semaines)

| Tâche | Livrable |
|---|---|
| 5 formats de tableaux + toile seule, avec aperçu à l'échelle | Supports en catalogue |
| Photos de mockup réelles (salon, bureau, chambre) | Visuels de vente |
| Variantes de format dans le tunnel (aujourd'hui figé à 24×42,9) | Sélection format → prix |
| Paliers de quantité | Barème 1/5/10/25 |
| Barème de prix réel (à fournir) | Prix justes partout, catalogue navigateur et serveur |
| Guide de résolution photo (format maximum conseillé) | Moins de litiges |
| Partenaire impression canvas + encadreur qualifiés | Production des tableaux |

**Recette** : commander un tableau 40×60 de bout en bout — visuel, format, prix, paiement MoMo,
fichier de production, impression, livraison.

### Phase 2 — Objets et entrée « fichier prêt » (2 à 3 semaines)

Mug et tote bag (presse à sublimation à acquérir), casquette et tablier, écusson thermocollant ;
écran « j'envoie mon fichier » avec contrôle complet (format, marges, transparence, fond perdu) ;
BAT WhatsApp sur les commandes à partir d'un seuil.

### Phase 3 — Professionnels (3 à 4 semaines)

Compte professionnel, devis en ligne, facture, tarifs dégressifs, livraison en marque blanche,
suivi de production (reçu → en impression → prêt → livré), relances automatiques.

### Phase 4 — Signalétique et réseau (ensuite)

Grand format (bâche, banderole, roll-up, panneaux) via partenaires qualifiés ; galerie de créateurs ;
mise en relation avec des ateliers partenaires quand la demande dépasse notre capacité.

---

## 9. Décisions à prendre (et ce dont j'ai besoin)

1. **Périmètre de la phase 1** : je propose tableaux (5 formats + toile seule) + posters + variantes de
   taille et de couleur des T-shirts.
2. **Production** : qu'est-ce qui reste en interne (textile DTF) et qu'est-ce qui part chez un partenaire
   (tableaux, rigides) ? As-tu un imprimeur grand format et un encadreur à Brazzaville avec qui travailler ?
3. **Barème de prix** : je ne fixerai aucun prix inventé. Il me faut ta grille par produit et par format,
   ou les coûts (matière + impression) et la marge visée, et je construis le barème.
4. **Équipement** : achat d'une presse à sublimation (mugs) ? d'une imprimante grand format (tableaux) ?
   Décision budgétaire — à évaluer avant la phase 2.
5. **Photos de produits** : les mockups actuels du studio 2D sont provisoires (aplats). Il faut de vraies
   photos (ou des rendus) pour vendre.

---

## Annexe — Correspondance avec le code actuel

| Fichier | Rôle | Ce qu'il faut y ajouter |
|---|---|---|
| `src/lib/products/studio.ts` | Supports 2D : mockup, zone, `zoneCm` | Les tableaux, posters, objets — une entrée par support |
| `src/lib/products/catalog.ts` | Produits 3D : GLB, zones, couleurs, surfaces | Polo, sweat, maillot — quand les GLB seront prêts |
| `momo-service/src/catalogue.ts` | Catalogue serveur (le montant est toujours recalculé côté serveur) | Les mêmes produits, avec paliers de quantité |
| `tests/printPhysics.test.ts` | Vérifie l'isotropie zone ↔ cm | Un cas par nouveau support |
| `tests/coherenceCatalogues.test.ts` | Vérifie que les deux catalogues ne divergent pas | Étendre aux nouveaux produits |

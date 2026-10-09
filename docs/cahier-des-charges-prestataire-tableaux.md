# Cahier des charges — impression sur toile et montage de tableaux

Document destiné aux prestataires d'impression et d'encadrement.
Version du 8 octobre 2026 — Elembo (Smart Vision SARLU, Brazzaville).

---

## 1. Objet

Nous commandons des **tableaux imprimés** pour la décoration intérieure, dans deux finitions :

1. **Toile seule** — imprimée au format fini, livrée roulée, à encadrer par le client ;
2. **Toile montée sur châssis** — imprimée avec le débord nécessaire, tendue et agrafée sur un
   châssis bois.

Cinq formats : **20 × 30, 30 × 40, 40 × 60, 50 × 70, 60 × 90 cm** (le portrait est la référence ;
les mêmes formats peuvent être commandés en paysage : largeur et hauteur sont alors échangées).

## 2. Les fichiers que nous fournissons

| Point | Spécification |
|---|---|
| Format de fichier | **PNG** (24 bits + canal alpha), un fichier par tableau |
| Résolution | **150 dpi** à la taille physique du fichier fourni (voir le tableau du §3) |
| Espace colorimétrique | **sRGB IEC61966-2.1**. Si votre flux travaille en **Adobe RGB (1998)** ou en **CMJN (FOGRA39 / ISO Coated v2)**, dites-le nous : nous produirons les fichiers dans cet espace. |
| Fond | **Transparent** (pas de fond blanc imprimé). Sur toile blanche, une zone sans données ne reçoit pas d'encre. |
| Profils ICC | Non incorporés. Nous fournirons le profil sur demande si votre RIP en exige un. |
| Nom du fichier | `COMMANDE-IMPRESSION-FORMAT-support.png`, ex. `ELB-20261008-1712-AB-IMPRESSION-40x60-chassis.png` |
| Fiche jointe | Un fichier texte `COMMANDE-FICHE-PRODUCTION.txt` : format fini, surface à imprimer, support, bord, quantité |

**Nous ne fournissons jamais** l'aperçu de la boutique (il contient le décor de la pièce) : le
fichier de production est le visuel seul.

## 3. Dimensions exactes à imprimer

Le fichier fourni **est déjà à la taille d'impression** : il n'y a pas de redimensionnement à
faire. Le débord de 4 cm par côté est inclus pour le montage sur châssis.

| Format fini | Toile seule — cm | Toile seule — px (150 dpi) | Monté sur châssis — cm | Monté — px (150 dpi) |
|---|---|---|---|---|
| 20 × 30 cm | 20 × 30 | 1181 × 1772 | **28 × 38** | **1654 × 2244** |
| 30 × 40 cm | 30 × 40 | 1772 × 2362 | **38 × 48** | **2244 × 2835** |
| 40 × 60 cm | 40 × 60 | 2362 × 3543 | **48 × 68** | **2835 × 4016** |
| 50 × 70 cm | 50 × 70 | 2953 × 4134 | **58 × 78** | **3425 × 4606** |
| 60 × 90 cm | 60 × 90 | 3543 × 5315 | **68 × 98** | **4016 × 5787** |

Le débord représente 236 px de chaque côté à 150 dpi.

## 4. Bord du tableau (uniquement pour le montage sur châssis)

Deux finitions, indiquées sur la fiche de production :

- **Bord galerie** : le visuel se prolonge jusque dans les débords — il continue sur les côtés du
  châssis. Le fichier fourni contient donc du visuel dans la bande de 4 cm.
- **Bord encadrement** : la bande de 4 cm est **sans encre** (toile blanche) ; elle sert uniquement
  à envelopper et agrafer. Le visuel occupe exactement les dimensions du format fini, centré.

## 5. Marges de sécurité

- **Aucun élément critique** (texte, visage, logo) à moins de **5 mm** du bord du format fini :
  le pliage et la tension du châssis déplacent légèrement l'image.
- Dans le cas du bord **galerie**, considérer que les 4 cm de débord ne sont **pas** visibles de
  face : ils ne doivent pas porter d'information nécessaire à la compréhension du visuel.
- Pas de repère de coupe, pas de trait de montage imprimé, pas de fond perdu supplémentaire : la
  géométrie du fichier est exacte.

## 6. Résolution : ce que nous garantissons, ce que nous attendons

- Nous refusons en amont toute commande dont la densité serait inférieure à **150 dpi** à la taille
  du format choisi : le client en est averti, et la plateforme lui propose le plus grand format que
  sa photo supporte réellement.
- Nous transmettons la densité réelle du visuel dans la fiche de production. Si votre expérience
  montre qu'une toile donnée exige davantage (trame fine, petit format regardé de près),
  indiquez-nous le seuil à appliquer : nous l'intégrerons comme règle.

## 7. Contrôle qualité et bon à tirer

- **Un BAT photographique** avant expédition pour toute commande de plus de 10 pièces ou de plus de
  50 × 70 cm.
- Nous vérifions les fichiers avant envoi (dimensions, densité, transparence). Si un fichier vous
  paraît inexploitable, **ne l'imprimez pas** : prévenez-nous, nous le corrigeons ou nous annulons
  la commande.
- Critères de recette : dimensions finies exactes (± 3 mm), toile tendue sans pli ni gondolement,
  visuel net, couleurs conformes à ce qui a été commandé, châssis d'équerre.

## 8. Emballage et livraison

| Support | Conditionnement attendu |
|---|---|
| Toile seule | Roulée, face imprimée vers l'extérieur, dans un tube rigide |
| Monté sur châssis | Angles protégés, film de protection de surface, calage dans un carton |

Livraison à **Brazzaville** et **Pointe-Noire** (retrait à l'atelier ou remise convenue). Nous
demandons au prestataire de chiffrer les deux hypothèses : livraison chez nous, ou expédition
directe au client final.

## 9. Ce que nous demandons au prestataire (à compléter par ses soins)

1. **Capacités** : largeur maximale imprimable ; type de toile (grammage g/m², coton/polyester) ;
   type d'encre ; épaisseurs de châssis proposées (2 cm, 4 cm ?) ; finitions de bord disponibles.
2. **Prix unitaires** pour les cinq formats, dans les deux finitions (toile seule, montée), et
   dégressivité éventuelle par quantité (1, 2, 5, 10, 25 pièces).
3. **Délais** : production par unité, par lot de 10, et délai maximum en haute saison.
4. **Contraintes particulières** : dimensions minimales et maximales, formats non standards,
   possibilité de diptyque/triptyque (plusieurs panneaux pour un même visuel).
5. **Espace colorimétrique** et profil attendus par votre flux d'impression.
6. **Conditions commerciales** : modalités de paiement, gestion des rebuts (qui supporte un tirage
   raté, et sur quelle base), assurance sur le transport.
7. **Échantillon** : un jeu d'essai à nos couleurs sur le format 30 × 40, monté, pour validation
   avant le premier lot commercial.

## 10. Correspondance avec notre production textile

Nous imprimons nous-mêmes le textile (transfert à chaud DTF) sur presse. Pour le **DTF sur toile**,
nous pouvons fournir le film prêt à poser si votre atelier préfère cette voie plutôt que
l'impression directe : dans ce cas, précisez la taille de planche maximale acceptée.

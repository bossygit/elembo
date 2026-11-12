# Fichiers et production — vérification, stockage, conservation

Statut : règles de conception et colonnes livrées. Depuis la livraison du configurateur textile
(12/11/2026), la commande dépose réellement des PNG nommés par zone et une fiche de production
dans l'archive privée de la commande (§2.1, §5.1) ; la régénération serveur à partir d'un
`design_snapshot` reste un chantier planifié (§5, §6).

## 1. Vérification réelle avant association

Un fichier n'est associé à un devis ou à une commande qu'après **quatre contrôles serveur** :

1. **Existence** : `storage.from(bucket).list(prefix)` confirme l'objet et son chemin exact.
2. **Taille** : `metadata.size` doit correspondre à `taille_octets` annoncée et rester sous la
   limite du type (25 Mo devis, 50 Mo production).
3. **Type réel** : lecture des premiers octets (range 0-15) et comparaison aux signatures :
   - PNG : `89 50 4E 47 0D 0A 1A 0A`
   - JPEG : `FF D8 FF`
   - PDF : `%PDF-`
   - ZIP : `50 4B 03 04`
   - WEBP : `RIFF` + `WEBP` à l'offset 8
   Le `Content-Type` envoyé par le navigateur n'est **jamais** la seule preuve.
4. **Empreinte** : SHA-256 calculé côté serveur (flux), comparé au `checksum` client s'il est
   fourni. Une différence refuse le fichier.

Puis `fichiers_devis.verifie = true` / `verifie_le = now()` (idem `fichiers_commande`).
Un fichier non vérifié ne compte pas dans la complétude du dossier.

Le helper `src/server/storage/verification.ts` implémente les signatures, le contrôle du nom,
de la taille et la cohérence extension/contenu ; `tests/verificationFichiers.test.ts` couvre
les cas PNG/JPEG/PDF/ZIP/WEBP, les noms dangereux et les fichiers vides ou trop volumineux.

## 2. Types et noms

| Bucket | Types acceptés | Taille max | Remarque |
|---|---|---|---|
| `devis` | PDF, PNG, JPEG, WEBP, ZIP | 25 Mo | ZIP pour un dossier de sources |
| `production` | PNG, PDF, JSON, TXT | 50 Mo | PNG à la densité du procédé (300 dpi DTF, 150 dpi sublimation) |

Refusés : SVG, HTML, exécutables, archives autres que ZIP, fichiers sans extension, doubles
extensions (`logo.png.exe`), noms avec `..`, caractères de contrôle ou plus de 120 caractères.

Chemin imposé : `devis/<devis_id>/<uuid>-<nom-assaini>` ou
`production/<commande_id>/<uuid>-<nom-assaini>`. Le nom affiché est stocké séparément du chemin.

### 2.1 Noms des fichiers du configurateur textile

Pour un vêtement personnalisé, les fichiers sont produits par le navigateur puis déposés dans
l'archive privée de la commande (`dossiers/<commande>/`, Vercel Blob) ; l'atelier les attend sous
ces noms exacts, un par zone réellement personnalisée (constante `SIDE_FILE`,
`src/types/configurator.ts`) :

| Fichier | Zone | Densité | Fond |
|---|---|---|---|
| `front.png` | face avant | `dpi` du procédé (300 en DTF) | transparent |
| `back.png` | face arrière | idem | transparent |
| `left-sleeve.png` | manche gauche | idem | transparent |
| `right-sleeve.png` | manche droite | idem | transparent |
| `collar.png` | intérieur du col | idem | transparent |

La densité **n'est pas fixe** : elle vient du procédé de production choisi
(`production/profils.json` — 300 dpi en DTF et flex, 150 dpi en sublimation) et sert à calculer
la taille du fichier à partir de la taille physique de la zone. Le gabarit de 4 096 px de côté
plafonne les grandes zones en conservant leurs proportions.

Quota du dépôt de commande (`src/server/dossiers/dossier.ts`) : **12 fichiers maximum** par
commande (5 zones + fiche `.txt` + fiche `.json`, avec une marge), **25 Mo par fichier** et
**120 Mo au total**. Au-delà, le dépôt est refusé en `422` avant enregistrement. Ce quota est
celui de l'**archive de commande** (Vercel Blob) ; les buckets Supabase du tableau ci-dessus
restent la cible de conservation long terme, avec leurs propres limites.

## 3. URL signées

- Envoi : URL signée de 10 minutes, `upsert: false`, limitée au chemin exact.
- Téléchargement : URL signée de 5 minutes, générée après contrôle du rôle et de la propriété.
- Aucune URL publique, aucun bucket public.
- Le serveur ne fait pas transiter le binaire par une fonction Vercel (limite 4,5 Mo) : le
  navigateur envoie directement à Supabase Storage.

## 4. Conservation et suppression

| Contenu | Conservation | Suppression |
|---|---|---|
| Devis non converti | 90 jours après la dernière activité | job mensuel, `expire_le` |
| Devis converti en commande | rattaché à la commande | suit la commande |
| Fichiers de production | 24 mois après livraison | job mensuel, audit |
| Factures / justificatifs comptables | 10 ans (obligation à confirmer) | jamais par le job fichiers |
| Fichiers orphelins (aucune ligne métier) | 24 h | job quotidien |

`fichiers_devis.expire_le` et `fichiers_commande.expire_le` portent l'échéance. Un job
`FICHIER_ORPHELIN` vérifie l'existence de l'objet et de sa ligne ; il ne supprime jamais un
fichier encore référencé par une commande non clôturée.

La suppression est **logique d'abord** (ligne + date), puis physique après contrôle. Toute
suppression est inscrite dans `journal_audit`.

## 5. `design_snapshot` et régénération serveur

`commandes.design_snapshot` est un objet JSON, versionné. Schéma cible :

```json
{
  "version": 1,
  "produitId": "tshirt-basic",
  "productVersion": "2026-11",
  "couleur": "blanc",
  "profil": { "id": "dtf", "dpi": 300 },
  "taille": "M",
  "quantite": 10,
  "faces": [
    { "id": "front", "zoneId": "front", "fichier": "front.png", "dpi": 300, "largeurPx": 2480, "hauteurPx": 3543,
      "elements": [
        { "type": "texte", "contenu": "Smart Vision", "police": "Inter", "taille": 96, "couleur": "#111111", "x": 120, "y": 200, "rotation": 0 },
        { "type": "image", "path": "production/<commande>/<uuid>-logo.png", "checksum": "sha256:…", "x": 80, "y": 400, "largeur": 600, "hauteur": 300 }
      ] },
    { "id": "back", "zoneId": "back", "fichier": "back.png", "dpi": 300, "largeurPx": 2953, "hauteurPx": 3827, "elements": [] },
    { "id": "left-sleeve", "zoneId": "left-sleeve", "fichier": "left-sleeve.png", "dpi": 300, "largeurPx": 1063, "hauteurPx": 1063, "elements": [] },
    { "id": "right-sleeve", "zoneId": "right-sleeve", "fichier": "right-sleeve.png", "dpi": 300, "largeurPx": 1063, "hauteurPx": 1063, "elements": [] },
    { "id": "collar", "zoneId": "collar", "fichier": "collar.png", "dpi": 300, "largeurPx": 945, "hauteurPx": 531, "elements": [] }
  ],
  "rendu": { "largeurPx": 2480, "hauteurPx": 3543, "dpi": 300, "fond": "transparent", "profilId": "dtf" },
  "exporteLe": "2026-11-12T12:00:00.000Z"
}
```

Les cinq noms de fichiers (`front.png`, `back.png`, `left-sleeve.png`, `right-sleeve.png`,
`collar.png`) sont ceux que produit le configurateur et que l'atelier attend ; seules les zones
réellement personnalisées apparaissent. Les dimensions en pixels dépendent du `dpi` du procédé
et de la taille physique de la zone — elles ne sont jamais codées en dur (§2.1).

### 5.1 Fiche de production réellement produite (état livré, 12/11/2026)

Aujourd'hui, la fiche est générée côté navigateur par `buildProductionSheet()` au format
`ProductionSheet` **v2** (`src/lib/order/order.ts`), téléchargée en `.json` et `.txt`, puis
déposée avec les PNG dans l'archive privée `dossiers/<commande>/`. Extrait :

```json
{
  "version": 2,
  "commande": "ELB-20261112-1430-AB",
  "date": "2026-11-12",
  "produit": { "id": "tshirt-basic", "nom": "T-shirt Elembo oversize", "couleur": "#1A1A1C", "technique": "Transfert DTF" },
  "profil": { "id": "dtf", "nom": "Transfert DTF", "dpi": 300 },
  "faces": [
    { "side": "front", "label": "Face avant", "fichier": "front.png", "dpi": 300,
      "pixels": { "w": 2480, "h": 3543 }, "zoneCm": { "w": 21, "h": 30 },
      "placements": [ { "id": "text-001", "type": "text", "centreXCm": 10.5, "centreYCm": 15,
        "largeurCm": 8.2, "hauteurCm": 2.1, "rotationDeg": 0, "visible": true,
        "texte": { "police": "Anton", "corpsCm": 2.1, "couleur": "#FFFFFF" } } ] }
  ],
  "consignes": [ "Imprimer les fichiers fournis (PNG, fond transparent) sans les redimensionner ni les recadrer." ]
}
```

Le `design_snapshot` serveur décrit ci-dessus reste un **schéma cible** : il n'est pas encore
écrit en base, et la régénération serveur des PNG n'existe pas encore.

Règles :

- les images référencées sont conservées dans le bucket production, pas seulement en base64 ;
- le snapshot est figé au moment de la commande ; une modification ultérieure du configurateur
  ne change pas une commande passée ;
- un moteur de rendu serveur (lot 3.4) peut régénérer le PNG à partir du snapshot + des sources,
  sans navigateur client ;
- la version du schéma permet de refuser ou migrer un snapshot incompatible ;
- le snapshot ne contient aucun secret ni chemin absolu.

## 6. Risques résiduels

- Le rendu serveur n'existe pas encore : aujourd'hui, le PNG est produit par le navigateur et
  pré-déposé. Le snapshot est la garantie de régénération future, pas une régénération actuelle.
- La vérification par signature ne détecte pas un PNG malveillant structurellement valide ; le
  fichier est servi en téléchargement, jamais exécuté dans le navigateur.
- La limite de 50 Mo et la conservation doivent être confirmées avec le stockage Supabase choisi
  (quota et coût).

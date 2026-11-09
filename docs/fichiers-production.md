# Fichiers et production — vérification, stockage, conservation

Statut : règles de conception et colonnes livrées ; les routes d'envoi seront branchées au lot
3.2b. Aucun fichier de production réel n'a été manipulé pendant cette revue.

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
| `production` | PNG, PDF, JSON, TXT | 50 Mo | PNG 300 dpi pour l'impression |

Refusés : SVG, HTML, exécutables, archives autres que ZIP, fichiers sans extension, doubles
extensions (`logo.png.exe`), noms avec `..`, caractères de contrôle ou plus de 120 caractères.

Chemin imposé : `devis/<devis_id>/<uuid>-<nom-assaini>` ou
`production/<commande_id>/<uuid>-<nom-assaini>`. Le nom affiché est stocké séparément du chemin.

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
  "taille": "M",
  "quantite": 10,
  "faces": [
    {
      "id": "avant",
      "zoneId": "avant",
      "largeurPx": 1200,
      "hauteurPx": 1600,
      "dpi": 300,
      "elements": [
        { "type": "texte", "contenu": "Smart Vision", "police": "Inter", "taille": 96, "couleur": "#111111", "x": 120, "y": 200, "rotation": 0 },
        { "type": "image", "path": "production/<commande>/<uuid>-logo.png", "checksum": "sha256:…", "x": 80, "y": 400, "largeur": 600, "hauteur": 300 }
      ]
    }
  ],
  "rendu": { "largeurPx": 1200, "hauteurPx": 1600, "dpi": 300, "fond": "#ffffff" },
  "exporteLe": "2026-11-09T12:00:00.000Z"
}
```

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

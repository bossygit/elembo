# Elembo — design system : audit et proposition

10 octobre 2026 · banc d'essai du moteur `ui-ux-pro-max` sur la boutique
**Statut : proposition. Rien n'a été appliqué à la boutique.**

---

## 1. Méthode

1. Audit du code réel : 48 fichiers, 7 745 lignes (`src/**/*.{ts,tsx,css}`).
2. Recherches dans le moteur de règles (domaines `style`, `color`, `typography`, `product`,
   `landing`, `ux`, piles `nextjs`, `html-tailwind`, `laravel`) ; sortie persistée dans
   `design-system/elembo/MASTER.md`.
3. **Mesures de contraste calculées** selon la formule WCAG relative luminance — les rapports
   cités ici ne sont pas des estimations.
4. Vérification du rendu publié (CSS de `out/`, HTML final, polices réellement préchargées).

Une règle du moteur a servi deux fois : *« Before using a result, verify the returned
domain/category, top result identity, and whether its guidance fits the user's product and
platform. Retry once with a narrower rewrite… do not persist unverified output. »*

---

## 2. Ce que l'audit a trouvé

| Constat | Mesure | Portée |
|---|---|---|
| Le corps du site est rendu en **Arial**, pas en Geist | règle `body{…font-family:Arial,Helvetica,sans-serif}` présente dans le CSS publié | 100 % du texte d'interface |
| Geist est pourtant chargée et **préchargée à chaque page** | 2 fichiers `woff2` préchargés (23 Ko + 29 Ko) | ~29 Ko inutiles à chaque visite |
| L'orange de marque **échoue en texte courant** | `#e85f00` sur blanc = **3,46:1** (seuil 4,5:1) ; blanc sur `#e85f00` = 3,46:1 | boutons, liens, libellés |
| `neutral-400` **échoue partout** | `#a3a3a3` sur blanc = **2,52:1** | 8 usages |
| `neutral-300` en bordure est très faible | `#d4d4d4` sur blanc = **1,48:1** (seuil composant 3:1) | 36 usages de bordure |
| Les gris `neutral-*` dominent l'interface | `text-neutral-500` ×45, `border-neutral-300` ×36, `text-neutral-800` ×33 | 31 classes distinctes |
| La marque existe mais **n'est pas tokenisée** | `#e85f00` ×44, `#200233` ×9, `#fefcf6` ×3, dispersés dans les composants | aucun jeton central |
| Le violet de marque est la meilleure ressource, la moins utilisée | `#200233` sur blanc = **18,79:1** | 9 usages |
| `globals.css` est encore celui du modèle Next.js | 4 déclarations, aucune identité de marque | — |

Aucune de ces lignes ne remet en cause le travail fonctionnel : il manque une **couche de
jetons**, pas une refonte.

---

## 3. Ce que le moteur a apporté — et ce que j'ai écarté

**Retenu** (cohérent avec le produit *et* avec les mesures) :

- Style **Flat Design** : pas d'ombres, pas de dégradés, lignes nettes, transitions 150–200 ms
- Direction typographique **« poster / éditorial / vermillon »** : titres à empattement, contraste fort
- Structure de page **Feature-Rich Showcase** pour l'accueil
- Mouvement **subtil** au défilement, `prefers-reduced-motion` respecté
- Interdits explicites : dégradés violet/rose génériques, emojis en guise d'icônes

**Écarté** (et pourquoi) :

| Proposition du moteur | Verdict | Motif |
|---|---|---|
| Palette « Pharmacy green + trust blue » (`#15803D`, fond `#F0FDF4`) | rejetée | hors sujet pour un magasin d'impression d'art — **et le moteur la proposait encore après reprise ciblée** : je le signale au lieu de l'appliquer |
| Accent « creative pink » `#EC4899` | rejeté | contredit l'identité et l'interdit énoncé par le moteur lui-même |
| Police **Inter** | remplacée par **Geist** | Geist est déjà auto-hébergée par le projet : **0 Ko à ajouter** |
| Mode sombre du modèle (`#0a0a0a`/`#ededed`) | remplacé | le violet de marque fait mieux et donne une identité |

---

## 4. Jetons proposés (mesurés, avec usage autorisé)

### Mode clair

| Jeton | Valeur | Contraste | Usage autorisé |
|---|---|---|---|
| `--marque-orange` | `#e85f00` | 3,46:1 | aplats, icônes, **grand texte uniquement** (≥ 24 px, ou ≥ 18,66 px gras) |
| `--action-orange` | `#c75100` | **4,56:1** | texte courant, libellés de bouton — c'est le seul orange autorisé sous 24 px |
| `--encre-violet` | `#200233` | **18,79:1** | tout le texte |
| `--fond-creme` | `#fefcf6` | — | fond de page |
| `--surface` | `#ffffff` | — | cartes, champs |
| `--texte-attenue` | `#5b5b6b` | **6,66:1** | remplace `neutral-400` **et** `neutral-500` (4,74:1, tout juste conforme) |
| `--bordure-active` | `#8a86a0` | **3,50:1** | contours de champs et de contrôles (seuil composant 3:1) |
| `--filet` | `#e0dbd0` | — | séparateurs **décoratifs uniquement**, sans rôle d'information |

> Règle à retenir : un filet décoratif peut rester clair, mais **toute bordure qui signifie
> quelque chose** (un champ à remplir, un état sélectionné) doit atteindre 3:1.

### Mode sombre — le violet devient la surface

| Jeton | Valeur | Contraste |
|---|---|---|
| `--fond-sombre` | `#200233` | — |
| Texte | `#fefcf6` | **18,31:1** |
| Accent / état payé | `#e85f00` | **5,43:1** (conforme en texte courant) |
| Texte atténué | `#b9b2c9` | **9,19:1** |
| Accent pour petits libellés | `#ff8a3d` | **8,01:1** |

### Typographie

- **Interface : Geist** (déjà dans le build, licence déjà en place, poids 100–900 en une variable)
- **Titres : Playfair Display** (déjà embarquée dans `public/fonts/`) — c'est la police éditoriale
  que recommande le moteur, et elle est déjà là
- **Détails techniques et références de commande : Geist Mono** (déjà préchargée)
- Échelle au rapport 1,25 : `12,8 · 16 · 20 · 25 · 31 · 39 · 49 · 61 px`
- **Aucun téléchargement de police supplémentaire** — décisif sur une boutique consultée en
  connexion mobile

---

## 5. Plan d'application (si vous validez)

| Étape | Contenu | Effort | Risque |
|---|---|---|---|
| 1 | Jetons dans `globals.css` (`@theme`) : marque, sémantiques, échelle, filets | 1 h | nul — aucun rendu ne change tant que les composants ne les utilisent pas |
| 2 | Correction des contrastes : `neutral-400` → `--texte-attenue`, boutons → `--action-orange`, bordures de champs → `--bordure-active` | 2-3 h | faible, réversible par jeton |
| 3 | Polices : corriger la règle `body` qui force Arial, brancher Geist + Playfair sur les titres, retirer les fichiers inutilisés | 1 h | faible — gain immédiat de ~29 Ko par page |
| 4 | Mode sombre sur `--fond-sombre` violet | 2 h | faible, additif |
| 5 | Passe finale sur les états (focus visible, survol, désactivé, `prefers-reduced-motion`) | 2 h | faible |

Les étapes 1 à 3 suffisent à régler tout ce qui est mesurable. À noter : la boutique est en
ligne, donc chaque étape se vérifie sur le site publié avant la suivante.

---

## 6. Aperçu visuel

`design-system/elembo/apercu.html` — comparaison avant / après avec **les vraies polices du
projet** (Geist extraite du build, Playfair Display et Geist Mono copiées). Aucune ressource
externe : le fichier fonctionne hors ligne.

Rendu vérifié dans Chrome : `document.fonts.status = "loaded"`, titres en `"Playfair Display"`,
carte « avant » en `Arial`, bouton en `rgb(199, 81, 0)`, **aucune ressource en échec**.

---

## 7. Traçabilité

- Règles persistées par le moteur : `design-system/elembo/MASTER.md`
- Requêtes exécutées : `"print on demand custom apparel art store" --design-system`,
  `"ecommerce art print poster store" --domain color`, `"editorial poster art gallery"`
  `--domain typography`, `"print on demand ecommerce marketplace" --domain product`,
  `"form validation" --stack laravel`
- Mesures de contraste : formule WCAG sur 10 paires de couleurs réelles du projet,
  plus 12 candidates de remplacement
- Aucun prix, aucune donnée client, aucun secret n'a été transmis au moteur : toutes les
  requêtes sont génériques et les recherches sont locales.

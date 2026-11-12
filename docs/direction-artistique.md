# Elembo — direction artistique et système de design

Novembre 2026. Remplace la proposition de `design-system-elembo.md` (octobre 2026), conservée
pour son audit de contraste.

## Intention

Une marque à la rencontre du streetwear indépendant, du studio graphique et de la boutique
haut de gamme : forte visuellement, chaleureuse, ancrée dans la culture congolaise
contemporaine — sans folklore.

## Jetons (source : `src/app/globals.css`)

| Rôle | Jeton | Usage |
|---|---|---|
| Signature | `orange` | Aplats, grands titres, bouton « Créer ». Jamais le fond de toute une page. |
| Texte orange sur fond clair | `orange-action` | Seul orange autorisé sous 24 px sur crème ou blanc. |
| Contraste | `encre` | Noir profond : texte, sections sombres, boutons principaux. |
| Respiration | `creme`, `sable` | Fonds de page et de section. |
| Éditorial | `cobalt`, `citron`, `fuchsia`, `foret`, `soleil`, `lilas` | Collections et aplats ponctuels uniquement. |

Règle de contraste : sur un aplat orange, le texte est toujours `encre`, jamais blanc.

## Typographie

| Voix | Police | Classe |
|---|---|---|
| Titres | Bricolage Grotesque, grasse et serrée | `titre-editorial`, `titre-geant` (capitales), `font-display` |
| Accent | Instrument Serif italique | `accent-serif` — un mot ou un membre de phrase par titre |
| Interface | Geist | par défaut |
| Libellés | Geist, capitales espacées | `surtitre` |

## Mouvement

- **Entrées de page (hero)** : CSS pur (`ligne`, `animate-monte`, `animate-devoile`,
  `animate-surgit`). Aucune attente de JavaScript.
- **Au défilement** : un seul moteur, `src/components/motion/Mouvement.tsx`, piloté par
  attributs — `data-anim="monte" | "titre" | "image"` et `data-parallaxe="0.2"`.
  GSAP est chargé après l'hydratation ; tout est créé dans un `gsap.context()` annulé au
  changement de page.
- **Rien n'est masqué en CSS** : sans JavaScript, tout le contenu est visible.
- **`prefers-reduced-motion`** : aucune animation GSAP n'est créée ; les animations CSS sont
  neutralisées dans `globals.css`.
- Parallaxe et vignette au pointeur : écrans larges uniquement.

## Composants de marque

`Bandeau` (défilant), `Sticker` (pastille tournante), `AfficheCollection` (affiche
typographique), `Surtitre`, `Etiquette`, `BoutonLien` / `BoutonWhatsApp`, `BarreMobile`
(navigation basse sur téléphone).

## Contenus de démonstration — à remplacer

- **Photos** : `public/photos/` contient des photos d'illustration Pexels (voir son
  `CREDITS.md`). Les personnes ne portent pas de créations Elembo. À remplacer par une séance
  photo réelle.
- **Maquettes** : les impressions visibles sur les t-shirts du hero et de la section atelier
  sont posées en CSS. Elles sont légendées « maquette de démonstration ».
- **Collections** : les cinq collections sont annoncées « Bientôt ». Les textes en lingala et
  en kituba restent des emplacements `aValider` (voir `tests/univers.test.ts`).
- **Communauté** : la section est vide par construction, avec des emplacements réservés.
- **Réseaux sociaux** : `RESEAUX` dans `src/lib/site/marque.ts` est vide ; le pied de page
  n'affiche la rubrique que lorsqu'elle est remplie.

## Ton

L'accueil tutoie (« Crée ce qui te ressemble »). Les pages de commande, de devis et d'aide
vouvoient encore : à harmoniser une fois le ton validé.

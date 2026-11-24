// Lot 0 — document de référence du Banner Studio (modèle §4.3 de l'audit), en millimètres.
// Origine en haut à gauche de la surface finie ; xMm/yMm = centre de l'élément ; rotation autour du centre.
// PROTOTYPE JETABLE : ne pas fusionner.

/** Fabrique un document « hommage » pour des dimensions données (le contenu suit la largeur). */
export function documentHommage({ largeurMm = 3000, hauteurMm = 1000, fondPerduMm = 0 } = {}) {
  const l = largeurMm;
  const h = hauteurMm;
  const cx = l * 0.58; // centre du bloc de texte, à droite du portrait
  return {
    schema: 'elembo.banner',
    version: 1,
    id: 'spike-hommage',
    nom: 'Hommage — essai lot 0',
    support: 'BANDEROLE',
    categorie: 'DEUIL',
    dimensions: { largeurMm: l, hauteurMm: h },
    contraintes: { margeSecuriteMm: 50, fondPerduMm },
    fond: { type: 'couleur', couleur: '#0D0B10' },
    assets: [
      { id: 'portrait', nom: 'tableau-interieur.jpg', mime: 'image/jpeg', largeurPx: 1600, hauteurPx: 2844 },
      { id: 'logo', nom: 'logo-transparent.png', mime: 'image/png', largeurPx: 900, hauteurPx: 900 },
    ],
    elements: [
      {
        id: 'cadre', type: 'forme', xMm: l / 2, yMm: h / 2, largeurMm: l - 80, hauteurMm: h - 80, rotationDeg: 0, opacite: 1,
        forme: { nature: 'rect', fond: null, contour: '#D9C08A', epaisseurMm: 6, rayonMm: 0 },
      },
      {
        id: 'portrait', type: 'image', xMm: h * 0.55, yMm: h / 2, largeurMm: h * 0.62, hauteurMm: h * 0.78, rotationDeg: 0, opacite: 1,
        image: { assetId: 'portrait', recadrage: { x: 0.1, y: 0.2, l: 0.8, h: 0.6 }, ajustement: 'cover' },
      },
      {
        id: 'surtitre', type: 'texte', xMm: cx, yMm: h * 0.2, largeurMm: l * 0.6, hauteurMm: h * 0.09, rotationDeg: 0, opacite: 1,
        texte: { contenu: 'HOMMAGE À NOTRE REGRETTÉ', policeId: 'bebas-neue', corpsMm: h * 0.075, couleur: '#D9C08A', alignement: 'center', interlettrageEm: 0.18, interligne: 1 },
      },
      {
        id: 'nom', type: 'texte', xMm: cx, yMm: h * 0.43, largeurMm: l * 0.62, hauteurMm: h * 0.24, rotationDeg: 0, opacite: 1,
        texte: { contenu: 'Papa Joseph Malonga', policeId: 'dm-serif-display', corpsMm: h * 0.2, couleur: '#FBF7EE', alignement: 'center', interlettrageEm: 0, interligne: 1.05 },
      },
      {
        id: 'filet', type: 'forme', xMm: cx, yMm: h * 0.6, largeurMm: l * 0.36, hauteurMm: 5, rotationDeg: 0, opacite: 1,
        forme: { nature: 'rect', fond: '#D9C08A', contour: null, epaisseurMm: 0, rayonMm: 0 },
      },
      {
        id: 'dates', type: 'texte', xMm: cx, yMm: h * 0.75, largeurMm: l * 0.6, hauteurMm: h * 0.2, rotationDeg: 0, opacite: 1,
        texte: { contenu: '1951 — 2026\n« Tu resteras à jamais dans nos cœurs »', policeId: 'dm-serif-display', corpsMm: h * 0.07, couleur: '#E9E2D2', alignement: 'center', interlettrageEm: 0, interligne: 1.25 },
      },
      {
        id: 'logo', type: 'image', xMm: l - h * 0.22, yMm: h * 0.24, largeurMm: h * 0.24, hauteurMm: h * 0.24, rotationDeg: 12, opacite: 0.9,
        image: { assetId: 'logo', recadrage: { x: 0, y: 0, l: 1, h: 1 }, ajustement: 'contain' },
      },
      {
        id: 'mention', type: 'texte', xMm: l - h * 0.22, yMm: h * 0.82, largeurMm: h * 0.5, hauteurMm: h * 0.08, rotationDeg: -8, opacite: 1,
        texte: { contenu: 'Famille Malonga', policeId: 'anton', corpsMm: h * 0.055, couleur: '#E87A2E', alignement: 'center', interlettrageEm: 0.04, interligne: 1 },
      },
    ],
    meta: { versionRendu: 1, origine: 'spike-lot0' },
  };
}

/** Polices du spike : identifiant du document → fichier TTF et famille CSS (même dessin que les WOFF2 du site). */
export const POLICES = {
  anton: { fichier: 'Anton-Regular.ttf', famille: 'Anton' },
  'bebas-neue': { fichier: 'BebasNeue-Regular.ttf', famille: 'Bebas Neue' },
  'dm-serif-display': { fichier: 'DMSerifDisplay-Regular.ttf', famille: 'DM Serif Display' },
};

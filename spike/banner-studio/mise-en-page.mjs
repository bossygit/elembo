// Lot 0 — mise en page du texte partagée par l'éditeur Konva et le rendu PDF (mêmes lignes, mêmes métriques).
// PROTOTYPE JETABLE : ne pas fusionner.

/**
 * Mise en page d'un bloc de texte, en mm, relative au centre de l'élément (y vers le bas).
 * Même formule dans l'éditeur : lignes explicites, interligne, interlettrage, alignement.
 */
export function lignesTexte(element, metriques, mesurerLigneMm) {
  const t = element.texte;
  const lignes = t.contenu.split('\n');
  const hauteurLigne = t.corpsMm * t.interligne;
  const bloc = hauteurLigne * lignes.length;
  const espace = t.interlettrageEm * t.corpsMm;
  const oeil = (metriques.ascendante - metriques.descendante) * t.corpsMm;
  return lignes.map((texte, i) => {
    const largeur = mesurerLigneMm(texte, t.corpsMm) + espace * Math.max(0, [...texte].length - 1);
    const x = t.alignement === 'left' ? -element.largeurMm / 2 : t.alignement === 'right' ? element.largeurMm / 2 - largeur : -largeur / 2;
    const ligneBase = -bloc / 2 + i * hauteurLigne + (hauteurLigne - oeil) / 2 + metriques.ascendante * t.corpsMm;
    return { texte, x, ligneBase, largeur };
  });
}

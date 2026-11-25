'use client';

import type { ModeAlignement } from '@/lib/banner/geometry';
import { chargerPolice, policePrete } from '@/lib/banner/navigateur';
import type { Alignement, StyleTexte } from '@/lib/banner/model';
import { graisseDisponible, POLICES } from '@/lib/banner/polices';
import { BORNES } from '@/lib/banner/schema';

import { Bouton, ChampChoix, ChampCouleur, ChampNombre, ChampTexte, Groupe } from './champs';
import { useActions, useContexte, useSelection } from './contexte';

const ALIGNEMENTS: { mode: ModeAlignement; nom: string; court: string }[] = [
  { mode: 'gauche', nom: 'Aligner à gauche de la zone de sécurité', court: 'Gauche' },
  { mode: 'centre-h', nom: 'Centrer horizontalement', court: 'Centre' },
  { mode: 'droite', nom: 'Aligner à droite de la zone de sécurité', court: 'Droite' },
  { mode: 'haut', nom: 'Aligner en haut de la zone de sécurité', court: 'Haut' },
  { mode: 'centre-v', nom: 'Centrer verticalement', court: 'Milieu' },
  { mode: 'bas', nom: 'Aligner en bas de la zone de sécurité', court: 'Bas' },
];

export function Inspecteur() {
  const a = useActions();
  const { store } = useContexte();
  const e = useSelection();
  if (!e) return <Groupe titre="Propriétés"><p className="text-sm text-attenue">Sélectionnez un élément sur la banderole ou dans les calques.</p></Groupe>;
  const bloque = e.verrouille;

  // La police doit être chargée avant la mesure : sinon le cadre est calculé sur la police de secours.
  const style = async (s: Partial<StyleTexte>) => {
    if (e.type !== 'texte') return;
    const voulu = { ...e.texte, ...s };
    if (s.contenu === undefined) {
      if (!policePrete(voulu)) await chargerPolice(voulu);
      a.poserTexte(e.id, s);
      return;
    }
    // La frappe s'applique tout de suite (sinon le curseur saute) ; si un nouveau caractère demande
    // un autre fichier de police, le cadre est recalculé une fois ce fichier arrivé.
    a.poserTexte(e.id, s);
    if (policePrete(voulu)) return;
    await chargerPolice(voulu);
    const x = store.getState().document.elements.find((y) => y.id === e.id);
    if (x?.type === 'texte') a.poserTexte(x.id, { contenu: x.texte.contenu });
  };

  return (
    <div data-testid="inspecteur">
      {bloque ? (
        <Groupe titre="Élément verrouillé">
          <Bouton icone="ouvert" libelle="Déverrouiller l’élément" texte="Déverrouiller" className="border border-bordure" onClick={() => a.poserProprietes(e.id, { verrouille: false })} />
        </Groupe>
      ) : null}
      {e.type === 'texte' ? (
        <Groupe titre="Texte">
          <ChampTexte libelle="Contenu" valeur={e.texte.contenu === ' ' ? '' : e.texte.contenu} maxLength={BORNES.texteMax} disabled={bloque} onValeur={(contenu) => void style({ contenu })} />
          <ChampChoix libelle="Police" valeur={e.texte.policeId} disabled={bloque} options={POLICES.map((p) => ({ valeur: p.id, texte: p.nom }))} onValeur={(policeId) => void style({ policeId, graisse: graisseDisponible({ policeId, graisse: e.texte.graisse }) })} />
          <div className="grid grid-cols-2 gap-2">
            <ChampNombre libelle="Corps" unite="mm" valeur={e.texte.corpsMm} min={5} max={5000} disabled={bloque} onValeur={(corpsMm) => void style({ corpsMm })} />
            <ChampChoix<400 | 700> libelle="Graisse" valeur={graisseDisponible(e.texte)} disabled={bloque} options={(POLICES.find((p) => p.id === e.texte.policeId)?.graisses ?? [400]).map((g) => ({ valeur: g, texte: g === 700 ? 'Gras' : 'Normal' }))} onValeur={(graisse) => void style({ graisse })} />
          </div>
          <ChampChoix<Alignement> libelle="Alignement des lignes" valeur={e.texte.alignement} disabled={bloque} options={[{ valeur: 'left', texte: 'Gauche' }, { valeur: 'center', texte: 'Centre' }, { valeur: 'right', texte: 'Droite' }]} onValeur={(alignement) => void style({ alignement })} />
          <ChampCouleur libelle="Couleur du texte" valeur={e.texte.couleur} disabled={bloque} onValeur={(couleur) => void style({ couleur })} />
        </Groupe>
      ) : null}
      {e.type === 'forme' ? (
        <Groupe titre="Forme">
          {e.forme.fond ? <ChampCouleur libelle="Couleur de la forme" valeur={e.forme.fond} disabled={bloque} onValeur={(fond) => a.poserForme(e.id, { fond })} /> : null}
          {e.forme.contour ? <ChampCouleur libelle="Couleur du contour" valeur={e.forme.contour} disabled={bloque} onValeur={(contour) => a.poserForme(e.id, { contour })} /> : null}
        </Groupe>
      ) : null}
      {e.type === 'image' ? (
        <Groupe titre="Image">
          <ChampChoix<'cover' | 'contain'> libelle="Remplissage du cadre" valeur={e.image.ajustement} disabled={bloque} options={[{ valeur: 'cover', texte: 'Remplir le cadre (recadre)' }, { valeur: 'contain', texte: 'Image entière' }]} onValeur={(v) => a.poserAjustement(e.id, v)} />
        </Groupe>
      ) : null}
      <Groupe titre="Position et taille">
        <div className="grid grid-cols-2 gap-2">
          <ChampNombre libelle="Centre X" unite="cm" valeur={e.xMm / 10} disabled={bloque} onValeur={(v) => a.poserGeometrie(e.id, { xMm: v * 10 }, 'x')} />
          <ChampNombre libelle="Centre Y" unite="cm" valeur={e.yMm / 10} disabled={bloque} onValeur={(v) => a.poserGeometrie(e.id, { yMm: v * 10 }, 'y')} />
          <ChampNombre libelle="Largeur" unite="cm" min={0.1} valeur={e.largeurMm / 10} disabled={bloque} onValeur={(v) => a.poserGeometrie(e.id, { largeurMm: v * 10 }, 'l')} />
          <ChampNombre libelle="Hauteur" unite="cm" min={0.1} valeur={e.hauteurMm / 10} disabled={bloque} onValeur={(v) => a.poserGeometrie(e.id, { hauteurMm: v * 10 }, 'h')} />
          <ChampNombre libelle="Rotation" unite="°" min={-360} max={360} valeur={e.rotationDeg} disabled={bloque} onValeur={(rotationDeg) => a.poserGeometrie(e.id, { rotationDeg }, 'r')} />
          <ChampNombre libelle="Opacité" unite="%" min={0} max={100} pas={5} valeur={e.opacite * 100} disabled={bloque} onValeur={(v) => a.poserProprietes(e.id, { opacite: v / 100 })} />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ALIGNEMENTS.map((x) => <Bouton key={x.mode} libelle={x.nom} texte={x.court} disabled={bloque} className="border border-bordure !px-1 text-xs" onClick={() => a.aligner(x.mode)} />)}
        </div>
      </Groupe>
      <Groupe titre="Élément">
        <div className="flex flex-wrap gap-1.5">
          <Bouton icone="copier" libelle="Dupliquer" texte="Dupliquer" className="border border-bordure" onClick={() => a.dupliquer()} />
          <Bouton icone="supprimer" libelle="Supprimer" texte="Supprimer" className="border border-bordure text-red-800" disabled={bloque} onClick={() => a.supprimer()} />
          <Bouton libelle="Mettre au premier plan" texte="Premier plan" className="border border-bordure" onClick={() => a.reordonner(e.id, 'dessus')} />
          <Bouton libelle="Mettre à l’arrière-plan" texte="Arrière-plan" className="border border-bordure" onClick={() => a.reordonner(e.id, 'fond')} />
        </div>
      </Groupe>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';

import { zones } from '@/lib/banner/constraints';
import { couleursDocument, largeurLigne } from '@/lib/banner/edition';
import { decoration } from '@/lib/banner/formes';
import type { ModeAlignement } from '@/lib/banner/geometry';
import type { Alignement, ElementForme, ElementImage, ElementTexte, StyleTexte } from '@/lib/banner/model';
import { chargerPolice, policePrete } from '@/lib/banner/navigateur';
import { CATEGORIES_POLICE, glyphesManquants, POLICES, policesPour, variantesPossibles } from '@/lib/banner/polices';
import { dpiEffectif, largeurNetteMm, niveauQualite, seuils } from '@/lib/banner/quality';
import { BORNES } from '@/lib/banner/schema';

import { Bouton, BoutonFichier, ChampCase, ChampChoix, ChampCouleur, ChampLigne, ChampNombre, ChampTexte, Groupe } from './champs';
import { useActions, useContexte, useImportImage, useSelection, useStudio } from './contexte';

const ALIGNEMENTS: { mode: ModeAlignement; nom: string; court: string }[] = [
  { mode: 'gauche', nom: 'Aligner à gauche de la zone de sécurité', court: 'Gauche' },
  { mode: 'centre-h', nom: 'Centrer horizontalement', court: 'Centre' },
  { mode: 'droite', nom: 'Aligner à droite de la zone de sécurité', court: 'Droite' },
  { mode: 'haut', nom: 'Aligner en haut de la zone de sécurité', court: 'Haut' },
  { mode: 'centre-v', nom: 'Centrer verticalement', court: 'Milieu' },
  { mode: 'bas', nom: 'Aligner en bas de la zone de sécurité', court: 'Bas' },
];
const GROUPES_POLICES = Object.entries(CATEGORIES_POLICE).map(([c, titre]) => ({ titre, options: POLICES.filter((p) => p.categorie === c).map((p) => ({ valeur: p.id, texte: p.nom })) }));
const BORD = 'border border-bordure';
const nombre = (v: number, decimales = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: decimales });

export function Inspecteur() {
  const a = useActions();
  const e = useSelection();
  const proportions = useStudio((s) => s.proportions);
  if (!e) return <Groupe titre="Propriétés"><p className="text-sm text-attenue">Sélectionnez un élément sur la banderole ou dans les calques.</p></Groupe>;
  const bloque = e.verrouille;
  const libre = e.type !== 'texte' && !(e.type === 'forme' && decoration(e.forme.nature));
  const lie = libre && proportions[e.type as 'image' | 'forme'];
  const poserCote = (cote: 'largeurMm' | 'hauteurMm', mm: number) => {
    const k = mm / e[cote];
    const autre = cote === 'largeurMm' ? 'hauteurMm' : 'largeurMm';
    a.poserGeometrie(e.id, lie ? { [cote]: mm, [autre]: e[autre] * k } : { [cote]: mm }, cote);
  };

  return (
    <div data-testid="inspecteur">
      {bloque ? (
        <Groupe titre="Élément verrouillé">
          <Bouton icone="ouvert" libelle="Déverrouiller l’élément" texte="Déverrouiller" className={BORD} onClick={() => a.poserProprietes(e.id, { verrouille: false })} />
        </Groupe>
      ) : null}
      {e.type === 'texte' ? <SectionTexte key={e.id} e={e} /> : null}
      {e.type === 'forme' ? <SectionForme e={e} /> : null}
      {e.type === 'image' ? <SectionImage e={e} /> : null}
      <Groupe titre="Position et taille">
        <div className="grid grid-cols-2 gap-2">
          <ChampNombre libelle="Centre X" unite="cm" valeur={e.xMm / 10} disabled={bloque} onValeur={(v) => a.poserGeometrie(e.id, { xMm: v * 10 }, 'x')} />
          <ChampNombre libelle="Centre Y" unite="cm" valeur={e.yMm / 10} disabled={bloque} onValeur={(v) => a.poserGeometrie(e.id, { yMm: v * 10 }, 'y')} />
          <ChampNombre libelle="Largeur" unite="cm" min={0.1} valeur={e.largeurMm / 10} disabled={bloque} onValeur={(v) => poserCote('largeurMm', v * 10)} />
          <ChampNombre libelle="Hauteur" unite="cm" min={0.1} valeur={e.hauteurMm / 10} disabled={bloque} onValeur={(v) => poserCote('hauteurMm', v * 10)} />
          <ChampNombre libelle="Rotation" unite="°" min={-360} max={360} valeur={e.rotationDeg} disabled={bloque} onValeur={(rotationDeg) => a.poserGeometrie(e.id, { rotationDeg }, 'r')} />
          <ChampNombre libelle="Opacité" unite="%" min={0} max={100} pas={5} valeur={e.opacite * 100} disabled={bloque} onValeur={(v) => a.poserProprietes(e.id, { opacite: v / 100 })} />
        </div>
        {libre ? <ChampCase libelle="Garder les proportions" valeur={lie} disabled={bloque} onValeur={() => a.basculerProportions(e.type as 'image' | 'forme')} /> : null}
        <div className="grid grid-cols-3 gap-1.5">
          {ALIGNEMENTS.map((x) => <Bouton key={x.mode} libelle={x.nom} texte={x.court} disabled={bloque} className={`${BORD} !px-1 text-xs`} onClick={() => a.aligner(x.mode)} />)}
        </div>
      </Groupe>
      <Groupe titre="Élément">
        <ChampLigne key={e.id} libelle="Nom dans les calques" valeur={e.nom} maxLength={BORNES.nomMax} onValeur={(nom) => a.poserProprietes(e.id, { nom })} />
        <div className="flex flex-wrap gap-1.5">
          <Bouton icone="copier" libelle="Dupliquer" texte="Dupliquer" className={BORD} onClick={() => a.dupliquer()} />
          <Bouton icone="supprimer" libelle="Supprimer" texte="Supprimer" className={`${BORD} text-red-800`} disabled={bloque} onClick={() => a.supprimer()} />
          <Bouton libelle="Mettre au premier plan" texte="Premier plan" className={BORD} onClick={() => a.reordonner(e.id, 'dessus')} />
          <Bouton libelle="Mettre à l’arrière-plan" texte="Arrière-plan" className={BORD} onClick={() => a.reordonner(e.id, 'fond')} />
        </div>
      </Groupe>
    </div>
  );
}

function SectionTexte({ e }: { e: ElementTexte }) {
  const a = useActions();
  const { store, images } = useContexte();
  const document = useStudio((s) => s.document);
  const demande = useStudio((s) => s.demandeTexte);
  const echec = useStudio((s) => s.policesEchouees.has(e.texte.policeId));
  const champ = useRef<HTMLTextAreaElement>(null);
  const t = e.texte;
  const bloque = e.verrouille;
  const possibles = variantesPossibles(t);
  const manquants = glyphesManquants(t.policeId, t.contenu);
  const remplacantes = manquants.length ? policesPour(t.contenu).slice(0, 4) : [];
  const zone = zones(document).zoneSure;
  const mesure = largeurLigne(t, images.mesurer);
  const tropLarge = t.contenu.split('\n').some((l) => l.trim().includes(' ') && mesure(l) > zone.largeur);

  useEffect(() => {
    if (!demande || !champ.current) return;
    champ.current.focus();
    champ.current.select();
    store.getState().texteVu();
  }, [demande, store]);

  // La police doit être chargée avant la mesure : sinon le cadre est calculé sur la police de secours.
  const style = async (s: Partial<StyleTexte>) => {
    const voulu = { ...t, ...s };
    if (!policePrete(voulu)) a.declarerPolice(voulu.policeId, await chargerPolice(voulu));
    a.poserTexte(e.id, s);
  };

  return (
    <Groupe titre="Texte">
      <ChampTexte ref={champ} libelle="Contenu" valeur={t.contenu === ' ' ? '' : t.contenu} maxLength={BORNES.texteMax} disabled={bloque} onValeur={(contenu) => a.poserTexte(e.id, { contenu })} />
      {manquants.length ? (
        <div role="alert" className="rounded-lg border border-red-700 p-2 text-xs text-red-800" data-testid="glyphes">
          <p>Cette police ne contient pas : <strong className="break-all">{manquants.slice(0, 12).join(' ')}</strong></p>
          {remplacantes.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {remplacantes.map((p) => <Bouton key={p.id} libelle={`Utiliser ${p.nom}`} texte={p.nom} disabled={bloque} className="border border-red-700 !text-xs" onClick={() => void style({ policeId: p.id })} />)}
            </div>
          ) : <p className="mt-1">Aucune police du Studio ne les contient : retirez-les du texte.</p>}
        </div>
      ) : null}
      {echec ? <p role="alert" className="rounded-lg border border-red-700 p-2 text-xs text-red-800">Cette police n’a pas pu être chargée. Vérifiez la connexion puis rechargez la page, ou choisissez-en une autre.</p> : null}
      <ChampChoix libelle="Police" valeur={t.policeId} disabled={bloque} groupes={GROUPES_POLICES} onValeur={(policeId) => void style({ policeId })} />
      <div className="flex flex-wrap gap-1.5">
        <Bouton libelle="Gras" texte={<b>G</b>} actif={t.graisse === 700} className={BORD} disabled={bloque || !(t.graisse === 700 ? possibles.normal : possibles.gras)} onClick={() => void style({ graisse: t.graisse === 700 ? 400 : 700 })} />
        <Bouton libelle="Italique" texte={<i className="font-serif">I</i>} actif={t.italique} className={BORD} disabled={bloque || (!t.italique && !possibles.italique)} onClick={() => void style({ italique: !t.italique })} />
        <span className="flex-1" />
        {(['left', 'center', 'right'] as Alignement[]).map((x) => (
          <Bouton key={x} icone={x === 'left' ? 'alGauche' : x === 'center' ? 'alCentre' : 'alDroite'} libelle={`Lignes alignées ${x === 'left' ? 'à gauche' : x === 'center' ? 'au centre' : 'à droite'}`} actif={t.alignement === x} className={BORD} disabled={bloque} onClick={() => void style({ alignement: x })} />
        ))}
      </div>
      {t.graisse === 400 && !possibles.gras ? <p className="text-xs text-attenue">Cette police n’a pas de gras{possibles.italique || t.italique ? '' : ' ni d’italique'}.</p> : !possibles.italique && !t.italique ? <p className="text-xs text-attenue">Cette police n’a pas d’italique.</p> : null}
      <div className="grid grid-cols-3 gap-2">
        <ChampNombre libelle="Corps" unite="mm" valeur={t.corpsMm} min={5} max={5000} disabled={bloque} onValeur={(corpsMm) => void style({ corpsMm })} />
        <ChampNombre libelle="Interligne" valeur={t.interligne} min={0.5} max={3} pas={0.05} disabled={bloque} onValeur={(interligne) => void style({ interligne })} />
        <ChampNombre libelle="Lettres" unite="%" valeur={t.interlettrageEm * 100} min={-20} max={100} disabled={bloque} onValeur={(v) => void style({ interlettrageEm: v / 100 })} />
      </div>
      {tropLarge ? <Bouton libelle="Couper le texte aux marges" texte="Couper aux marges" className={BORD} disabled={bloque} onClick={() => a.couperTexte(e.id)} /> : null}
      <ChampCouleur libelle="Couleur du texte" valeur={t.couleur} suggestions={couleursDocument(document)} disabled={bloque} onValeur={(couleur) => void style({ couleur })} />
    </Groupe>
  );
}

function SectionForme({ e }: { e: ElementForme }) {
  const a = useActions();
  const document = useStudio((s) => s.document);
  const { fond, contour, epaisseurMm, rayonMm, nature } = e.forme;
  const suggestions = couleursDocument(document);
  return (
    <Groupe titre="Forme">
      <ChampCase libelle="Remplissage" valeur={fond !== null} disabled={e.verrouille || contour === null} onValeur={(v) => a.poserForme(e.id, { fond: v ? (contour ?? '#E87A2E') : null })} />
      {fond !== null ? <ChampCouleur libelle="Couleur de la forme" valeur={fond} suggestions={suggestions} disabled={e.verrouille} onValeur={(c) => a.poserForme(e.id, { fond: c })} /> : null}
      <ChampCase libelle="Contour" valeur={contour !== null} disabled={e.verrouille || fond === null} onValeur={(v) => a.poserForme(e.id, v ? { contour: '#18181A' } : { contour: null })} />
      {contour !== null ? (
        <>
          <ChampCouleur libelle="Couleur du contour" valeur={contour} suggestions={suggestions} disabled={e.verrouille} onValeur={(c) => a.poserForme(e.id, { contour: c })} />
          <ChampNombre libelle="Épaisseur du contour" unite="mm" valeur={epaisseurMm} min={1} max={500} disabled={e.verrouille} onValeur={(v) => a.poserForme(e.id, { epaisseurMm: v })} />
        </>
      ) : null}
      {nature === 'rect' ? <ChampNombre libelle="Arrondi des coins" unite="mm" valeur={rayonMm} min={0} max={5000} pas={10} disabled={e.verrouille} onValeur={(v) => a.poserForme(e.id, { rayonMm: v })} /> : null}
    </Groupe>
  );
}

const QUALITE = {
  BONNE: { texte: 'bonne', classe: 'text-succes' },
  FAIBLE: { texte: 'juste', classe: 'text-alerte' },
  INSUFFISANTE: { texte: 'insuffisante', classe: 'text-red-800' },
} as const;

function SectionImage({ e }: { e: ElementImage }) {
  const a = useActions();
  const importer = useImportImage();
  const document = useStudio((s) => s.document);
  const presente = useStudio((s) => !s.charge || (s.disponibles?.has(e.image.assetId) ?? false));
  const asset = document.assets.find((x) => x.id === e.image.assetId);
  const bloque = e.verrouille;
  const s = seuils(document.qualite.distanceLectureM, document.contraintes);
  const dpi = asset ? dpiEffectif(e, asset) : 0;
  const q = QUALITE[niveauQualite(dpi, s)];
  return (
    <Groupe titre="Image">
      {asset && presente ? (
        <p className="text-sm" data-testid="qualite">
          Définition <strong className={q.classe}>{q.texte}</strong> : {dpi} dpi
          <span className="block text-xs text-attenue">
            {asset.largeurPx} × {asset.hauteurPx} px. Pour cette impression : {s.min} dpi au moins, {s.recommande} conseillés.
            {dpi < s.min ? ` Nette jusqu’à ${nombre(largeurNetteMm(e, asset, s.min) / 10)} cm de large.` : ''}
          </span>
        </p>
      ) : <p role="alert" className="text-sm text-red-800">Image introuvable sur cet appareil : remplacez-la.</p>}
      <div className="flex flex-wrap gap-1.5">
        <Bouton icone="recadrer" libelle="Recadrer l’image" texte="Recadrer" className={BORD} disabled={bloque || !presente} onClick={() => a.ouvrirRecadrage(e.id)} />
        <BoutonFichier icone="remplacer" libelle="Remplacer l’image" texte="Remplacer" testid="remplacer-image" className={BORD} disabled={bloque} onFichier={(f) => void importer(f, { vers: 'remplacer', id: e.id })} />
        <Bouton icone="fond" libelle="Utiliser comme fond" texte="Mettre en fond" className={BORD} disabled={bloque || !presente} onClick={() => a.mettreEnFond(e.id)} />
      </div>
      <ChampChoix<'cover' | 'contain'> libelle="Remplissage du cadre" valeur={e.image.ajustement} disabled={bloque} options={[{ valeur: 'cover', texte: 'Remplir le cadre (recadre)' }, { valeur: 'contain', texte: 'Image entière' }]} onValeur={(v) => a.poserAjustement(e.id, v)} />
    </Groupe>
  );
}

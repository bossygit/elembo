'use client';

import { DIMENSION_MAX_MM, DIMENSION_MIN_MM, FORMATS, finitionsApplicables } from '@/lib/banner/formats';
import { couleursDocument } from '@/lib/banner/edition';
import { DECORATIONS } from '@/lib/banner/formes';
import type { DistanceLecture, FinitionStudio, SupportStudio } from '@/lib/banner/model';
import { dpiFond, seuils } from '@/lib/banner/quality';
import { FINITIONS, SUPPORTS } from '@/lib/grand-format/catalogue';

import { Bouton, BoutonFichier, ChampChoix, ChampCouleur, ChampNombre, Groupe } from './champs';
import { useActions, useImportImage, useStudio } from './contexte';

const LARGE = 'w-full justify-start border border-bordure bg-white';
const CASE = 'border border-bordure bg-white !px-1';

export function PanneauAjouter({ apres }: { apres?: () => void }) {
  const a = useActions();
  const importer = useImportImage();
  const faire = (f: () => void) => () => {
    f();
    apres?.();
  };
  return (
    <>
      <Groupe titre="Ajouter">
        <Bouton icone="format" libelle="Choisir un modèle" texte="Choisir un modèle" className={LARGE} onClick={() => a.ouvrirFenetre('modeles')} />
        <Bouton icone="texte" libelle="Ajouter un texte" texte="Texte" className={LARGE} onClick={faire(a.ajouterTexte)} />
        <BoutonFichier icone="image" libelle="Importer une image" texte="Image (JPEG, PNG, WEBP)" testid="import-image" className={LARGE} onFichier={(f) => void importer(f).then(apres)} />
      </Groupe>
      <Groupe titre="Formes">
        <div className="grid grid-cols-4 gap-2">
          <Bouton icone="rect" libelle="Ajouter un rectangle" className={CASE} onClick={faire(() => a.ajouterForme('rect'))} />
          <Bouton icone="ellipse" libelle="Ajouter une ellipse" className={CASE} onClick={faire(() => a.ajouterForme('ellipse'))} />
          <Bouton icone="ligne" libelle="Ajouter un filet" className={CASE} onClick={faire(() => a.ajouterForme('ligne'))} />
          {DECORATIONS.map((d) => (
            <Bouton
              key={d.id}
              libelle={`Ajouter : ${d.nom}`}
              className={CASE}
              onClick={faire(() => a.ajouterForme(d.id))}
              texte={<svg viewBox={`0 0 ${d.largeur} ${d.hauteur}`} className="h-5 w-7" aria-hidden="true"><path d={d.trace} fill="currentColor" /></svg>}
            />
          ))}
        </div>
      </Groupe>
    </>
  );
}

export function PanneauFond() {
  const a = useActions();
  const importer = useImportImage();
  const document = useStudio((e) => e.document);
  const { fond, assets } = document;
  const asset = fond.type === 'image' ? assets.find((x) => x.id === fond.assetId) : undefined;
  return (
    <Groupe titre="Fond">
      <ChampCouleur libelle="Couleur du fond" valeur={fond.couleur} suggestions={couleursDocument(document)} onValeur={a.poserFond} />
      <div className="space-y-3 border-t border-filet pt-3">
        {fond.type === 'image' ? (
          <>
            <p className="truncate text-sm" data-testid="fond-image">Image : {asset?.nom ?? 'introuvable'}{asset ? <span className="text-xs text-attenue"> · {dpiFond(document, asset)} dpi</span> : null}</p>
            <ChampChoix<'cover' | 'contain'> libelle="Placement de l’image de fond" valeur={fond.ajustement} options={[{ valeur: 'cover', texte: 'Couvrir toute la banderole' }, { valeur: 'contain', texte: 'Image entière' }]} onValeur={a.poserAjustementFond} />
          </>
        ) : <p className="text-xs text-attenue">Une image de fond couvre toute la banderole, fond perdu compris.</p>}
        <div className="flex flex-wrap gap-1.5">
          <BoutonFichier icone="image" libelle={fond.type === 'image' ? 'Changer l’image de fond' : 'Choisir une image de fond'} texte={fond.type === 'image' ? 'Changer' : 'Choisir une image'} testid="import-fond" className="border border-bordure bg-white" onFichier={(f) => void importer(f, { vers: 'fond' })} />
          {fond.type === 'image' ? <Bouton icone="supprimer" libelle="Retirer l’image de fond" texte="Retirer" className="border border-bordure bg-white text-red-800" onClick={a.retirerImageFond} /> : null}
        </div>
      </div>
    </Groupe>
  );
}

export function PanneauCalques() {
  const a = useActions();
  const elements = useStudio((e) => e.document.elements);
  const selection = useStudio((e) => e.selection);
  if (!elements.length) return <Groupe titre="Calques"><p className="text-sm text-attenue">Aucun élément pour l’instant.</p></Groupe>;
  return (
    <Groupe titre="Calques">
      <ul className="space-y-1" data-testid="calques">
        {[...elements].reverse().map((e, i) => (
          <li key={e.id} className={`rounded-lg border ${selection === e.id ? 'border-orange-action bg-white' : 'border-transparent'}`}>
            <div className="flex items-center">
              <button
                type="button"
                aria-pressed={selection === e.id}
                onClick={() => a.selectionner(e.id)}
                className={`min-h-11 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-sm hover:bg-sable focus-visible:outline-2 focus-visible:outline-orange-action lg:min-h-9 ${e.visible ? '' : 'text-attenue line-through'}`}
              >
                {e.type === 'texte' ? e.texte.contenu.replace(/\n/g, ' ') : e.nom}
              </button>
              <Bouton icone={e.visible ? 'oeil' : 'cache'} libelle={`${e.visible ? 'Masquer' : 'Afficher'} ${e.nom}`} onClick={() => a.poserProprietes(e.id, { visible: !e.visible })} className="!min-w-9" />
              <Bouton icone={e.verrouille ? 'verrou' : 'ouvert'} libelle={`${e.verrouille ? 'Déverrouiller' : 'Verrouiller'} ${e.nom}`} onClick={() => a.poserProprietes(e.id, { verrouille: !e.verrouille })} className="!min-w-9" />
            </div>
            {selection === e.id ? (
              <div className="flex gap-1 border-t border-filet p-1">
                <Bouton icone="haut" libelle={`Avancer ${e.nom}`} texte="Avancer" disabled={i === 0} onClick={() => a.reordonner(e.id, 'avancer')} className="flex-1 !text-xs" />
                <Bouton icone="bas" libelle={`Reculer ${e.nom}`} texte="Reculer" disabled={i === elements.length - 1} onClick={() => a.reordonner(e.id, 'reculer')} className="flex-1 !text-xs" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Groupe>
  );
}

export function PanneauFormat() {
  const a = useActions();
  const { support, finition, dimensions, qualite, contraintes } = useStudio((e) => e.document);
  // Le plus exigeant de la distance et du profil d'impression.
  const seuil = seuils(qualite.distanceLectureM, contraintes);
  const finitions = finitionsApplicables(support);
  const min = DIMENSION_MIN_MM / 10;
  const max = DIMENSION_MAX_MM / 10;
  return (
    <Groupe titre="Format">
      <ChampChoix<SupportStudio>
        libelle="Support"
        valeur={support}
        options={SUPPORTS.filter((s) => s.id !== 'AUTRE').map((s) => ({ valeur: s.id as SupportStudio, texte: s.nom }))}
        onValeur={(s) => a.poserSupport(s, finition)}
      />
      <div className="flex flex-wrap gap-1.5">
        {FORMATS[support].map((f) => (
          <Bouton key={f.id} libelle={`Format ${f.nom}`} texte={f.nom} actif={f.largeurMm === dimensions.largeurMm && f.hauteurMm === dimensions.hauteurMm} className="border border-bordure tabular-nums" onClick={() => a.poserFormat(f.largeurMm, f.hauteurMm)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChampNombre libelle="Largeur" unite="cm" valeur={dimensions.largeurMm / 10} min={min} max={max} pas={10} onValeur={(v) => a.poserFormat(v * 10, dimensions.hauteurMm)} />
        <ChampNombre libelle="Hauteur" unite="cm" valeur={dimensions.hauteurMm / 10} min={min} max={max} pas={10} onValeur={(v) => a.poserFormat(dimensions.largeurMm, v * 10)} />
      </div>
      <ChampChoix<FinitionStudio>
        libelle="Finition"
        valeur={finition}
        disabled={finitions.length < 2}
        options={finitions.map((f) => ({ valeur: f, texte: FINITIONS.find((x) => x.id === f)?.nom ?? f }))}
        onValeur={(f) => a.poserSupport(support, f)}
      />
      <ChampChoix<DistanceLecture>
        libelle="Distance de lecture"
        valeur={qualite.distanceLectureM}
        options={[{ valeur: 1, texte: 'De près (1 m)' }, { valeur: 3, texte: 'Quelques mètres (3 m)' }, { valeur: 10, texte: 'De loin (10 m)' }]}
        onValeur={a.poserDistance}
      />
      <p className="text-xs text-attenue" data-testid="seuils">Images : {seuil.min} dpi au moins, {seuil.recommande} conseillés pour cette impression.</p>
    </Groupe>
  );
}

const SEVERITE = {
  critique: { titre: 'Critique', classe: 'border-red-700 text-red-800' },
  avertissement: { titre: 'Avertissement', classe: 'border-alerte text-alerte' },
  info: { titre: 'Information', classe: 'border-bordure text-attenue' },
} as const;

export function PanneauControles() {
  const a = useActions();
  const alertes = useStudio((e) => e.alertes);
  const reperes = useStudio((e) => e.reperes);
  return (
    <Groupe titre="Contrôles avant impression">
      {alertes.length ? (
        <ul className="space-y-2" data-testid="alertes">
          {alertes.map((x) => {
            const s = SEVERITE[x.severite];
            const contenu = <><strong className="block text-xs">{s.titre}</strong>{x.message}</>;
            return (
              <li key={`${x.code}:${x.elementId}`} className={`border-l-2 pl-2 text-sm ${s.classe}`}>
                {x.elementId ? (
                  <button type="button" className="min-h-11 w-full text-left hover:underline focus-visible:outline-2 focus-visible:outline-orange-action lg:min-h-0" onClick={() => a.selectionner(x.elementId)}>{contenu}</button>
                ) : contenu}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-succes">Rien à signaler.</p>}
      <div className="border-t border-filet pt-3 text-xs text-attenue">
        <p><span className="font-semibold text-foret">Tirets verts</span> : zone de sécurité. <span className="font-semibold text-encre">Ronds</span> : œillets. <span className="font-semibold text-orange-action">Bandes orange</span> : ourlets. <span className="font-semibold text-cobalt">Bleu</span> : fourreaux et jonctions de panneaux.</p>
        <div className="mt-2 flex flex-wrap gap-2 text-encre">
          <Bouton libelle={reperes ? 'Masquer les repères' : 'Afficher les repères'} texte={reperes ? 'Masquer les repères' : 'Afficher les repères'} className="border border-bordure" onClick={a.basculerReperes} />
          {/* Sur ordinateur, l'aperçu est dans la barre du haut. */}
          <Bouton libelle="Finaliser ma demande" texte="Finaliser ma demande" className="bg-orange-action text-white hover:bg-orange-action/90 lg:hidden" onClick={() => a.ouvrirFenetre('finaliser')} />
          <Bouton libelle="Aperçu" texte="Aperçu" className="border border-bordure lg:hidden" onClick={() => a.ouvrirFenetre('apercu')} />
        </div>
      </div>
    </Groupe>
  );
}

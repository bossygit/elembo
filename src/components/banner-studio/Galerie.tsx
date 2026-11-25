'use client';

import { useEffect, useMemo, useState } from 'react';

import { CATEGORIES, type CategorieId } from '@/lib/banner/categories';
import { chargerPolices } from '@/lib/banner/navigateur';
import { documentDepuisModele, documentVignette, MODELES_STUDIO, modeleStudio, type ModeleStudio, type Valeurs } from '@/lib/banner/templates';

import { Bouton, ChampLigne, ChampTexte } from './champs';
import { useActions, useContexte, useStudio } from './contexte';
import { Fenetre, PRIMAIRE } from './Fenetre';
import { Vignette } from './Vignette';

const cm = (m: ModeleStudio) => `${m.document.dimensions.largeurMm / 10} × ${m.document.dimensions.hauteurMm / 10} cm`;

export function Galerie({ depart }: { depart: { modele?: string; categorie?: string } }) {
  const a = useActions();
  const { store, images } = useContexte();
  const vide = useStudio((s) => s.document.elements.length === 0);
  const [categorie, setCategorie] = useState<CategorieId | null>(CATEGORIES.find((c) => c.id === depart.categorie)?.id ?? null);
  const [choisi, setChoisi] = useState<ModeleStudio | null>(modeleStudio(depart.modele));
  const [valeurs, setValeurs] = useState<Valeurs>({});
  const [occupe, setOccupe] = useState(false);
  const fermer = () => a.ouvrirFenetre(null);
  const modeles = MODELES_STUDIO.filter((m) => !categorie || m.categorie === categorie);

  // Vignette fidèle : les textes longs y sont réduits comme ils le seront, une fois les polices là.
  const [pret, setPret] = useState<string | null>(null);
  useEffect(() => {
    let actif = true;
    if (choisi) void chargerPolices(choisi.document).then(() => { if (actif) setPret(choisi.id); });
    return () => { actif = false; };
  }, [choisi]);
  const apercu = useMemo(() => {
    if (!choisi) return null;
    return pret === choisi.id ? documentDepuisModele(choisi, valeurs, { id: 'apercu', creeLe: '', modifieLe: '' }, images.mesurer) : documentVignette(choisi);
  }, [choisi, valeurs, pret, images]);

  const utiliser = async (nouveau: boolean) => {
    if (!choisi) return;
    setOccupe(true);
    // Les polices d'abord : la place des textes dépend de leur mesure.
    const echecs = await chargerPolices(choisi.document);
    for (const p of echecs) a.declarerPolice(p, false);
    if (nouveau) {
      // Le projet en cours est enregistré, puis laissé intact.
      await a.enregistrerSiModifie();
      a.nouveau();
    }
    const { document: d } = store.getState();
    const maintenant = new Date().toISOString();
    a.installerModele(documentDepuisModele(choisi, valeurs, { id: d.id, creeLe: d.creeLe, modifieLe: maintenant }, images.mesurer));
    images.notifier();
    fermer();
  };

  if (!choisi || !apercu) {
    return (
      <Fenetre titre="Modèles" fermer={fermer}>
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Catégories">
          <Bouton libelle="Tous" texte="Tous" actif={!categorie} className="border border-bordure !text-xs" onClick={() => setCategorie(null)} />
          {CATEGORIES.map((c) => <Bouton key={c.id} libelle={c.nom} texte={c.nom} actif={categorie === c.id} className="border border-bordure !text-xs" onClick={() => setCategorie(c.id)} />)}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="modeles">
          {modeles.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => { setChoisi(m); setValeurs({}); }} className="block w-full rounded-xl border border-filet bg-white p-2 text-left hover:border-encre focus-visible:outline-2 focus-visible:outline-orange-action">
                <span className="flex h-36 items-center justify-center rounded-lg bg-sable p-2"><Vignette document={documentVignette(m)} className="max-h-full max-w-full shadow" /></span>
                <span className="mt-2 block text-sm font-semibold">{m.nom}</span>
                <span className="block text-xs text-attenue">{m.description}</span>
                <span className="mt-1 block text-xs tabular-nums text-attenue">{cm(m)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Fenetre>
    );
  }

  return (
    <Fenetre
      titre={choisi.nom}
      fermer={fermer}
      pied={
        <>
          <Bouton icone="retour" libelle="Retour aux modèles" texte="Modèles" className="mr-auto border border-bordure" onClick={() => setChoisi(null)} />
          {vide ? null : <Bouton libelle="Remplacer la composition actuelle" texte="Remplacer l’actuelle" className="border border-bordure" disabled={occupe} onClick={() => void utiliser(false)} />}
          <Bouton libelle={vide ? 'Utiliser ce modèle' : 'Créer un nouveau projet'} texte={vide ? 'Utiliser ce modèle' : 'Nouveau projet'} className={PRIMAIRE} disabled={occupe} onClick={() => void utiliser(!vide)} />
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-center rounded-lg bg-sable p-3"><Vignette document={apercu} className="max-h-[46dvh] max-w-full shadow" /></div>
          <p className="mt-2 text-xs text-attenue">{cm(choisi)}. Un texte long sera réduit pour tenir à sa place. Tout reste modifiable ensuite.</p>
          {choisi.document.assets.length ? <p className="mt-1 text-xs text-attenue">La photo d’exemple sera à remplacer par la vôtre.</p> : null}
        </div>
        <div className="space-y-3">
          {choisi.variables.map((v) => {
            const props = { libelle: v.libelle, valeur: valeurs[v.id] ?? v.exemple, maxLength: v.max, onValeur: (x: string) => setValeurs({ ...valeurs, [v.id]: x }) };
            return v.multiligne ? <ChampTexte key={v.id} {...props} /> : <ChampLigne key={v.id} {...props} />;
          })}
        </div>
      </div>
    </Fenetre>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

import { lireDocument, type ResultatLecture } from '@/lib/banner/schema';
import { enregistrerAsset, enregistrerProjet, lireAsset, lireProjet, listerProjets, poserCourant, supprimerProjet, type ResumeProjet } from '@/lib/banner/stockage';
import { lireImage } from '@/lib/banner/navigateur';

import { Bouton } from './champs';
import { chargerProjet } from './chargement';
import { useActions, useContexte, useStudio } from './contexte';
import { Fenetre, PRIMAIRE } from './Fenetre';
import { Vignette } from './Vignette';

const BORD = 'border border-bordure';
const REFUS: Record<Extract<ResultatLecture, { ok: false }>['erreur'], string> = {
  JSON_INVALIDE: 'Ce fichier n’est pas un projet Elembo lisible.',
  SCHEMA_INCONNU: 'Ce fichier n’est pas un projet de banderole Elembo.',
  VERSION_INCONNUE: 'Ce projet vient d’une version non reconnue du Studio.',
  VERSION_FUTURE: 'Ce projet vient d’une version plus récente du Studio : rechargez la page.',
  DOCUMENT_INVALIDE: 'Ce projet contient des données invalides : il n’a pas été importé.',
};
const date = (iso: string) => (Number.isNaN(Date.parse(iso)) ? '' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)));
const nomExport = (nom: string) => `projet-${nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'banderole'}.json`;

export function Projets() {
  const a = useActions();
  const { store, images } = useContexte();
  const courant = useStudio((s) => s.document.id);
  const document = useStudio((s) => s.document);
  const [projets, setProjets] = useState<ResumeProjet[] | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const importer = useRef<HTMLInputElement>(null);
  const relier = useRef<HTMLInputElement>(null);
  const fermer = () => a.ouvrirFenetre(null);
  const rafraichir = () => listerProjets().then(setProjets);
  const manquantes = useStudio((s) => s.document.assets.filter((x) => !x.placeholder && s.charge && !s.disponibles?.has(x.id)).length);

  useEffect(() => {
    let actif = true;
    void store.getState().enregistrerSiModifie().then(listerProjets).then((p) => { if (actif) setProjets(p); });
    return () => { actif = false; };
  }, [store]);

  const ouvrir = async (id: string) => {
    await a.enregistrerSiModifie();
    const lecture = await lireProjet(id);
    if (!lecture?.ok) return setMessage(lecture ? REFUS[lecture.erreur] : 'Ce projet n’est plus sur cet appareil.');
    await poserCourant(id);
    fermer();
    await chargerProjet(store, images, lecture);
  };
  const nouveau = async () => {
    await a.enregistrerSiModifie();
    a.nouveau();
    fermer();
  };
  const dupliquer = async (p: ResumeProjet) => {
    if (!p.document) return;
    const maintenant = new Date().toISOString();
    const avant = courant;
    await enregistrerProjet({ ...p.document, id: crypto.randomUUID(), nom: `${p.nom} (copie)`.slice(0, 120), creeLe: maintenant, modifieLe: maintenant });
    // L'enregistrement a déplacé le « projet courant » : on le remet.
    await poserCourant(avant);
    await rafraichir();
  };
  const supprimer = async (id: string) => {
    await supprimerProjet(id);
    setASupprimer(null);
    if (id === courant) a.nouveau();
    await rafraichir();
  };
  const exporter = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
    const lien = window.document.createElement('a');
    lien.href = url;
    lien.download = nomExport(document.nom);
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const lireFichier = async (f: File) => {
    if (f.size > 1024 * 1024) return setMessage('Ce fichier est trop volumineux pour être un projet Elembo.');
    const lecture = lireDocument(await f.text());
    if (!lecture.ok) return setMessage(REFUS[lecture.erreur]);
    await a.enregistrerSiModifie();
    // Nouvel identifiant : un import n'écrase jamais un projet existant.
    const doc = { ...lecture.document, id: crypto.randomUUID(), modifieLe: new Date().toISOString() };
    await enregistrerProjet(doc);
    await chargerProjet(store, images, { ok: true, document: doc, migre: false });
    const absentes = [];
    for (const x of doc.assets) if (!x.placeholder && !(await lireAsset(x.id))) absentes.push(x.nom);
    if (!absentes.length) return fermer();
    setMessage(`Projet importé. Images à retrouver : ${absentes.join(', ')}.`);
    await rafraichir();
  };
  /** Un projet exporté ne contient pas ses images : on les rattache par empreinte, ou par nom et taille. */
  const rattacher = async (fichiers: File[]) => {
    let n = 0;
    for (const f of fichiers) {
      const lue = await lireImage(f).catch(() => null);
      if (!lue) continue;
      const s = store.getState();
      for (const x of s.document.assets.filter((y) => !y.placeholder && !s.disponibles?.has(y.id))) {
        const meme = lue.sha256 && x.sha256 ? lue.sha256 === x.sha256 : false;
        if (!meme && !(lue.nom === x.nom && lue.largeurPx === x.largeurPx && lue.hauteurPx === x.hauteurPx)) continue;
        await enregistrerAsset(x.id, lue.blob);
        images.poser(x.id, lue.travail);
        a.declarerImage(x.id);
        n++;
      }
    }
    setMessage(n ? `${n} image${n > 1 ? 's' : ''} retrouvée${n > 1 ? 's' : ''}.` : 'Aucun de ces fichiers ne correspond aux images du projet.');
  };

  return (
    <Fenetre titre="Projets" fermer={fermer}>
      <div className="flex flex-wrap gap-1.5">
        <Bouton icone="plus" libelle="Nouveau projet" texte="Nouveau" className={BORD} onClick={() => void nouveau()} />
        <Bouton libelle="Choisir un modèle" texte="Modèles" className={BORD} onClick={() => a.ouvrirFenetre('modeles')} />
        <Bouton libelle="Exporter le projet" texte="Exporter" className={BORD} onClick={exporter} />
        <Bouton libelle="Importer un projet" texte="Importer" className={BORD} onClick={() => importer.current?.click()} />
        <Bouton libelle="Aperçu" texte="Aperçu" className={`${BORD} lg:hidden`} onClick={() => a.ouvrirFenetre('apercu')} />
        <Bouton libelle="Finaliser ma demande" texte="Finaliser ma demande" className={`${PRIMAIRE} lg:hidden`} onClick={() => a.ouvrirFenetre('finaliser')} />
        <input ref={importer} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Fichier de projet à importer" data-testid="import-projet" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lireFichier(f); }} />
      </div>
      <p className="mt-2 text-xs text-attenue">Vos projets sont conservés sur cet appareil uniquement. Un fichier exporté contient la composition, pas les images : gardez-les.</p>
      {message ? <p role="alert" className="mt-3 rounded-lg bg-sable p-2 text-sm">{message}</p> : null}
      {manquantes ? (
        <div className="mt-2">
          <Bouton libelle="Retrouver les images du projet" texte={`Retrouver ${manquantes} image${manquantes > 1 ? 's' : ''}`} className={BORD} onClick={() => relier.current?.click()} />
          <input ref={relier} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Images du projet" data-testid="relier-images" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void rattacher(f); }} />
        </div>
      ) : null}
      {projets === null ? <p className="mt-4 text-sm text-attenue">Lecture des projets…</p> : projets.length === 0 ? <p className="mt-4 text-sm text-attenue">Aucun projet enregistré pour l’instant.</p> : (
        <ul className="mt-4 space-y-2" data-testid="projets">
          {projets.map((p) => (
            <li key={p.id} className={`rounded-xl border bg-white p-2 ${p.id === courant ? 'border-orange-action' : 'border-filet'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-sable p-1">{p.document ? <Vignette document={p.document} className="max-h-full max-w-full" /> : null}</span>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate text-sm font-semibold">{p.nom}</span>
                  <span className="block text-xs text-attenue">{p.document ? `${p.document.dimensions.largeurMm / 10} × ${p.document.dimensions.hauteurMm / 10} cm · ` : ''}{date(p.modifieLe)}{p.id === courant ? ' · ouvert' : ''}</span>
                  {p.envoi ? <span className="block text-xs text-succes">Demande {p.envoi.reference} envoyée</span> : null}
                </span>
                {aSupprimer === p.id ? (
                  <span className="flex flex-wrap items-center gap-1.5 text-sm">
                    Supprimer ?
                    <Bouton libelle={`Confirmer la suppression de ${p.nom}`} texte="Oui, supprimer" className="border border-red-700 text-red-800" onClick={() => void supprimer(p.id)} />
                    <Bouton libelle="Ne pas supprimer" texte="Non" className={BORD} onClick={() => setASupprimer(null)} />
                  </span>
                ) : (
                  <span className="flex gap-1">
                    {p.id === courant ? null : <Bouton libelle={`Ouvrir ${p.nom}`} texte="Ouvrir" className={BORD} disabled={!p.document} onClick={() => void ouvrir(p.id)} />}
                    <Bouton icone="copier" libelle={`Dupliquer ${p.nom}`} disabled={!p.document} onClick={() => void dupliquer(p)} />
                    <Bouton icone="supprimer" libelle={`Supprimer ${p.nom}`} onClick={() => setASupprimer(p.id)} />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Fenetre>
  );
}

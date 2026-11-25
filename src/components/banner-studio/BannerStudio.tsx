'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { chargerPolice, chargerPolices, copieTravail, mesureurNavigateur } from '@/lib/banner/navigateur';
import { enregistrerProjet, lireAsset, lireProjetCourant, menage } from '@/lib/banner/stockage';
import { creerStudio, type StudioStore } from '@/stores/banner-studio-store';

import { Bouton, type NomIcone } from './champs';
import { FournisseurStudio, Images, useActions, useMedia, useSelection, useStudio } from './contexte';
import { Inspecteur } from './Inspecteur';
import { PanneauAjouter, PanneauCalques, PanneauControles, PanneauFormat } from './Panneaux';
import { EPAISSEUR_REGLE, Regle } from './Regles';
import { StudioCanvas } from './StudioCanvas';
import { StudioTopBar } from './StudioTopBar';

/** Charge le dernier projet, ses polices et ses images, puis fait le ménage du stockage. */
async function charger(store: StudioStore, images: Images, actif: () => boolean) {
  const lecture = await lireProjetCourant();
  if (!actif()) return;
  store.getState().ouvrir(lecture);
  const doc = store.getState().document;
  await Promise.all([
    // Police du prochain texte ajouté : prête avant sa première mesure.
    chargerPolice({ policeId: 'montserrat', graisse: 700, contenu: 'Votre texte' }),
    chargerPolices(doc).then(() => images.notifier()),
    ...doc.assets.map(async (a) => {
      const blob = await lireAsset(a.id);
      const copie = blob ? await copieTravail(blob).catch(() => null) : null;
      if (!copie || !actif()) return;
      images.poser(a.id, copie.travail);
      store.getState().declarerImage(a.id);
    }),
  ]);
  if (!actif()) return;
  store.getState().chargementFini();
  void menage();
}

/** Raccourcis : ignorés dès que l'utilisateur saisit du texte ou qu'une fenêtre est ouverte. */
function raccourci(store: StudioStore, ev: KeyboardEvent): boolean {
  const cible = ev.target as HTMLElement | null;
  const saisie = !!cible?.closest('input:not([type=color]), textarea, select, dialog, [contenteditable]');
  const s = store.getState();
  const cmd = ev.ctrlKey || ev.metaKey;
  const k = ev.key.toLowerCase();
  if (cmd && k === 's') { void s.enregistrerMaintenant(); return true; }
  if (saisie) return false;
  if (cmd && k === 'z') { if (ev.shiftKey) s.retablir(); else s.annuler(); return true; }
  if (cmd && k === 'y') { s.retablir(); return true; }
  if (cmd && k === 'd' && s.selection) { s.dupliquer(); return true; }
  if (cmd && k === '0') { s.ajusterVue(); return true; }
  if (cmd && (k === '+' || k === '=')) { s.zoomer(1.25); return true; }
  if (cmd && k === '-') { s.zoomer(1 / 1.25); return true; }
  if (cmd || ev.altKey) return false;
  if (k === 'escape') { s.selectionner(null); return true; }
  if (!s.selection) return false;
  if (k === 'delete' || k === 'backspace') { s.supprimer(); return true; }
  const pas = ev.shiftKey ? 100 : 10;
  const fleches: Record<string, [number, number]> = { arrowleft: [-pas, 0], arrowright: [pas, 0], arrowup: [0, -pas], arrowdown: [0, pas] };
  if (fleches[k]) { s.decaler(...fleches[k]); return true; }
  if (ev.key === ']') { s.reordonner(s.selection, 'avancer'); return true; }
  if (ev.key === '[') { s.reordonner(s.selection, 'reculer'); return true; }
  return false;
}

export default function BannerStudio() {
  const [studio] = useState(() => ({ store: creerStudio({ mesurer: mesureurNavigateur, enregistrer: enregistrerProjet }), images: new Images() }));
  const { store, images } = studio;

  useEffect(() => {
    let actif = true;
    void charger(store, images, () => actif);
    const clavier = (ev: KeyboardEvent) => { if (!ev.defaultPrevented && raccourci(store, ev)) ev.preventDefault(); };
    // Fermeture ou changement d'onglet : on n'attend pas la temporisation.
    const quitter = () => { if (document.visibilityState === 'hidden' && store.getState().sauvegarde === 'modifie') void store.getState().enregistrerMaintenant(); };
    const avertir = (ev: BeforeUnloadEvent) => {
      const s = store.getState();
      if (s.sauvegarde === 'modifie') void s.enregistrerMaintenant();
      // Seul cas de perte réelle : rien ne peut être conservé sur cet appareil.
      if (s.sauvegarde === 'memoire') ev.preventDefault();
    };
    window.addEventListener('keydown', clavier);
    document.addEventListener('visibilitychange', quitter);
    window.addEventListener('beforeunload', avertir);
    return () => {
      actif = false;
      window.removeEventListener('keydown', clavier);
      document.removeEventListener('visibilitychange', quitter);
      window.removeEventListener('beforeunload', avertir);
      // Navigation interne (retour aux banderoles) : le composant disparaît sans événement de page.
      if (store.getState().sauvegarde === 'modifie') void store.getState().enregistrerMaintenant();
    };
  }, [store, images]);

  return (
    <FournisseurStudio value={studio}>
      <Coque />
    </FournisseurStudio>
  );
}

type Onglet = 'ajouter' | 'calques' | 'format' | 'controles' | 'reglages';
const ONGLETS: { id: Exclude<Onglet, 'reglages'>; nom: string; icone: NomIcone }[] = [
  { id: 'ajouter', nom: 'Ajouter', icone: 'plus' },
  { id: 'calques', nom: 'Calques', icone: 'calques' },
  { id: 'format', nom: 'Format', icone: 'format' },
  { id: 'controles', nom: 'Contrôles', icone: 'controles' },
];

function Coque() {
  const large = useMedia('(min-width: 1024px)');
  // Téléphone couché : le panneau passe à côté du plan de travail, pas dessous.
  const couche = useMedia('(max-height: 520px)');
  const [gauche, setGauche] = useState<Exclude<Onglet, 'reglages'>>('ajouter');
  const [feuille, setFeuille] = useState<Onglet | null>(null);
  const message = useStudio((e) => e.message);
  const critiques = useStudio((e) => e.alertes.filter((x) => x.severite === 'critique').length);
  const vide = useStudio((e) => e.charge && e.document.elements.length === 0);
  const a = useActions();

  const panneau = (o: Onglet, apres?: () => void): ReactNode => {
    if (o === 'ajouter') return <PanneauAjouter apres={apres} />;
    if (o === 'calques') return <PanneauCalques />;
    if (o === 'format') return <PanneauFormat />;
    if (o === 'controles') return <PanneauControles />;
    return <Inspecteur />;
  };

  const annonces = (
    <>
      <p className="sr-only" aria-live="polite">{critiques ? `${critiques} problème${critiques > 1 ? 's' : ''} critique${critiques > 1 ? 's' : ''} avant impression` : ''}</p>
      {message ? (
        <div role="alert" className="flex items-center gap-2 border-b border-filet bg-sable px-3 py-1 text-sm">
          <p className="flex-1">{message}</p>
          <Bouton icone="fermer" libelle="Fermer le message" onClick={() => a.annoncer(null)} />
        </div>
      ) : null}
    </>
  );

  const invite = vide ? (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <p className="rounded-xl bg-encre/85 px-4 py-2 text-center text-sm text-creme">Ajoutez un texte, une image ou une forme. Glissez pour déplacer, tirez les poignées pour agrandir.</p>
    </div>
  ) : null;

  if (large) {
    return (
      <div className="grid h-dvh grid-rows-[auto_auto_1fr] overflow-hidden">
        <StudioTopBar compact={false} onControles={() => setGauche('controles')} />
        <div>{annonces}</div>
        <div className="grid min-h-0 grid-cols-[17rem_minmax(0,1fr)_18rem]">
          <aside aria-label="Outils" className="flex min-h-0 flex-col border-r border-filet bg-creme">
            <div role="tablist" aria-label="Outils du Studio" className="grid grid-cols-4 border-b border-filet">
              {ONGLETS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  id={`onglet-${o.id}`}
                  aria-selected={gauche === o.id}
                  aria-controls="panneau-outils"
                  onClick={() => setGauche(o.id)}
                  className={`min-h-11 border-b-2 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-action ${gauche === o.id ? 'border-orange-action' : 'border-transparent text-attenue hover:bg-sable'}`}
                >
                  {o.nom}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="panneau-outils" aria-labelledby={`onglet-${gauche}`} className="min-h-0 flex-1 overflow-y-auto">{panneau(gauche)}</div>
          </aside>
          <main className="grid min-h-0 min-w-0 bg-sable" style={{ gridTemplateColumns: `${EPAISSEUR_REGLE}px minmax(0,1fr)`, gridTemplateRows: `${EPAISSEUR_REGLE}px minmax(0,1fr)` }}>
            <span className="bg-creme text-center text-[9px] leading-[22px] text-attenue" aria-hidden="true">cm</span>
            <div className="overflow-hidden bg-creme"><Regle axe="x" /></div>
            <div className="overflow-hidden bg-creme"><Regle axe="y" /></div>
            <div className="relative min-h-0 min-w-0"><StudioCanvas />{invite}</div>
          </main>
          <aside aria-label="Propriétés" className="min-h-0 overflow-y-auto border-l border-filet bg-creme"><Inspecteur /></aside>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <StudioTopBar compact onControles={() => setFeuille('controles')} />
      {annonces}
      <div className={`flex min-h-0 flex-1 ${couche ? 'flex-row' : 'flex-col'}`}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1 bg-sable"><StudioCanvas />{invite}</main>
          {feuille === 'reglages' ? null : <BarreElement ouvrir={() => setFeuille('reglages')} />}
        </div>
        {feuille ? (
          <section aria-label={feuille === 'reglages' ? 'Propriétés' : ONGLETS.find((o) => o.id === feuille)?.nom} className={`relative flex flex-col border-filet bg-creme ${couche ? 'w-80 max-w-[50vw] border-l' : 'max-h-[46dvh] border-t'}`}>
            <Bouton icone="fermer" libelle="Fermer le panneau" onClick={() => setFeuille(null)} className="absolute right-1 top-1 z-10 bg-creme" />
            <div className="min-h-0 overflow-y-auto overscroll-contain">{panneau(feuille, () => setFeuille(null))}</div>
          </section>
        ) : null}
      </div>
      <nav aria-label="Outils du Studio" className="grid grid-cols-4 border-t border-filet bg-creme pb-[env(safe-area-inset-bottom)]">
        {ONGLETS.map((o) => (
          <Bouton key={o.id} icone={o.icone} libelle={o.nom} texte={o.nom} actif={feuille === o.id} className="!min-h-14 flex-col !gap-0.5 !rounded-none !px-0 !text-xs" onClick={() => setFeuille(feuille === o.id ? null : o.id)} />
        ))}
      </nav>
    </div>
  );
}

/** Mobile : actions de l'élément sélectionné, sans panneau permanent. */
function BarreElement({ ouvrir }: { ouvrir: () => void }) {
  const e = useSelection();
  const a = useActions();
  if (!e) return null;
  return (
    <div role="toolbar" aria-label="Élément sélectionné" className="flex items-center gap-1 border-t border-filet bg-creme px-2">
      <p className="min-w-0 flex-1 truncate text-sm">{e.type === 'texte' ? e.texte.contenu.replace(/\n/g, ' ') : e.nom}</p>
      <Bouton icone="reglages" libelle="Modifier l’élément" onClick={ouvrir} />
      <Bouton icone="copier" libelle="Dupliquer" onClick={() => a.dupliquer()} />
      <Bouton icone="supprimer" libelle="Supprimer" disabled={e.verrouille} onClick={() => a.supprimer()} />
    </div>
  );
}
